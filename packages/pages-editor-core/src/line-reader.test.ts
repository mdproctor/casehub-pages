import { describe, it, expect } from 'vitest';
import type { Position, HighlightOptions } from './types.js';
import { EditableTextBridge } from './editable-text-bridge.js';

const TEXT = 'Hello world. This is a test. Another sentence here.';

class ReaderTestBridge extends EditableTextBridge {
  appliedHighlights: Array<{ id: string; from: Position; to: Position; style: HighlightOptions }> = [];
  removedHighlights: string[] = [];

  getText() { return TEXT; }
  getLine(line: number) { return TEXT.split('\n')[line] ?? ''; }
  getLineCount() { return 1; }
  setContent() {}
  findText(query: string) {
    const results: Position[] = [];
    let idx = 0;
    while ((idx = TEXT.indexOf(query, idx)) !== -1) {
      results.push({ line: 0, col: idx });
      idx += query.length;
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
  protected override clearHighlightDecorations() {}
}

describe('LineReader', () => {
  it('createReader returns a reader with initial position', () => {
    const bridge = new ReaderTestBridge();
    const reader = bridge.createReader();
    expect(reader.position()).toEqual({ line: 0, col: 0 });
  });

  it('createReader creates a highlight', () => {
    const bridge = new ReaderTestBridge();
    bridge.createReader();
    expect(bridge.appliedHighlights.length).toBeGreaterThan(0);
  });

  it('moveTo updates highlight position', () => {
    const bridge = new ReaderTestBridge();
    const reader = bridge.createReader();
    const initialCount = bridge.appliedHighlights.length;
    reader.moveTo({ line: 0, col: 13 });
    expect(reader.position()).toEqual({ line: 0, col: 13 });
    expect(bridge.appliedHighlights.length).toBeGreaterThan(initialCount);
  });

  it('advance moves to next sentence', () => {
    const bridge = new ReaderTestBridge();
    const reader = bridge.createReader();
    reader.advance();
    const pos = reader.position();
    expect(pos.col).toBeGreaterThan(0);
  });

  it('dispose removes the highlight', () => {
    const bridge = new ReaderTestBridge();
    const reader = bridge.createReader();
    reader.dispose();
    expect(bridge.removedHighlights.length).toBeGreaterThan(0);
  });

  it('createReader accepts custom style', () => {
    const bridge = new ReaderTestBridge();
    bridge.createReader({ background: 'rgba(0,255,0,0.2)' });
    expect(bridge.appliedHighlights[0]!.style.background).toBe('rgba(0,255,0,0.2)');
  });

  it('advance past last sentence stays on last line', () => {
    const bridge = new ReaderTestBridge();
    const reader = bridge.createReader();
    reader.advance();
    reader.advance();
    reader.advance();
    reader.advance();
    const pos = reader.position();
    expect(pos.line).toBe(0);
  });
});
