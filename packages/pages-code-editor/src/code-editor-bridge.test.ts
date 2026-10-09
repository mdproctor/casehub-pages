import { describe, it, expect, vi } from 'vitest';
import { CodeEditorBridge } from './code-editor-bridge.js';
import { editableTextComplianceTests } from '@casehubio/pages-editor-core/dist/compliance.js';

function mockView(doc: string) {
  const lines = doc.split('\n');

  const lineAt = (offset: number) => {
    let pos = 0;
    for (let i = 0; i < lines.length; i++) {
      const lineEnd = pos + lines[i]!.length;
      if (offset <= lineEnd) {
        return { number: i + 1, from: pos, to: lineEnd, text: lines[i]! };
      }
      pos = lineEnd + 1;
    }
    return { number: lines.length, from: 0, to: doc.length, text: lines[lines.length - 1]! };
  };

  const line = (n: number) => {
    let pos = 0;
    for (let i = 0; i < n - 1; i++) {
      pos += lines[i]!.length + 1;
    }
    const text = lines[n - 1]!;
    return { number: n, from: pos, to: pos + text.length, text };
  };

  let cursor = 0;
  const dispatch = vi.fn((spec: any) => {
    if (spec.selection) {
      cursor = spec.selection.anchor;
    }
  });

  return {
    state: {
      doc: {
        toString: () => doc,
        get length() { return doc.length; },
        get lines() { return lines.length; },
        lineAt,
        line,
      },
      selection: { main: { get head() { return cursor; } } },
      field: () => undefined,
    },
    dispatch,
  } as any;
}

describe('CodeEditorBridge', () => {
  it('getText returns full document', () => {
    const view = mockView('line one\nline two\nline three');
    const bridge = new CodeEditorBridge(view);
    expect(bridge.getText()).toBe('line one\nline two\nline three');
  });

  it('getLineCount returns correct count', () => {
    const view = mockView('line one\nline two\nline three');
    const bridge = new CodeEditorBridge(view);
    expect(bridge.getLineCount()).toBe(3);
  });

  it('setCursor dispatches selection', () => {
    const view = mockView('line one\nline two');
    const bridge = new CodeEditorBridge(view);
    bridge.setCursor(1, 5);
    expect(view.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ selection: { anchor: 14 } }),
    );
  });

  it('getCursor returns position after setCursor', () => {
    const view = mockView('line one\nline two');
    const bridge = new CodeEditorBridge(view);
    bridge.setCursor(1, 5);
    const pos = bridge.getCursor();
    expect(pos.line).toBe(1);
    expect(pos.col).toBe(5);
  });

  it('insertText dispatches changes at cursor', () => {
    const view = mockView('hello');
    const bridge = new CodeEditorBridge(view);
    bridge.insertText(' world');
    expect(view.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        changes: { from: 0, insert: ' world' },
      }),
    );
  });

  it('setContent dispatches full replacement', () => {
    const view = mockView('old content');
    const bridge = new CodeEditorBridge(view);
    bridge.setContent('new');
    expect(view.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        changes: { from: 0, to: 11, insert: 'new' },
      }),
    );
  });

  it('replaceRange dispatches changes with offsets', () => {
    const view = mockView('line one\nline two');
    const bridge = new CodeEditorBridge(view);
    bridge.replaceRange({ line: 1, col: 0 }, { line: 1, col: 4 }, 'LINE');
    expect(view.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        changes: { from: 9, to: 13, insert: 'LINE' },
      }),
    );
  });

  it('deleteRange dispatches changes without insert', () => {
    const view = mockView('line one\nline two');
    const bridge = new CodeEditorBridge(view);
    bridge.deleteRange({ line: 1, col: 0 }, { line: 1, col: 5 });
    expect(view.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        changes: { from: 9, to: 14 },
      }),
    );
  });

  it('clearHighlights does not throw when field not installed', () => {
    const view = mockView('hello');
    const bridge = new CodeEditorBridge(view);
    expect(() => bridge.clearHighlights()).not.toThrow();
  });
});

editableTextComplianceTests('CodeEditorBridge', () => {
  const view = mockView('hello world\nsecond line\nthird line');
  return new CodeEditorBridge(view);
});
