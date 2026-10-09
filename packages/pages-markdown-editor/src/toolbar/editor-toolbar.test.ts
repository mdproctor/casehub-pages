import { describe, it, expect, vi } from 'vitest';

describe('EditorToolbar', () => {
  it('should export EditorToolbar class', async () => {
    const { EditorToolbar } = await import('./editor-toolbar.js');
    expect(EditorToolbar).toBeDefined();
    expect(typeof EditorToolbar).toBe('function');
  });

  it('should register as custom element', async () => {
    await import('./editor-toolbar.js');
    expect(customElements.get('editor-toolbar')).toBeDefined();
  });

  it('should have correct default property values', async () => {
    const { EditorToolbar } = await import('./editor-toolbar.js');
    const el = new EditorToolbar();
    expect(el.editor).toBeNull();
  });

  it('TOOLBAR_ITEMS defines expected buttons', async () => {
    const { TOOLBAR_ITEMS } = await import('./editor-toolbar.js');
    expect(TOOLBAR_ITEMS.length).toBeGreaterThan(0);
    const ids = TOOLBAR_ITEMS.map((b: any) => b.id);
    expect(ids).toContain('bold');
    expect(ids).toContain('italic');
    expect(ids).toContain('heading');
    expect(ids).toContain('bullet-list');
    expect(ids).toContain('ordered-list');
    expect(ids).toContain('code-block');
    expect(ids).toContain('link');
    expect(ids).toContain('hr');
  });

  it('each toolbar item has icon, tooltip, and command key', async () => {
    const { TOOLBAR_ITEMS } = await import('./editor-toolbar.js');
    for (const item of TOOLBAR_ITEMS) {
      expect(item.id).toBeTruthy();
      expect(item.icon).toBeTruthy();
      expect(item.tooltip).toBeTruthy();
      expect(item.commandKey).toBeTruthy();
    }
  });
});
