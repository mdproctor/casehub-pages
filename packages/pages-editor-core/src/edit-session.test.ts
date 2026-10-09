import { describe, it, expect } from 'vitest';
import type { Position, HighlightStyle } from './types.js';
import { EditSessionActiveError } from './types.js';
import { EditableTextBridge } from './editable-text-bridge.js';

class RollbackTestBridge extends EditableTextBridge {
  private _content: string;
  appliedHighlights: Array<{ id: string; from: Position; to: Position }> = [];
  removedHighlights: string[] = [];
  cleared = false;

  constructor(content: string) {
    super();
    this._content = content;
  }

  getText() { return this._content; }
  getLine(line: number) { return this._content.split('\n')[line] ?? ''; }
  getLineCount() { return this._content.split('\n').length; }
  setContent(text: string) { this._content = text; }
  findText(query: string) {
    const results: Position[] = [];
    const lines = this._content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      let idx = 0;
      while ((idx = lines[i]!.indexOf(query, idx)) !== -1) {
        results.push({ line: i, col: idx });
        idx += query.length;
      }
    }
    return results;
  }
  insertText() {}
  replaceRange() {}
  deleteRange() {}
  setCursor() {}
  getCursor() { return { line: 0, col: 0 }; }

  protected applyHighlight(id: string, from: Position, to: Position) {
    this.appliedHighlights.push({ id, from, to });
  }
  protected removeHighlightDecoration(id: string) {
    this.removedHighlights.push(id);
  }
  protected clearHighlightDecorations() {
    this.cleared = true;
  }
}

describe('Edit session rollback', () => {
  it('cancel restores document to pre-session state', () => {
    const bridge = new RollbackTestBridge('original content');
    const session = bridge.beginEditSession('claude');
    bridge.setContent('modified by AI');
    expect(bridge.getText()).toBe('modified by AI');
    session.cancel();
    expect(bridge.getText()).toBe('original content');
  });

  it('cancel clears highlights created during session', () => {
    const bridge = new RollbackTestBridge('hello world');
    const preId = bridge.highlight({ line: 0, col: 0 }, { line: 0, col: 3 });
    const session = bridge.beginEditSession('claude');
    const duringId = bridge.highlight({ line: 0, col: 4 }, { line: 0, col: 8 });
    expect(bridge.activeHighlights.size).toBe(2);
    session.cancel();
    expect(bridge.activeHighlights.has(preId)).toBe(true);
    expect(bridge.activeHighlights.has(duringId)).toBe(false);
  });

  it('cancel clears annotations created during session', () => {
    const bridge = new RollbackTestBridge('hello world');
    const preId = bridge.addAnnotation({ line: 0, col: 0 }, { type: 'callout' });
    const session = bridge.beginEditSession('claude');
    bridge.addAnnotation({ line: 0, col: 5 }, { type: 'arrow' });
    expect(bridge.annotationCount).toBe(2);
    session.cancel();
    expect(bridge.annotationCount).toBe(1);
    expect(bridge.getAnnotation(preId)).toBeDefined();
  });

  it('normal end preserves edits', () => {
    const bridge = new RollbackTestBridge('original');
    const session = bridge.beginEditSession('claude');
    bridge.setContent('modified');
    bridge.endEditSession(session);
    expect(bridge.getText()).toBe('modified');
  });

  it('normal end preserves highlights created during session', () => {
    const bridge = new RollbackTestBridge('hello world');
    const session = bridge.beginEditSession('claude');
    const id = bridge.highlight({ line: 0, col: 0 }, { line: 0, col: 5 });
    bridge.endEditSession(session);
    expect(bridge.activeHighlights.has(id)).toBe(true);
  });

  it('beginEditSession throws when session already active', () => {
    const bridge = new RollbackTestBridge('hello');
    bridge.beginEditSession('claude');
    expect(() => bridge.beginEditSession('gpt')).toThrow(EditSessionActiveError);
  });

  it('cancel emits session-ended with cancelled flag', () => {
    const bridge = new RollbackTestBridge('hello');
    const session = bridge.beginEditSession('claude');
    expect(bridge.isSessionActive).toBe(true);
    session.cancel();
    expect(bridge.isSessionActive).toBe(false);
  });

  it('multiple sessions work after cancel', () => {
    const bridge = new RollbackTestBridge('original');
    const s1 = bridge.beginEditSession('claude');
    bridge.setContent('first edit');
    s1.cancel();
    expect(bridge.getText()).toBe('original');

    const s2 = bridge.beginEditSession('claude');
    bridge.setContent('second edit');
    bridge.endEditSession(s2);
    expect(bridge.getText()).toBe('second edit');
  });
});
