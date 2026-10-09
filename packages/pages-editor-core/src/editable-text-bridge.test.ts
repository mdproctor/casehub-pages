import { describe, it, expect } from 'vitest';
import type { Position, HighlightStyle } from './types.js';
import { EditSessionActiveError } from './types.js';
import { EditableTextBridge } from './editable-text-bridge.js';

class TestBridge extends EditableTextBridge {
  appliedHighlights: Array<{ id: string; from: Position; to: Position; style?: HighlightStyle }> = [];
  removedHighlights: string[] = [];
  cleared = false;

  getText() { return 'line one\nline two\nline three'; }
  getLine(line: number) { return this.getText().split('\n')[line] ?? ''; }
  getLineCount() { return 3; }
  setContent() {}
  findText(query: string) {
    const lines = this.getText().split('\n');
    const results: Position[] = [];
    for (let i = 0; i < lines.length; i++) {
      const col = lines[i]!.indexOf(query);
      if (col >= 0) results.push({ line: i, col });
    }
    return results;
  }
  insertText() {}
  replaceRange() {}
  deleteRange() {}
  setCursor() {}
  getCursor() { return { line: 0, col: 0 }; }

  protected override applyHighlight(id: string, from: Position, to: Position, style?: HighlightStyle) {
    this.appliedHighlights.push({ id, from, to, style });
  }
  protected override removeHighlightDecoration(id: string) {
    this.removedHighlights.push(id);
  }
  protected override clearHighlightDecorations() {
    this.cleared = true;
  }
}

describe('EditableTextBridge — highlights', () => {
  it('highlight returns unique IDs', () => {
    const bridge = new TestBridge();
    const id1 = bridge.highlight({ line: 0, col: 0 }, { line: 0, col: 4 });
    const id2 = bridge.highlight({ line: 1, col: 0 }, { line: 1, col: 4 });
    expect(id1).not.toBe(id2);
    expect(typeof id1).toBe('string');
    expect(bridge.appliedHighlights).toHaveLength(2);
  });

  it('removeHighlight delegates to engine', () => {
    const bridge = new TestBridge();
    const id = bridge.highlight({ line: 0, col: 0 }, { line: 0, col: 4 });
    bridge.removeHighlight(id);
    expect(bridge.removedHighlights).toContain(id);
  });

  it('removeHighlight ignores unknown IDs', () => {
    const bridge = new TestBridge();
    bridge.removeHighlight('nonexistent');
    expect(bridge.removedHighlights).toHaveLength(0);
  });

  it('clearHighlights delegates to engine', () => {
    const bridge = new TestBridge();
    bridge.highlight({ line: 0, col: 0 }, { line: 0, col: 4 });
    bridge.highlight({ line: 1, col: 0 }, { line: 1, col: 4 });
    bridge.clearHighlights();
    expect(bridge.cleared).toBe(true);
    expect(bridge.activeHighlights.size).toBe(0);
  });
});

describe('EditableTextBridge — annotations', () => {
  it('addAnnotation returns unique IDs', () => {
    const bridge = new TestBridge();
    const id1 = bridge.addAnnotation({ line: 0, col: 0 }, { type: 'callout', text: 'hello' });
    const id2 = bridge.addAnnotation({ line: 1, col: 0 }, { type: 'arrow' });
    expect(id1).not.toBe(id2);
    expect(bridge.annotationCount).toBe(2);
  });

  it('removeAnnotation removes by ID', () => {
    const bridge = new TestBridge();
    const id = bridge.addAnnotation({ line: 0, col: 0 }, { type: 'marker' });
    bridge.removeAnnotation(id);
    expect(bridge.getAnnotation(id)).toBeUndefined();
    expect(bridge.annotationCount).toBe(0);
  });

  it('clearAnnotations removes all', () => {
    const bridge = new TestBridge();
    bridge.addAnnotation({ line: 0, col: 0 }, { type: 'callout' });
    bridge.addAnnotation({ line: 1, col: 0 }, { type: 'arrow' });
    bridge.clearAnnotations();
    expect(bridge.annotationCount).toBe(0);
  });

  it('getAnnotation returns stored data', () => {
    const bridge = new TestBridge();
    const id = bridge.addAnnotation({ line: 2, col: 5 }, { type: 'numbered', text: 'step 1' });
    const stored = bridge.getAnnotation(id);
    expect(stored).toBeDefined();
    expect(stored!.anchor).toEqual({ line: 2, col: 5 });
    expect(stored!.options.type).toBe('numbered');
    expect(stored!.options.text).toBe('step 1');
  });
});

describe('EditableTextBridge — highlightLine / highlightBlock', () => {
  const MARKDOWN = [
    '# Title',
    '',
    '## Overview',
    '',
    'First paragraph line one.',
    'First paragraph line two.',
    '',
    'Second paragraph.',
    '',
    '## Details',
    '',
    'Third paragraph.',
  ].join('\n');

  class BlockTestBridge extends TestBridge {
    override getText() { return MARKDOWN; }
    override getLine(line: number) { return MARKDOWN.split('\n')[line] ?? ''; }
    override getLineCount() { return MARKDOWN.split('\n').length; }
  }

  it('highlightLine highlights exactly one line', () => {
    const bridge = new BlockTestBridge();
    bridge.highlightLine(0);
    expect(bridge.appliedHighlights).toHaveLength(1);
    expect(bridge.appliedHighlights[0]!.from).toEqual({ line: 0, col: 0 });
    expect(bridge.appliedHighlights[0]!.to).toEqual({ line: 0, col: 7 });
  });

  it('highlightLine with style passes it through', () => {
    const bridge = new BlockTestBridge();
    bridge.highlightLine(2, 'underline');
    expect(bridge.appliedHighlights[0]!.style).toBe('underline');
    expect(bridge.appliedHighlights[0]!.to).toEqual({ line: 2, col: 11 });
  });

  it('highlightBlock highlights only the paragraph containing the position', () => {
    const bridge = new BlockTestBridge();
    bridge.highlightBlock({ line: 4, col: 0 });
    expect(bridge.appliedHighlights).toHaveLength(1);
    const hl = bridge.appliedHighlights[0]!;
    expect(hl.from).toEqual({ line: 4, col: 0 });
    expect(hl.to).toEqual({ line: 5, col: 25 });
  });

  it('highlightBlock does not span across empty line boundaries', () => {
    const bridge = new BlockTestBridge();
    bridge.highlightBlock({ line: 7, col: 0 });
    const hl = bridge.appliedHighlights[0]!;
    expect(hl.from).toEqual({ line: 7, col: 0 });
    expect(hl.to).toEqual({ line: 7, col: 17 });
  });

  it('highlightBlock on a heading highlights just the heading', () => {
    const bridge = new BlockTestBridge();
    bridge.highlightBlock({ line: 0, col: 0 });
    const hl = bridge.appliedHighlights[0]!;
    expect(hl.from).toEqual({ line: 0, col: 0 });
    expect(hl.to).toEqual({ line: 0, col: 7 });
  });

  it('highlightBlock on heading followed by empty line stops at heading', () => {
    const bridge = new BlockTestBridge();
    bridge.highlightBlock({ line: 9, col: 0 });
    const hl = bridge.appliedHighlights[0]!;
    expect(hl.from).toEqual({ line: 9, col: 0 });
    expect(hl.to).toEqual({ line: 9, col: 10 });
  });

  it('highlightRange is alias for highlight', () => {
    const bridge = new BlockTestBridge();
    const id = bridge.highlightRange({ line: 0, col: 0 }, { line: 0, col: 5 }, 'glow');
    expect(typeof id).toBe('string');
    expect(bridge.appliedHighlights[0]!.style).toBe('glow');
  });
});

describe('EditableTextBridge — edit sessions', () => {
  it('beginEditSession creates exclusive session', () => {
    const bridge = new TestBridge();
    const session = bridge.beginEditSession('claude');
    expect(session.owner).toBe('claude');
    expect(session.mode).toBe('exclusive');
    expect(session.startedAt).toBeTruthy();
    expect(bridge.isSessionActive).toBe(true);
  });

  it('beginEditSession throws when session already active', () => {
    const bridge = new TestBridge();
    bridge.beginEditSession('claude');
    expect(() => bridge.beginEditSession('gpt')).toThrow(EditSessionActiveError);
    try {
      bridge.beginEditSession('gpt');
    } catch (e) {
      expect((e as EditSessionActiveError).owner).toBe('claude');
      expect((e as EditSessionActiveError).startedAt).toBeTruthy();
    }
  });

  it('endEditSession clears active session', () => {
    const bridge = new TestBridge();
    const session = bridge.beginEditSession('claude');
    bridge.endEditSession(session);
    expect(bridge.isSessionActive).toBe(false);
    const session2 = bridge.beginEditSession('claude');
    expect(session2).toBeTruthy();
    bridge.endEditSession(session2);
  });

  it('cancel clears active session', () => {
    const bridge = new TestBridge();
    const session = bridge.beginEditSession('claude');
    session.cancel();
    expect(bridge.isSessionActive).toBe(false);
  });

  it('endEditSession ignores wrong session', () => {
    const bridge = new TestBridge();
    const session1 = bridge.beginEditSession('claude');
    const fakeSession = { owner: 'fake', mode: 'exclusive' as const, startedAt: '', cancel: () => {} };
    bridge.endEditSession(fakeSession);
    expect(bridge.isSessionActive).toBe(true);
    bridge.endEditSession(session1);
  });
});
