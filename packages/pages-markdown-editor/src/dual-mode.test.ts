// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { EDITABLE_TEXT } from '@casehubio/pages-editor-core';
import { PagesMarkdownEditor } from './pages-markdown-editor.js';

class TestableEditor extends PagesMarkdownEditor {
  importBehavior: 'succeed' | 'fail' = 'fail';

  protected override async _importSourceEditor(): Promise<void> {
    if (this.importBehavior === 'fail') {
      throw new Error('Module not found');
    }
  }
}

if (!customElements.get('testable-editor')) {
  customElements.define('testable-editor', TestableEditor);
}

describe('Dual mode toggle', () => {
  function createEditor(): TestableEditor {
    return new TestableEditor();
  }

  it('default mode is wysiwyg', () => {
    const el = createEditor();
    expect(el.mode).toBe('wysiwyg');
  });

  it('setMode method exists', () => {
    const el = createEditor();
    expect(typeof el.setMode).toBe('function');
  });

  it('setMode to same mode is a no-op', async () => {
    const el = createEditor();
    const events: CustomEvent[] = [];
    el.addEventListener('mode-changed', (e: Event) => events.push(e as CustomEvent));

    await el.setMode('wysiwyg');

    expect(events).toHaveLength(0);
  });

  it('reverts to wysiwyg when source import fails', async () => {
    const el = createEditor();
    el.importBehavior = 'fail';
    const events: CustomEvent[] = [];
    el.addEventListener('mode-changed', (e: Event) => events.push(e as CustomEvent));

    await el.setMode('source');

    expect(el.mode).toBe('wysiwyg');
    expect(events).toHaveLength(1);
    expect(events[0]!.detail.mode).toBe('wysiwyg');
    expect(events[0]!.detail.error).toBe('source-unavailable');
  });

  it('emits mode-changed event with source mode on successful import', async () => {
    const el = createEditor();
    el.importBehavior = 'succeed';
    const events: CustomEvent[] = [];
    el.addEventListener('mode-changed', (e: Event) => events.push(e as CustomEvent));

    await el.setMode('source');

    expect(el.mode).toBe('source');
    expect(events).toHaveLength(1);
    expect(events[0]!.detail.mode).toBe('source');
    expect(events[0]!.detail.error).toBeUndefined();
  });

  it('getActiveBridge returns null before firstUpdated', () => {
    const el = createEditor();
    expect(el.getActiveBridge()).toBeNull();
  });

  it('getActiveBridge method exists', () => {
    const el = createEditor();
    expect(typeof el.getActiveBridge).toBe('function');
  });

  it('switches to split mode on successful import', async () => {
    const el = createEditor();
    el.importBehavior = 'succeed';
    const events: CustomEvent[] = [];
    el.addEventListener('mode-changed', (e: Event) => events.push(e as CustomEvent));

    await el.setMode('split');

    expect(el.mode).toBe('split');
    expect(events).toHaveLength(1);
    expect(events[0]!.detail.mode).toBe('split');
  });

  it('reverts split mode to wysiwyg when source import fails', async () => {
    const el = createEditor();
    el.importBehavior = 'fail';
    const events: CustomEvent[] = [];
    el.addEventListener('mode-changed', (e: Event) => events.push(e as CustomEvent));

    await el.setMode('split');

    expect(el.mode).toBe('wysiwyg');
    expect(events[0]!.detail.error).toBe('source-unavailable');
  });

  it('can switch from source to wysiwyg', async () => {
    const el = createEditor();
    el.importBehavior = 'succeed';
    await el.setMode('source');
    expect(el.mode).toBe('source');

    await el.setMode('wysiwyg');
    expect(el.mode).toBe('wysiwyg');
  });

  it('split mode sets up scroll sync listeners on both panes', async () => {
    const el = createEditor();
    el.importBehavior = 'succeed';
    document.body.appendChild(el);
    await el.updateComplete;

    await el.setMode('split');
    await el.updateComplete;

    const editorHost = el.shadowRoot!.querySelector('.editor-host');
    const sourceHost = el.shadowRoot!.querySelector('.source-host');
    expect(editorHost).not.toBeNull();
    expect(sourceHost).not.toBeNull();

    expect((el as any)._scrollSyncCleanup).toBeDefined();
    expect(typeof (el as any)._scrollSyncCleanup).toBe('function');

    document.body.removeChild(el);
  });

  it('split mode cleans up scroll sync on teardown', async () => {
    const el = createEditor();
    el.importBehavior = 'succeed';
    document.body.appendChild(el);
    await el.updateComplete;

    await el.setMode('split');
    await el.updateComplete;
    expect((el as any)._scrollSyncCleanup).toBeDefined();

    await el.setMode('wysiwyg');
    await el.updateComplete;
    expect((el as any)._scrollSyncCleanup).toBeUndefined();

    document.body.removeChild(el);
  });

  it('split mode preserves editor-host — same element, not recreated', async () => {
    const el = createEditor();
    document.body.appendChild(el);
    await el.updateComplete;

    const editorHostBefore = el.shadowRoot!.querySelector('.editor-host');
    expect(editorHostBefore).not.toBeNull();

    el.importBehavior = 'succeed';
    await el.setMode('split');
    await el.updateComplete;

    const editorHostAfter = el.shadowRoot!.querySelector('.editor-host');
    expect(editorHostAfter).not.toBeNull();
    expect(editorHostAfter).toBe(editorHostBefore);

    document.body.removeChild(el);
  });
});
