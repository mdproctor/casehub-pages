import { describe, it, expect } from 'vitest';
import { computeNodeBounds, computeExportViewport } from './diagram-export.js';

describe('computeNodeBounds', () => {
  it('returns zero bounds for empty array', () => {
    const bounds = computeNodeBounds([]);
    expect(bounds).toEqual({ x: 0, y: 0, width: 0, height: 0 });
  });

  it('computes bounds from node positions and sizes', () => {
    const nodes = [
      { position: { x: 10, y: 20 }, width: 100, height: 50 },
      { position: { x: 200, y: 30 }, width: 80, height: 40 },
    ];
    const bounds = computeNodeBounds(nodes);
    expect(bounds.x).toBe(10);
    expect(bounds.y).toBe(20);
    expect(bounds.width).toBe(270);
    expect(bounds.height).toBe(50);
  });

  it('uses measured dimensions when available', () => {
    const nodes = [
      { position: { x: 0, y: 0 }, measured: { width: 200, height: 100 } },
    ];
    const bounds = computeNodeBounds(nodes);
    expect(bounds.width).toBe(200);
    expect(bounds.height).toBe(100);
  });

  it('falls back to defaults when no dimensions given', () => {
    const nodes = [{ position: { x: 0, y: 0 } }];
    const bounds = computeNodeBounds(nodes);
    expect(bounds.width).toBe(150);
    expect(bounds.height).toBe(40);
  });
});

describe('computeExportViewport', () => {
  it('returns identity for zero bounds', () => {
    const vp = computeExportViewport({ x: 0, y: 0, width: 0, height: 0 }, 1920, 1080);
    expect(vp).toEqual({ x: 0, y: 0, zoom: 1 });
  });

  it('zooms to fit content', () => {
    const bounds = { x: 0, y: 0, width: 500, height: 300 };
    const vp = computeExportViewport(bounds, 1920, 1080);
    expect(vp.zoom).toBeGreaterThan(0);
    expect(vp.zoom).toBeLessThanOrEqual(1920 / (500 + 40));
  });

  it('clamps zoom to minimum', () => {
    const bounds = { x: 0, y: 0, width: 10000, height: 10000 };
    const vp = computeExportViewport(bounds, 1920, 1080);
    expect(vp.zoom).toBe(0.5);
  });
});
