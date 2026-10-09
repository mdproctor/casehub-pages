import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Position } from '@casehubio/pages-editor-core';
import { EditSessionActiveError } from '@casehubio/pages-editor-core';
import { editableTextComplianceTests } from '@casehubio/pages-editor-core/dist/compliance.js';
import { MarkdownEditorBridge } from './markdown-editor-bridge.js';

function mockEditorView(doc: string) {
  const lines = doc.split('\n');
  let content = doc;

  const lineOffsets = (): number[] => {
    const offsets = [0];
    for (let i = 0; i < content.length; i++) {
      if (content[i] === '\n') offsets.push(i + 1);
    }
    return offsets;
  };

  const view = {
    state: {
      doc: {
        toString: () => content,
        get textContent() { return content; },
        get nodeSize() { return content.length + 2; },
      },
      selection: {
        from: 0,
        to: 0,
        head: 0,
        anchor: 0,
      },
      tr: {
        insertText: vi.fn().mockReturnThis(),
        replaceWith: vi.fn().mockReturnThis(),
        delete: vi.fn().mockReturnThis(),
        setSelection: vi.fn().mockReturnThis(),
      },
    },
    dispatch: vi.fn((tr: any) => {
      if (tr && typeof tr === 'object') {
        if (tr.steps && tr.steps.length > 0) {
          // Simulate applying transaction
        }
      }
    }),
    _setContent: (text: string) => { content = text; },
    _getContent: () => content,
  };

  return view as any;
}

function mockSerializer() {
  return vi.fn((doc: any) => doc.toString());
}

function createBridge(doc: string) {
  const view = mockEditorView(doc);
  const serializer = mockSerializer();
  return { bridge: new MarkdownEditorBridge(view, serializer), view, serializer };
}

describe('MarkdownEditorBridge', () => {
  describe('content methods', () => {
    it('getText returns the full document markdown', () => {
      const { bridge } = createBridge('# Hello\n\nWorld');
      expect(bridge.getText()).toBe('# Hello\n\nWorld');
    });

    it('getLine returns correct line by index', () => {
      const { bridge } = createBridge('line one\nline two\nline three');
      expect(bridge.getLine(0)).toBe('line one');
      expect(bridge.getLine(1)).toBe('line two');
      expect(bridge.getLine(2)).toBe('line three');
    });

    it('getLine returns empty string for out-of-range', () => {
      const { bridge } = createBridge('hello');
      expect(bridge.getLine(5)).toBe('');
      expect(bridge.getLine(-1)).toBe('');
    });

    it('getLineCount returns number of lines', () => {
      const { bridge } = createBridge('a\nb\nc');
      expect(bridge.getLineCount()).toBe(3);
    });

    it('getLineCount returns 1 for single line', () => {
      const { bridge } = createBridge('hello');
      expect(bridge.getLineCount()).toBe(1);
    });

    it('findText returns positions of all matches', () => {
      const { bridge } = createBridge('hello world\nhello again');
      const results = bridge.findText('hello');
      expect(results).toEqual([
        { line: 0, col: 0 },
        { line: 1, col: 0 },
      ]);
    });

    it('findText returns empty array for no matches', () => {
      const { bridge } = createBridge('hello world');
      expect(bridge.findText('xyz')).toEqual([]);
    });

    it('findText finds multiple matches on same line', () => {
      const { bridge } = createBridge('abcabc');
      const results = bridge.findText('abc');
      expect(results).toEqual([
        { line: 0, col: 0 },
        { line: 0, col: 3 },
      ]);
    });
  });

  describe('cursor and editing', () => {
    it('getCursor returns line/col position', () => {
      const { bridge } = createBridge('hello\nworld');
      const cursor = bridge.getCursor();
      expect(cursor).toEqual({ line: 0, col: 0 });
    });
  });

  describe('highlight tracking (from EditableTextBridge)', () => {
    it('highlight returns unique IDs', () => {
      const { bridge } = createBridge('hello world');
      const id1 = bridge.highlight({ line: 0, col: 0 }, { line: 0, col: 5 });
      const id2 = bridge.highlight({ line: 0, col: 6 }, { line: 0, col: 11 });
      expect(id1).not.toBe(id2);
      expect(typeof id1).toBe('string');
    });

    it('removeHighlight removes by ID', () => {
      const { bridge } = createBridge('hello world');
      const id = bridge.highlight({ line: 0, col: 0 }, { line: 0, col: 5 });
      expect(() => bridge.removeHighlight(id)).not.toThrow();
    });

    it('clearHighlights does not throw', () => {
      const { bridge } = createBridge('hello world');
      bridge.highlight({ line: 0, col: 0 }, { line: 0, col: 5 });
      expect(() => bridge.clearHighlights()).not.toThrow();
    });
  });

  describe('annotations (from EditableTextBridge)', () => {
    it('addAnnotation returns unique IDs', () => {
      const { bridge } = createBridge('hello');
      const id1 = bridge.addAnnotation({ line: 0, col: 0 }, { type: 'callout' });
      const id2 = bridge.addAnnotation({ line: 0, col: 3 }, { type: 'arrow' });
      expect(id1).not.toBe(id2);
    });
  });

  describe('edit sessions (from EditableTextBridge)', () => {
    it('beginEditSession creates exclusive session', () => {
      const { bridge } = createBridge('hello');
      const session = bridge.beginEditSession('claude');
      expect(session.owner).toBe('claude');
      expect(session.mode).toBe('exclusive');
      bridge.endEditSession(session);
    });

    it('beginEditSession throws when session already active', () => {
      const { bridge } = createBridge('hello');
      bridge.beginEditSession('claude');
      expect(() => bridge.beginEditSession('gpt')).toThrow(EditSessionActiveError);
    });
  });

  describe('position mapping', () => {
    it('toOffset converts line/col to character offset', () => {
      const { bridge } = createBridge('hello\nworld\nfoo');
      expect(bridge.toOffset({ line: 0, col: 0 })).toBe(0);
      expect(bridge.toOffset({ line: 0, col: 3 })).toBe(3);
      expect(bridge.toOffset({ line: 1, col: 0 })).toBe(6);
      expect(bridge.toOffset({ line: 1, col: 2 })).toBe(8);
      expect(bridge.toOffset({ line: 2, col: 0 })).toBe(12);
    });

    it('toPosition converts character offset to line/col', () => {
      const { bridge } = createBridge('hello\nworld\nfoo');
      expect(bridge.toPosition(0)).toEqual({ line: 0, col: 0 });
      expect(bridge.toPosition(3)).toEqual({ line: 0, col: 3 });
      expect(bridge.toPosition(6)).toEqual({ line: 1, col: 0 });
      expect(bridge.toPosition(8)).toEqual({ line: 1, col: 2 });
      expect(bridge.toPosition(12)).toEqual({ line: 2, col: 0 });
    });

    it('round-trips offset through position', () => {
      const { bridge } = createBridge('# Heading\n\nParagraph with **bold** text\n\n- item one\n- item two');
      for (const offset of [0, 5, 10, 11, 20, 30, 40]) {
        const pos = bridge.toPosition(offset);
        const roundTrip = bridge.toOffset(pos);
        expect(roundTrip).toBe(offset);
      }
    });
  });
});

editableTextComplianceTests('MarkdownEditorBridge', () => {
  const { bridge } = createBridge('hello world\nsecond line\nthird line');
  return bridge;
});
