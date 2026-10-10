import { describe, it, expect } from 'vitest';
import type { Position, HighlightStyle, HighlightOptions } from './types.js';
import { EditSessionActiveError } from './types.js';
import { EditableTextBridge } from './editable-text-bridge.js';

class TestBridge extends EditableTextBridge {
  appliedHighlights: Array<{ id: string; from: Position; to: Position; style: HighlightOptions }> = [];
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

  protected override applyHighlight(id: string, from: Position, to: Position, style: HighlightOptions) {
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
    bridge.highlightLine(2, 1, 'underline');
    expect(bridge.appliedHighlights[0]!.style.textDecoration).toBeDefined();
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
    expect(bridge.appliedHighlights[0]!.style.background).toContain('rgba(99, 102, 241, 0.2)');
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

describe('EditableTextBridge — HighlightOptions', () => {
  it('highlight accepts HighlightOptions object', () => {
    const bridge = new TestBridge();
    const id = bridge.highlight(
      { line: 0, col: 0 },
      { line: 0, col: 4 },
      { background: 'red', group: 'errors' },
    );
    expect(typeof id).toBe('string');
    expect(bridge.appliedHighlights[0]!.style).toEqual({ background: 'red', group: 'errors' });
  });

  it('highlight still accepts string style for backward compat', () => {
    const bridge = new TestBridge();
    bridge.highlight({ line: 0, col: 0 }, { line: 0, col: 4 }, 'glow');
    expect(bridge.appliedHighlights[0]!.style.background).toBeDefined();
  });

  it('highlight with no style defaults to pulse preset', () => {
    const bridge = new TestBridge();
    bridge.highlight({ line: 0, col: 0 }, { line: 0, col: 4 });
    expect(bridge.appliedHighlights[0]!.style.background).toBeDefined();
  });

  it('activeHighlights stores resolved HighlightOptions', () => {
    const bridge = new TestBridge();
    bridge.highlight({ line: 0, col: 0 }, { line: 0, col: 4 }, { border: '2px solid blue' });
    const hl = [...bridge.activeHighlights.values()][0]!;
    expect(hl.style).toEqual({ border: '2px solid blue' });
  });
});

describe('EditableTextBridge — highlightSentence', () => {
  const TEXT = 'Hello world. This is a test. Another sentence here.';

  class SentenceTestBridge extends TestBridge {
    override getText() { return TEXT; }
    override getLine(line: number) { return TEXT.split('\n')[line] ?? ''; }
    override getLineCount() { return 1; }
    override getCursor() { return { line: 0, col: 14 }; }
  }

  it('highlights sentence at cursor position', () => {
    const bridge = new SentenceTestBridge();
    const id = bridge.highlightSentence();
    expect(typeof id).toBe('string');
    const hl = bridge.appliedHighlights[0]!;
    expect(hl.from).toEqual({ line: 0, col: 13 });
    expect(hl.to).toEqual({ line: 0, col: 28 });
  });

  it('highlights sentence at explicit position', () => {
    const bridge = new SentenceTestBridge();
    bridge.highlightSentence({ line: 0, col: 0 });
    const hl = bridge.appliedHighlights[0]!;
    expect(hl.from).toEqual({ line: 0, col: 0 });
    expect(hl.to).toEqual({ line: 0, col: 12 });
  });

  it('highlights last sentence when pos is near end', () => {
    const bridge = new SentenceTestBridge();
    bridge.highlightSentence({ line: 0, col: 35 });
    const hl = bridge.appliedHighlights[0]!;
    expect(hl.from).toEqual({ line: 0, col: 29 });
    expect(hl.to).toEqual({ line: 0, col: 51 });
  });

  it('accepts style parameter', () => {
    const bridge = new SentenceTestBridge();
    bridge.highlightSentence(undefined, 'error');
    expect(bridge.appliedHighlights[0]!.style).toBeDefined();
  });

  it('splits sentences with lowercase after period', () => {
    const LOWER = 'the cat sat. the dog ran. the bird flew.';
    class LowerBridge extends TestBridge {
      override getText() { return LOWER; }
      override getLine() { return LOWER; }
      override getLineCount() { return 1; }
      override getCursor() { return { line: 0, col: 0 }; }
    }
    const bridge = new LowerBridge();
    bridge.highlightSentence({ line: 0, col: 0 });
    expect(bridge.appliedHighlights[0]!.from).toEqual({ line: 0, col: 0 });
    expect(bridge.appliedHighlights[0]!.to).toEqual({ line: 0, col: 12 });
  });

  it('sentence does not include trailing space', () => {
    const bridge = new SentenceTestBridge();
    bridge.highlightSentence({ line: 0, col: 0 });
    const hl = bridge.appliedHighlights[0]!;
    const text = TEXT.substring(hl.from.col, hl.to.col);
    expect(text).toBe('Hello world.');
    expect(text.endsWith(' ')).toBe(false);
  });
});

describe('EditableTextBridge — highlightText', () => {
  class MultiMatchBridge extends TestBridge {
    override getText() { return 'foo bar foo baz foo'; }
    override getLine(line: number) { return this.getText().split('\n')[line] ?? ''; }
    override getLineCount() { return 1; }
    override findText(query: string) {
      const results: Position[] = [];
      const text = this.getText();
      let idx = 0;
      while ((idx = text.indexOf(query, idx)) !== -1) {
        results.push({ line: 0, col: idx });
        idx += query.length;
      }
      return results;
    }
  }

  it('highlights all occurrences of a string', () => {
    const bridge = new MultiMatchBridge();
    const ids = bridge.highlightText('foo');
    expect(ids).toHaveLength(3);
    expect(bridge.appliedHighlights).toHaveLength(3);
    expect(bridge.appliedHighlights[0]!.from).toEqual({ line: 0, col: 0 });
    expect(bridge.appliedHighlights[0]!.to).toEqual({ line: 0, col: 3 });
    expect(bridge.appliedHighlights[1]!.from).toEqual({ line: 0, col: 8 });
    expect(bridge.appliedHighlights[2]!.from).toEqual({ line: 0, col: 16 });
  });

  it('returns empty array when no matches', () => {
    const bridge = new MultiMatchBridge();
    const ids = bridge.highlightText('zzz');
    expect(ids).toHaveLength(0);
  });

  it('accepts style parameter', () => {
    const bridge = new MultiMatchBridge();
    bridge.highlightText('foo', { background: 'yellow', group: 'search' });
    expect(bridge.appliedHighlights[0]!.style).toEqual({ background: 'yellow', group: 'search' });
  });
});

describe('EditableTextBridge — highlightLine with count', () => {
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

  class BlockTestBridge2 extends TestBridge {
    override getText() { return MARKDOWN; }
    override getLine(line: number) { return MARKDOWN.split('\n')[line] ?? ''; }
    override getLineCount() { return MARKDOWN.split('\n').length; }
  }

  it('highlightLine with count=3 highlights 3 consecutive lines', () => {
    const bridge = new BlockTestBridge2();
    const id = bridge.highlightLine(4, 3);
    expect(typeof id).toBe('string');
    const hl = bridge.appliedHighlights[0]!;
    expect(hl.from).toEqual({ line: 4, col: 0 });
    expect(hl.to.line).toBe(6);
  });

  it('highlightLine with count=1 behaves like original', () => {
    const bridge = new BlockTestBridge2();
    bridge.highlightLine(0, 1);
    const hl = bridge.appliedHighlights[0]!;
    expect(hl.from).toEqual({ line: 0, col: 0 });
    expect(hl.to).toEqual({ line: 0, col: 7 });
  });

  it('highlightLine clamps count to available lines', () => {
    const bridge = new BlockTestBridge2();
    bridge.highlightLine(10, 100);
    const hl = bridge.appliedHighlights[0]!;
    expect(hl.from).toEqual({ line: 10, col: 0 });
    expect(hl.to.line).toBe(11);
  });
});

describe('EditableTextBridge — read-back API', () => {
  it('getHighlightText returns text under a highlight', () => {
    const bridge = new TestBridge();
    const id = bridge.highlight({ line: 0, col: 0 }, { line: 0, col: 4 });
    expect(bridge.getHighlightText(id)).toBe('line');
  });

  it('getHighlightText returns undefined for unknown ID', () => {
    const bridge = new TestBridge();
    expect(bridge.getHighlightText('nonexistent')).toBeUndefined();
  });

  it('getHighlightText works across lines', () => {
    const bridge = new TestBridge();
    const id = bridge.highlight({ line: 0, col: 5 }, { line: 1, col: 4 });
    const text = bridge.getHighlightText(id);
    expect(text).toBe('one\nline');
  });

  it('listHighlights returns all highlights with metadata', () => {
    const bridge = new TestBridge();
    bridge.highlight({ line: 0, col: 0 }, { line: 0, col: 4 }, { group: 'errors' });
    bridge.highlight({ line: 1, col: 0 }, { line: 1, col: 4 });
    const list = bridge.listHighlights();
    expect(list).toHaveLength(2);
    expect(list[0]!.text).toBe('line');
    expect(list[0]!.group).toBe('errors');
    expect(list[1]!.group).toBeUndefined();
  });

  it('clearHighlightGroup removes only matching group', () => {
    const bridge = new TestBridge();
    bridge.highlight({ line: 0, col: 0 }, { line: 0, col: 4 }, { group: 'errors' });
    bridge.highlight({ line: 1, col: 0 }, { line: 1, col: 4 }, { group: 'search' });
    bridge.highlight({ line: 2, col: 0 }, { line: 2, col: 4 });
    bridge.clearHighlightGroup('errors');
    expect(bridge.activeHighlights.size).toBe(2);
    expect(bridge.listHighlights().every(h => h.group !== 'errors')).toBe(true);
  });

  it('clearHighlightGroup calls removeHighlightDecoration for each', () => {
    const bridge = new TestBridge();
    bridge.highlight({ line: 0, col: 0 }, { line: 0, col: 4 }, { group: 'g' });
    bridge.highlight({ line: 1, col: 0 }, { line: 1, col: 4 }, { group: 'g' });
    bridge.clearHighlightGroup('g');
    expect(bridge.removedHighlights).toHaveLength(2);
  });
});
