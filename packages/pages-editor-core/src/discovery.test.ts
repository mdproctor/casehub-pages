import { describe, it, expect } from 'vitest';
import type { EditableText } from './types.js';
import { EDITABLE_TEXT, isEditableText, findEditableText } from './discovery.js';

function mockEditableText(): EditableText {
  return {
    getText: () => '',
    getLine: () => '',
    getLineCount: () => 0,
    setContent: () => {},
    findText: () => [],
    insertText: () => {},
    replaceRange: () => {},
    deleteRange: () => {},
    setCursor: () => {},
    getCursor: () => ({ line: 0, col: 0 }),
    highlight: () => '',
    removeHighlight: () => {},
    clearHighlights: () => {},
    addAnnotation: () => '',
    removeAnnotation: () => {},
    clearAnnotations: () => {},
    beginEditSession: () => ({ owner: '', mode: 'exclusive' as const, startedAt: '', cancel: () => {} }),
    endEditSession: () => {},
  };
}

describe('EDITABLE_TEXT symbol', () => {
  it('uses editable-text key', () => {
    expect(EDITABLE_TEXT).toBe(Symbol.for('editable-text'));
  });
});

describe('isEditableText', () => {
  it('returns false for plain elements', () => {
    const el = document.createElement('div');
    expect(isEditableText(el)).toBe(false);
  });

  it('returns true when symbol is present', () => {
    const el = document.createElement('div');
    (el as any)[EDITABLE_TEXT] = mockEditableText();
    expect(isEditableText(el)).toBe(true);
  });
});

describe('findEditableText', () => {
  it('finds bridge on the element itself', () => {
    const el = document.createElement('div');
    const mock = mockEditableText();
    (el as any)[EDITABLE_TEXT] = mock;
    expect(findEditableText(el)).toBe(mock);
  });

  it('walks up DOM tree to find bridge', () => {
    const parent = document.createElement('div');
    const child = document.createElement('span');
    parent.appendChild(child);
    const mock = mockEditableText();
    (parent as any)[EDITABLE_TEXT] = mock;
    expect(findEditableText(child)).toBe(mock);
  });

  it('returns null when not found', () => {
    const el = document.createElement('div');
    expect(findEditableText(el)).toBeNull();
  });
});
