import { LitElement, html, css, type PropertyValues } from 'lit';
import { property } from 'lit/decorators.js';
import { EditorView, lineNumbers as cmLineNumbers, keymap } from '@codemirror/view';
import { EditorState, Compartment, type Extension } from '@codemirror/state';
import { indentUnit, syntaxHighlighting, HighlightStyle } from '@codemirror/language';
import { yaml } from '@codemirror/lang-yaml';
import { json } from '@codemirror/lang-json';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { tags } from '@lezer/highlight';

const pagesHighlightStyle = HighlightStyle.define([
  { tag: tags.propertyName, color: 'var(--pages-accent-11, #3451b2)' },
  { tag: tags.string, color: 'var(--pages-success-11, #18794e)' },
  { tag: tags.number, color: 'var(--pages-warning-11, #ad5700)' },
  { tag: tags.bool, color: 'var(--pages-warning-11, #ad5700)' },
  { tag: tags.null, color: 'var(--pages-neutral-8, #8b8b8b)' },
  { tag: tags.comment, color: 'var(--pages-info-9, #0091ff)', fontStyle: 'italic' },
  { tag: tags.punctuation, color: 'var(--pages-neutral-9, #6f6f6f)' },
  { tag: tags.keyword, color: 'var(--pages-danger-11, #cd2b31)' },
]);

const pagesTheme = EditorView.theme({
  '&': {
    height: '100%',
    fontFamily: 'var(--pages-font-mono, ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace)',
    fontSize: 'var(--pages-font-size-sm, 13px)',
    backgroundColor: 'var(--pages-neutral-1, #fafafa)',
    color: 'var(--pages-neutral-12, #1a1a1a)',
  },
  '.cm-scroller': {
    overflow: 'auto',
  },
  '.cm-gutters': {
    backgroundColor: 'var(--pages-neutral-2, #f5f5f5)',
    color: 'var(--pages-neutral-8, #8b8b8b)',
    borderRight: '1px solid var(--pages-neutral-4, #e0e0e0)',
  },
  '.cm-activeLineGutter': {
    backgroundColor: 'var(--pages-neutral-3, #eeeeee)',
  },
  '.cm-activeLine': {
    backgroundColor: 'var(--pages-neutral-3, #eeeeee)',
  },
  '&.cm-focused': {
    outline: '2px solid var(--pages-accent-8, #adc8ff)',
    outlineOffset: '-2px',
  },
  '.cm-cursor': {
    borderLeftColor: 'var(--pages-neutral-12, #1a1a1a)',
  },
  '.cm-selectionBackground': {
    backgroundColor: 'var(--pages-accent-4, #e1ecff) !important',
  },
});

function languageExtension(lang: string): Extension {
  return lang === 'json' ? json() : yaml();
}

export class PagesCodeEditor extends LitElement {
  static override styles = css`
    :host {
      display: block;
      position: relative;
      height: 300px;
      overflow: hidden;
      resize: vertical;
      border: 1px solid var(--pages-neutral-6, #d0d0d0);
      border-radius: var(--pages-radius-md, 6px);
    }
    :host([readonly]) {
      resize: none;
    }
    .cm-host {
      height: 100%;
    }
  `;

  @property({ type: String })
  value = '';

  @property({ type: String })
  language: 'yaml' | 'json' = 'yaml';

  @property({ type: Boolean, reflect: true })
  readonly = false;

  @property({ type: Boolean, attribute: 'line-numbers' })
  lineNumbers = true;

  @property({ type: Number, attribute: 'tab-size' })
  tabSize = 2;

  @property({ type: String })
  label: string | undefined;

  @property({ attribute: false })
  extensions: Extension[] = [];

  private _editorView: EditorView | null = null;
  private _pendingCreate = false;
  private _suppressUpdate = false;

  private _languageCompartment = new Compartment();
  private _readonlyCompartment = new Compartment();
  private _lineNumbersCompartment = new Compartment();
  private _tabSizeCompartment = new Compartment();
  private _labelCompartment = new Compartment();
  private _extensionsCompartment = new Compartment();

  override connectedCallback() {
    super.connectedCallback();
    if (!this._editorView) {
      this._pendingCreate = true;
    }
  }

  override firstUpdated() {
    this._createEditor();
  }

  override updated(changed: PropertyValues) {
    if (this._pendingCreate && !this._editorView) {
      this._createEditor();
    }
    if (this._editorView && !this._suppressUpdate) {
      this._syncProperties(changed);
    }
  }

  override disconnectedCallback() {
    this._editorView?.destroy();
    this._editorView = null;
    super.disconnectedCallback();
  }

  override render() {
    return html`<div class="cm-host"></div>`;
  }

  private _createEditor() {
    this._pendingCreate = false;
    const container = this.shadowRoot!.querySelector('.cm-host')!;
    this._editorView = new EditorView({
      state: EditorState.create({
        doc: this.value,
        extensions: [
          this._lineNumbersCompartment.of(
            this.lineNumbers ? cmLineNumbers() : []
          ),
          this._languageCompartment.of(languageExtension(this.language)),
          this._tabSizeCompartment.of(indentUnit.of(' '.repeat(this.tabSize))),
          this._readonlyCompartment.of(EditorState.readOnly.of(this.readonly)),
          this._labelCompartment.of(
            EditorView.contentAttributes.of(
              this.label ? { 'aria-label': this.label } : {}
            )
          ),
          keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
          history(),
          pagesTheme,
          syntaxHighlighting(pagesHighlightStyle),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) {
              this._suppressUpdate = true;
              this.value = update.state.doc.toString();
              this._suppressUpdate = false;
              this.dispatchEvent(
                new Event('input', { bubbles: true, composed: true })
              );
            }
            if (update.focusChanged && !update.view.hasFocus) {
              this.dispatchEvent(
                new Event('change', { bubbles: true, composed: true })
              );
            }
          }),
          this._extensionsCompartment.of(this.extensions),
        ],
      }),
      parent: container,
    });
  }

  private _syncProperties(changed: PropertyValues) {
    if (!this._editorView) return;

    if (changed.has('value')) {
      const current = this._editorView.state.doc.toString();
      if (current !== this.value) {
        this._editorView.dispatch({
          changes: { from: 0, to: current.length, insert: this.value },
        });
      }
    }

    if (changed.has('language')) {
      this._editorView.dispatch({
        effects: this._languageCompartment.reconfigure(
          languageExtension(this.language)
        ),
      });
    }

    if (changed.has('readonly')) {
      this._editorView.dispatch({
        effects: this._readonlyCompartment.reconfigure(
          EditorState.readOnly.of(this.readonly)
        ),
      });
    }

    if (changed.has('lineNumbers')) {
      this._editorView.dispatch({
        effects: this._lineNumbersCompartment.reconfigure(
          this.lineNumbers ? cmLineNumbers() : []
        ),
      });
    }

    if (changed.has('tabSize')) {
      this._editorView.dispatch({
        effects: this._tabSizeCompartment.reconfigure(
          indentUnit.of(' '.repeat(this.tabSize))
        ),
      });
    }

    if (changed.has('label')) {
      this._editorView.dispatch({
        effects: this._labelCompartment.reconfigure(
          EditorView.contentAttributes.of(
            this.label ? { 'aria-label': this.label } : {}
          )
        ),
      });
    }

    if (changed.has('extensions')) {
      this._editorView.dispatch({
        effects: this._extensionsCompartment.reconfigure(this.extensions),
      });
    }
  }
}

if (!customElements.get('pages-code-editor')) {
  customElements.define('pages-code-editor', PagesCodeEditor);
}
