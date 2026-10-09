import { describe, it, expect } from 'vitest';

describe('PagesMarkdownEditor', () => {
  it('should export PagesMarkdownEditor class', async () => {
    const { PagesMarkdownEditor } = await import('./pages-markdown-editor.js');
    expect(PagesMarkdownEditor).toBeDefined();
    expect(typeof PagesMarkdownEditor).toBe('function');
  });

  it('should have correct default property values', async () => {
    const { PagesMarkdownEditor } = await import('./pages-markdown-editor.js');
    const el = new PagesMarkdownEditor();
    expect(el.value).toBe('');
    expect(el.mode).toBe('wysiwyg');
    expect(el.readonly).toBe(false);
    expect(el.label).toBeUndefined();
  });
});
