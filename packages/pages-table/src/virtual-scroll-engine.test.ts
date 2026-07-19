import { describe, it, expect } from 'vitest';
import { computeScrollWindow, extendWindowForSpans } from './virtual-scroll-engine.js';
import type { SpanMap } from './span-map.js';

describe('computeScrollWindow', () => {
  it('returns full range for small datasets', () => {
    const w = computeScrollWindow(0, 500, 48, 5, 5);
    expect(w).toEqual({ startIndex: 0, endIndex: 5, offsetY: 0, totalHeight: 240 });
  });

  it('returns empty range for zero rows', () => {
    const w = computeScrollWindow(0, 500, 48, 0, 5);
    expect(w).toEqual({ startIndex: 0, endIndex: 0, offsetY: 0, totalHeight: 0 });
  });

  it('computes visible window at top', () => {
    const w = computeScrollWindow(0, 480, 48, 100, 5);
    expect(w.startIndex).toBe(0);
    expect(w.endIndex).toBe(15); // 10 visible + 5 buffer below
    expect(w.offsetY).toBe(0);
    expect(w.totalHeight).toBe(4800);
  });

  it('computes visible window at scroll offset', () => {
    // scrollTop=960 → first visible row = 20, with 5 buffer above → start=15
    const w = computeScrollWindow(960, 480, 48, 100, 5);
    expect(w.startIndex).toBe(15);
    expect(w.endIndex).toBe(35); // 20+10visible+5buffer = 35
    expect(w.offsetY).toBe(720); // 15 * 48
  });

  it('clamps to dataset bounds', () => {
    // scrollTop near bottom of 100 rows
    const w = computeScrollWindow(4500, 480, 48, 100, 5);
    expect(w.endIndex).toBe(100);
    expect(w.startIndex).toBeLessThan(100);
  });

  it('handles single row', () => {
    const w = computeScrollWindow(0, 500, 48, 1, 5);
    expect(w).toEqual({ startIndex: 0, endIndex: 1, offsetY: 0, totalHeight: 48 });
  });

  it('handles container taller than content', () => {
    const w = computeScrollWindow(0, 1000, 48, 10, 5);
    expect(w.startIndex).toBe(0);
    expect(w.endIndex).toBe(10);
    expect(w.totalHeight).toBe(480);
  });
});

describe('extendWindowForSpans', () => {
  it('extends startIndex when a suppressed cell points to an earlier origin', () => {
    const spanMap: SpanMap = new Map([
      [5, new Map([['country', { colSpan: 1, rowSpan: 4 }]])],
      [6, new Map([['country', { originRow: 5, originCol: 'country' }]])],
      [7, new Map([['country', { originRow: 5, originCol: 'country' }]])],
      [8, new Map([['country', { originRow: 5, originCol: 'country' }]])],
    ]);
    const window = { startIndex: 7, endIndex: 20, offsetY: 336, totalHeight: 4800 };
    const result = extendWindowForSpans(window, spanMap, new Set(['country']));
    expect(result.startIndex).toBe(5);
  });

  it('returns unchanged window when no spans at boundaries', () => {
    const spanMap: SpanMap = new Map();
    const window = { startIndex: 10, endIndex: 25, offsetY: 480, totalHeight: 4800 };
    const result = extendWindowForSpans(window, spanMap, new Set(['country']));
    expect(result.startIndex).toBe(10);
    expect(result.endIndex).toBe(25);
  });

  it('extends endIndex when an origin span exceeds the window', () => {
    const spanMap: SpanMap = new Map([
      [23, new Map([['country', { colSpan: 1, rowSpan: 5 }]])],
    ]);
    const window = { startIndex: 10, endIndex: 25, offsetY: 480, totalHeight: 4800 };
    const result = extendWindowForSpans(window, spanMap, new Set(['country']));
    expect(result.endIndex).toBe(28);
  });

  it('handles multiple span columns — extends to earliest origin', () => {
    const spanMap: SpanMap = new Map([
      [3, new Map([['name', { colSpan: 1, rowSpan: 5 }]])],
      [5, new Map([['country', { colSpan: 1, rowSpan: 4 }]])],
      [7, new Map([
        ['country', { originRow: 5, originCol: 'country' }],
        ['name', { originRow: 3, originCol: 'name' }],
      ])],
    ]);
    const window = { startIndex: 7, endIndex: 20, offsetY: 336, totalHeight: 4800 };
    const result = extendWindowForSpans(window, spanMap, new Set(['country', 'name']));
    expect(result.startIndex).toBe(3);
  });

  it('ignores columns not in spanColumns set', () => {
    const spanMap: SpanMap = new Map([
      [5, new Map([['country', { colSpan: 1, rowSpan: 4 }]])],
      [7, new Map([['country', { originRow: 5, originCol: 'country' }]])],
    ]);
    const window = { startIndex: 7, endIndex: 20, offsetY: 336, totalHeight: 4800 };
    const result = extendWindowForSpans(window, spanMap, new Set(['name']));
    expect(result.startIndex).toBe(7);
  });

  it('does not extend when startIndex cell is an origin (not suppressed)', () => {
    const spanMap: SpanMap = new Map([
      [7, new Map([['country', { colSpan: 1, rowSpan: 3 }]])],
    ]);
    const window = { startIndex: 7, endIndex: 20, offsetY: 336, totalHeight: 4800 };
    const result = extendWindowForSpans(window, spanMap, new Set(['country']));
    expect(result.startIndex).toBe(7);
  });
});
