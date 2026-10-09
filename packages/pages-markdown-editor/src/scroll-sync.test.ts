import { describe, it, expect } from 'vitest';
import { buildScrollAnchors, interpolateScroll, type ScrollAnchor } from './scroll-sync.js';

describe('ScrollSync', () => {
  describe('buildScrollAnchors', () => {
    it('builds anchors from matching heading positions', () => {
      const sourceHeadings = [
        { text: '# Introduction', offsetTop: 0 },
        { text: '## Methods', offsetTop: 200 },
        { text: '## Results', offsetTop: 500 },
      ];
      const targetHeadings = [
        { text: '# Introduction', offsetTop: 0 },
        { text: '## Methods', offsetTop: 100 },
        { text: '## Results', offsetTop: 350 },
      ];

      const anchors = buildScrollAnchors(sourceHeadings, targetHeadings);
      expect(anchors).toHaveLength(3);
      expect(anchors[0]).toEqual({ sourceOffset: 0, targetOffset: 0 });
      expect(anchors[1]).toEqual({ sourceOffset: 200, targetOffset: 100 });
      expect(anchors[2]).toEqual({ sourceOffset: 500, targetOffset: 350 });
    });

    it('skips unmatched headings', () => {
      const sourceHeadings = [
        { text: '# Intro', offsetTop: 0 },
        { text: '## Only Source', offsetTop: 100 },
        { text: '## Shared', offsetTop: 300 },
      ];
      const targetHeadings = [
        { text: '# Intro', offsetTop: 0 },
        { text: '## Only Target', offsetTop: 80 },
        { text: '## Shared', offsetTop: 200 },
      ];

      const anchors = buildScrollAnchors(sourceHeadings, targetHeadings);
      expect(anchors).toHaveLength(2);
      expect(anchors[0]).toEqual({ sourceOffset: 0, targetOffset: 0 });
      expect(anchors[1]).toEqual({ sourceOffset: 300, targetOffset: 200 });
    });

    it('returns empty array when no headings match', () => {
      const anchors = buildScrollAnchors(
        [{ text: '# A', offsetTop: 0 }],
        [{ text: '# B', offsetTop: 0 }],
      );
      expect(anchors).toHaveLength(0);
    });

    it('returns empty array when inputs are empty', () => {
      expect(buildScrollAnchors([], [])).toHaveLength(0);
    });
  });

  describe('interpolateScroll', () => {
    const anchors: ScrollAnchor[] = [
      { sourceOffset: 0, targetOffset: 0 },
      { sourceOffset: 200, targetOffset: 100 },
      { sourceOffset: 600, targetOffset: 400 },
    ];

    it('returns 0 for position before first anchor', () => {
      expect(interpolateScroll(0, anchors)).toBe(0);
    });

    it('returns exact anchor position when on an anchor', () => {
      expect(interpolateScroll(200, anchors)).toBe(100);
      expect(interpolateScroll(600, anchors)).toBe(400);
    });

    it('interpolates linearly between anchors', () => {
      const result = interpolateScroll(100, anchors);
      expect(result).toBe(50);
    });

    it('interpolates between later anchors', () => {
      const result = interpolateScroll(400, anchors);
      expect(result).toBe(250);
    });

    it('extrapolates past last anchor', () => {
      const result = interpolateScroll(800, anchors);
      expect(result).toBe(550);
    });

    it('returns 0 with empty anchors', () => {
      expect(interpolateScroll(100, [])).toBe(0);
    });

    it('uses single anchor as offset', () => {
      const single: ScrollAnchor[] = [{ sourceOffset: 100, targetOffset: 50 }];
      expect(interpolateScroll(200, single)).toBe(150);
    });
  });
});
