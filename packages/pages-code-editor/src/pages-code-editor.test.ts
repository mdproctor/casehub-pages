import { describe, it, expect } from 'vitest';

describe('PagesCodeEditor', () => {
  it('should export PagesCodeEditor class', async () => {
    const { PagesCodeEditor } = await import('./pages-code-editor.js');
    expect(PagesCodeEditor).toBeDefined();
    expect(typeof PagesCodeEditor).toBe('function');
  });

  it('should have correct default property values', async () => {
    const { PagesCodeEditor } = await import('./pages-code-editor.js');
    const el = new PagesCodeEditor();
    expect(el.value).toBe('');
    expect(el.language).toBe('yaml');
    expect(el.readonly).toBe(false);
    expect(el.lineNumbers).toBe(true);
    expect(el.tabSize).toBe(2);
    expect(el.label).toBeUndefined();
    expect(el.extensions).toEqual([]);
  });
});
