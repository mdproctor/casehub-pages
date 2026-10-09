import { LitElement, css, html, type TemplateResult } from 'lit';
import { property, state } from 'lit/decorators.js';
import { Editor, rootCtx, defaultValueCtx, editorViewCtx, serializerCtx, parserCtx } from '@milkdown/kit/core';
import { commonmark } from '@milkdown/kit/preset/commonmark';
import { gfm } from '@milkdown/kit/preset/gfm';
import { history } from '@milkdown/kit/plugin/history';
import { listener, listenerCtx } from '@milkdown/kit/plugin/listener';
import { EDITABLE_TEXT } from '@casehubio/pages-editor-core';
import type { EditableText } from '@casehubio/pages-editor-core';
import { MarkdownEditorBridge } from './markdown-editor-bridge.js';
import { buildScrollAnchors, interpolateScroll } from './scroll-sync.js';
import type { HeadingInfo } from './scroll-sync.js';
import './toolbar/editor-toolbar.js';

export class PagesMarkdownEditor extends LitElement {
  @property({ type: String }) value = '';
  @property({ type: String }) mode: 'wysiwyg' | 'source' | 'split' = 'wysiwyg';
  @property({ type: Boolean, reflect: true }) readonly = false;
  @property({ type: String }) label: string | undefined;

  private _editor: Editor | null = null;
  private _bridge: MarkdownEditorBridge | null = null;
  private _sourceElement: HTMLElement | null = null;
  private _sourceImported = false;
  private _syncTimer: ReturnType<typeof setTimeout> | null = null;
  private _syncing = false;
  private _splitCleanup: (() => void) | undefined;
  private _scrollSyncCleanup: (() => void) | undefined;
  @state() private _activeMode: 'wysiwyg' | 'source' | 'split' = 'wysiwyg';

  static override styles = css`
    :host {
      display: flex;
      flex-direction: column;
      min-height: 200px;
    }
    editor-toolbar {
      border-bottom: 1px solid var(--pages-neutral-5, #d4d4d4);
      background: var(--pages-neutral-2, #f5f5f5);
      flex-shrink: 0;
    }
    .editor-host {
      flex: 1;
      overflow: auto;
    }
    .editor-host .milkdown {
      padding: 8px 12px;
      outline: none;
      min-height: 100%;
    }
    .editor-host .milkdown .ProseMirror,
    .editor-host .milkdown .ProseMirror:focus-visible {
      outline: none;
    }
    .editor-host .milkdown table {
      border-collapse: collapse;
      width: 100%;
      margin: 0.5em 0;
    }
    .editor-host .milkdown th,
    .editor-host .milkdown td {
      border: 1px solid var(--pages-neutral-5, rgba(115, 119, 127, 0.2));
      padding: 4px 16px;
      text-align: left;
    }
    .editor-host .milkdown th {
      font-weight: 700;
      background: var(--pages-neutral-2, #f5f5f5);
    }
    .editor-host .milkdown h1,
    .editor-host .milkdown h2 {
      border-bottom: 1px solid var(--pages-neutral-5, #d4d4d4);
      padding-bottom: 0.3em;
      margin: 1em 0 0.5em;
    }
    .editor-host .milkdown h3 {
      margin: 0.8em 0 0.4em;
    }
    .editor-host .milkdown p {
      margin: 0.5em 0;
    }
    .editor-host .milkdown ul,
    .editor-host .milkdown ol {
      margin: 0.5em 0;
      padding-left: 1.5em;
    }
    .editor-host .milkdown li {
      margin: 0.2em 0;
    }
    .editor-host .milkdown blockquote {
      border-left: 3px solid var(--pages-accent-8, #6366f1);
      margin: 0.5em 0;
      padding: 0.25em 1em;
      color: var(--pages-neutral-9, #9ca3af);
    }
    .editor-host .milkdown code {
      background: var(--pages-neutral-2, #f5f5f5);
      border-radius: 3px;
      padding: 2px 4px;
      font-size: 0.875em;
    }
    .editor-host .milkdown pre {
      background: var(--pages-neutral-2, #f5f5f5);
      border-radius: 4px;
      padding: 12px 16px;
      overflow-x: auto;
      margin: 0.5em 0;
    }
    .editor-host .milkdown pre code {
      background: none;
      padding: 0;
    }
    .editor-host .milkdown hr {
      border: none;
      border-top: 1px solid var(--pages-neutral-5, #d4d4d4);
      margin: 1em 0;
    }
    .source-host {
      flex: 1;
      overflow: hidden;
    }
    .single-wrapper {
      display: flex;
      flex-direction: column;
      flex: 1;
      overflow: hidden;
    }
    .split-wrapper {
      display: flex;
      flex: 1;
      overflow: hidden;
    }
    .split-wrapper > .editor-host,
    .split-wrapper > .source-host {
      flex: 1;
      min-width: 0;
      overflow: auto;
    }
    .single-wrapper > .editor-host {
      flex: 1;
      overflow: auto;
    }
    .split-divider {
      width: 4px;
      background: var(--pages-neutral-5, #d4d4d4);
      cursor: col-resize;
      flex-shrink: 0;
    }
    .split-divider:hover {
      background: var(--pages-accent-8, #adc8ff);
    }
    .overlay-layer {
      position: relative;
      pointer-events: none;
    }
    [hidden] {
      display: none !important;
    }
  `;

  override render(): TemplateResult {
    const isSplit = this._activeMode === 'split';
    const showSource = this._activeMode === 'source';
    const hideEditor = showSource;
    return html`
      <editor-toolbar .editor=${this._editor} ?hidden=${showSource} role="toolbar" aria-label="Formatting"></editor-toolbar>
      <div class="${isSplit ? 'split-wrapper' : 'single-wrapper'}">
        <div class="editor-host" ?hidden=${hideEditor}></div>
        ${isSplit ? html`<div class="split-divider"></div>` : ''}
        <div class="source-host" ?hidden=${!showSource && !isSplit}></div>
      </div>
      <div class="overlay-layer"></div>
    `;
  }

  override async firstUpdated() {
    const host = this.renderRoot.querySelector('.editor-host') as HTMLElement;
    if (!host) return;

    this._editor = await Editor.make()
      .config((ctx) => {
        ctx.set(rootCtx, host);
        ctx.set(defaultValueCtx, this.value);
        ctx.get(listenerCtx).markdownUpdated((_ctx, md) => {
          this.value = md;
          this.dispatchEvent(
            new CustomEvent('input', {
              bubbles: true,
              composed: true,
              detail: { value: md },
            }),
          );
        });
      })
      .use(commonmark)
      .use(gfm)
      .use(history)
      .use(listener)
      .create();

    const view = this._editor.ctx.get(editorViewCtx);
    const serializer = this._editor.ctx.get(serializerCtx);
    const parser = this._editor.ctx.get(parserCtx);
    this._bridge = new MarkdownEditorBridge(
      view,
      (doc) => serializer(doc),
      (text) => parser(text),
    );
    (this as any)[EDITABLE_TEXT] = this._bridge;
  }

  async setMode(newMode: 'wysiwyg' | 'source' | 'split'): Promise<void> {
    if (newMode === this._activeMode) return;

    if (this._activeMode === 'split') {
      this._teardownSplit();
    }

    if (newMode === 'source') {
      await this._switchToSource();
    } else if (newMode === 'split') {
      await this._switchToSplit();
    } else if (newMode === 'wysiwyg') {
      this._switchToWysiwyg();
    }
  }

  getActiveBridge(): EditableText | null {
    return (this as any)[EDITABLE_TEXT] ?? null;
  }

  protected async _importSourceEditor(): Promise<void> {
    await import('@casehubio/pages-code-editor');
  }

  private async _switchToSource(): Promise<void> {
    const markdown = this._bridge ? this._bridge.getText() : this.value;

    try {
      if (!this._sourceImported) {
        await this._importSourceEditor();
        this._sourceImported = true;
      }
    } catch {
      this.mode = 'wysiwyg';
      this._activeMode = 'wysiwyg';
      this.dispatchEvent(new CustomEvent('mode-changed', {
        bubbles: true,
        composed: true,
        detail: { mode: 'wysiwyg', error: 'source-unavailable' },
      }));
      return;
    }

    this._activeMode = 'source';
    this.mode = 'source';
    if (this.isConnected) {
      await this.updateComplete;
    }
    const sourceHost = this.renderRoot?.querySelector('.source-host') as HTMLElement;
    if (!sourceHost) {
      this.dispatchEvent(new CustomEvent('mode-changed', {
        bubbles: true,
        composed: true,
        detail: { mode: 'source' },
      }));
      return;
    }

    if (this._sourceElement?.parentNode) {
      this._sourceElement.parentNode.removeChild(this._sourceElement);
    }

    const codeEditor = document.createElement('pages-code-editor') as any;
    codeEditor.value = markdown;
    codeEditor.language = 'markdown';
    codeEditor.setAttribute('style', 'height: 100%; border: none; resize: none;');
    if (this.label) codeEditor.label = this.label;
    sourceHost.appendChild(codeEditor);
    this._sourceElement = codeEditor;

    codeEditor.addEventListener('input', () => {
      this.value = codeEditor.value;
      this.dispatchEvent(new CustomEvent('input', {
        bubbles: true,
        composed: true,
        detail: { value: codeEditor.value },
      }));
    });

    if (codeEditor.updateComplete) {
      await codeEditor.updateComplete;
    }

    if (codeEditor[EDITABLE_TEXT]) {
      (this as any)[EDITABLE_TEXT] = codeEditor[EDITABLE_TEXT];
    }

    this.dispatchEvent(new CustomEvent('mode-changed', {
      bubbles: true,
      composed: true,
      detail: { mode: 'source' },
    }));
  }

  private _switchToWysiwyg(): void {
    const markdown = this._sourceElement
      ? (this._sourceElement as any).value ?? this.value
      : this.value;

    if (this._sourceElement?.parentNode) {
      this._sourceElement.parentNode.removeChild(this._sourceElement);
    }
    this._sourceElement = null;

    if (this._bridge) {
      this._bridge.setContent(markdown);
      (this as any)[EDITABLE_TEXT] = this._bridge;
    }

    this.mode = 'wysiwyg';
    this._activeMode = 'wysiwyg';
    this.dispatchEvent(new CustomEvent('mode-changed', {
      bubbles: true,
      composed: true,
      detail: { mode: 'wysiwyg' },
    }));
  }

  private async _switchToSplit(): Promise<void> {
    try {
      if (!this._sourceImported) {
        await this._importSourceEditor();
        this._sourceImported = true;
      }
    } catch {
      this.mode = 'wysiwyg';
      this._activeMode = 'wysiwyg';
      this.dispatchEvent(new CustomEvent('mode-changed', {
        bubbles: true,
        composed: true,
        detail: { mode: 'wysiwyg', error: 'source-unavailable' },
      }));
      return;
    }

    const markdown = this._bridge ? this._bridge.getText() : this.value;

    this._activeMode = 'split';
    this.mode = 'split';
    if (this.isConnected) {
      await this.updateComplete;
    }

    const sourceHost = this.renderRoot?.querySelector('.source-host') as HTMLElement;
    if (!sourceHost) {
      this.dispatchEvent(new CustomEvent('mode-changed', {
        bubbles: true,
        composed: true,
        detail: { mode: 'split' },
      }));
      return;
    }

    if (this._sourceElement?.parentNode) {
      this._sourceElement.parentNode.removeChild(this._sourceElement);
    }

    const codeEditor = document.createElement('pages-code-editor') as any;
    codeEditor.value = markdown;
    codeEditor.language = 'markdown';
    codeEditor.setAttribute('style', 'height: 100%; border: none; resize: none; outline: none;');
    if (this.label) codeEditor.label = `${this.label} (source)`;
    sourceHost.appendChild(codeEditor);
    this._sourceElement = codeEditor;

    const suppressCodeEditorFocus = () => {
      if (codeEditor.shadowRoot) {
        const style = document.createElement('style');
        style.textContent = '.cm-editor.cm-focused { outline: none !important; }';
        codeEditor.shadowRoot.appendChild(style);
      }
    };
    if (codeEditor.updateComplete) {
      codeEditor.updateComplete.then(suppressCodeEditorFocus);
    } else {
      requestAnimationFrame(suppressCodeEditorFocus);
    }

    this._setupSplitSync(codeEditor);

    this.dispatchEvent(new CustomEvent('mode-changed', {
      bubbles: true,
      composed: true,
      detail: { mode: 'split' },
    }));
  }

  private _setupSplitSync(codeEditor: any): void {
    const wysiwygListener = () => {
      if (this._syncing) return;
      this._debouncedSync(() => {
        if (!this._bridge || !codeEditor) return;
        this._syncing = true;
        try {
          const md = this._bridge.getText();
          if (codeEditor.value !== md) {
            codeEditor.value = md;
          }
        } finally {
          requestAnimationFrame(() => {
            requestAnimationFrame(() => { this._syncing = false; });
          });
        }
      });
    };

    const sourceListener = () => {
      if (this._syncing) return;
      this._debouncedSync(() => {
        if (!this._bridge || !codeEditor) return;
        this._syncing = true;
        try {
          const md = codeEditor.value;
          if (this._bridge.getText() !== md) {
            this._bridge.setContent(md);
          }
        } finally {
          requestAnimationFrame(() => {
            requestAnimationFrame(() => { this._syncing = false; });
          });
        }
      });
    };

    this.addEventListener('input', wysiwygListener);
    codeEditor.addEventListener('input', sourceListener);

    this._setupScrollSync(codeEditor);

    this._splitCleanup = () => {
      this.removeEventListener('input', wysiwygListener);
      codeEditor.removeEventListener('input', sourceListener);
      if (this._scrollSyncCleanup) {
        this._scrollSyncCleanup();
        this._scrollSyncCleanup = undefined;
      }
    };
  }

  private _debouncedSync(fn: () => void): void {
    if (this._syncTimer) clearTimeout(this._syncTimer);
    this._syncTimer = setTimeout(fn, 150);
  }

  private _setupScrollSync(codeEditor: any): void {
    const editorHost = this.renderRoot?.querySelector('.editor-host') as HTMLElement | null;
    if (!editorHost) return;

    let scrollSyncing = false;

    const getScrollableSource = () =>
      codeEditor.shadowRoot?.querySelector('.cm-scroller') ?? codeEditor;

    const getSourceLineHeight = (): number => {
      const cmLine = codeEditor.shadowRoot?.querySelector('.cm-line');
      return cmLine ? cmLine.getBoundingClientRect().height : 17;
    };

    const extractWysiwygHeadings = (): HeadingInfo[] => {
      const milkdown = editorHost.querySelector('.milkdown');
      if (!milkdown) return [];
      const hostRect = editorHost.getBoundingClientRect();
      return Array.from(milkdown.querySelectorAll('h1, h2, h3, h4'))
        .map(el => ({
          text: (el.textContent ?? '').toLowerCase().trim(),
          offsetTop: el.getBoundingClientRect().top - hostRect.top + editorHost.scrollTop,
        }));
    };

    const extractSourceHeadings = (): HeadingInfo[] => {
      if (!codeEditor.value) return [];
      const lines = (codeEditor.value as string).split('\n');
      const headings: HeadingInfo[] = [];
      const lineHeight = getSourceLineHeight();
      for (let i = 0; i < lines.length; i++) {
        const match = lines[i]!.match(/^#{1,4}\s+(.+)/);
        if (match) {
          headings.push({
            text: match[1]!.toLowerCase().trim(),
            offsetTop: i * lineHeight,
          });
        }
      }
      return headings;
    };

    const buildAnchorsWithBoundaries = (
      sourceHeadings: HeadingInfo[],
      targetHeadings: HeadingInfo[],
      sourceMax: number,
      targetMax: number,
    ) => {
      const inner = buildScrollAnchors(sourceHeadings, targetHeadings);
      const anchors = [{ sourceOffset: 0, targetOffset: 0 }];
      for (const a of inner) anchors.push(a);
      anchors.push({ sourceOffset: sourceMax, targetOffset: targetMax });
      return anchors;
    };

    const onWysiwygScroll = () => {
      if (scrollSyncing) return;
      scrollSyncing = true;
      const srcEl = getScrollableSource();
      const wysMax = editorHost.scrollHeight - editorHost.clientHeight;
      const srcMax = srcEl.scrollHeight - srcEl.clientHeight;
      const anchors = buildAnchorsWithBoundaries(
        extractWysiwygHeadings(), extractSourceHeadings(), wysMax, srcMax);
      const target = interpolateScroll(editorHost.scrollTop, anchors);
      srcEl.scrollTop = Math.max(0, Math.min(srcMax, target));
      requestAnimationFrame(() => { requestAnimationFrame(() => { scrollSyncing = false; }); });
    };

    const onSourceScroll = () => {
      if (scrollSyncing) return;
      scrollSyncing = true;
      const srcEl = getScrollableSource();
      const wysMax = editorHost.scrollHeight - editorHost.clientHeight;
      const srcMax = srcEl.scrollHeight - srcEl.clientHeight;
      const anchors = buildAnchorsWithBoundaries(
        extractSourceHeadings(), extractWysiwygHeadings(), srcMax, wysMax);
      const target = interpolateScroll(srcEl.scrollTop, anchors);
      editorHost.scrollTop = Math.max(0, Math.min(wysMax, target));
      requestAnimationFrame(() => { requestAnimationFrame(() => { scrollSyncing = false; }); });
    };

    editorHost.addEventListener('scroll', onWysiwygScroll, { passive: true });

    const attachSourceScroll = () => {
      const codeEditorEl = codeEditor.shadowRoot?.querySelector('.cm-scroller');
      if (codeEditorEl) {
        codeEditorEl.addEventListener('scroll', onSourceScroll, { passive: true });
        this._scrollSyncCleanup = () => {
          editorHost.removeEventListener('scroll', onWysiwygScroll);
          codeEditorEl.removeEventListener('scroll', onSourceScroll);
        };
      } else {
        this._scrollSyncCleanup = () => {
          editorHost.removeEventListener('scroll', onWysiwygScroll);
        };
      }
    };

    if (codeEditor.updateComplete) {
      codeEditor.updateComplete.then(attachSourceScroll);
    } else {
      requestAnimationFrame(attachSourceScroll);
    }

    this._scrollSyncCleanup = () => {
      editorHost.removeEventListener('scroll', onWysiwygScroll);
    };
  }

  private _teardownSplit(): void {
    if (this._syncTimer) {
      clearTimeout(this._syncTimer);
      this._syncTimer = null;
    }
    const cleanup = this._splitCleanup;
    if (typeof cleanup === 'function') {
      cleanup();
      this._splitCleanup = undefined;
    }
    if (this._sourceElement?.parentNode) {
      this._sourceElement.parentNode.removeChild(this._sourceElement);
    }
    this._sourceElement = null;
    this._syncing = false;
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this._teardownSplit();
    this._editor?.destroy();
    this._editor = null;
    this._sourceElement = null;
  }
}

if (!customElements.get('pages-markdown-editor')) {
  customElements.define('pages-markdown-editor', PagesMarkdownEditor);
}
