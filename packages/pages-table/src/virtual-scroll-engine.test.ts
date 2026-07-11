import { describe, it, expect } from 'vitest';
import { computeScrollWindow } from './virtual-scroll-engine.js';

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
