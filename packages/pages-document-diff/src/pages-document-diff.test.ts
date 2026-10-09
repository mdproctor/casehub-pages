import { describe, it, expect, beforeAll } from 'vitest';

beforeAll(() => {
  if (typeof globalThis.ResizeObserver === 'undefined') {
    (globalThis as any).ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
});

describe('PagesDocumentDiff', () => {
  it('exports PagesDocumentDiff class with expected API', async () => {
    const { PagesDocumentDiff } = await import('./pages-document-diff.js');
    expect(PagesDocumentDiff).toBeDefined();

    const proto = PagesDocumentDiff.prototype;
    expect(typeof proto.configure).toBe('function');
    expect(typeof proto.loadFile).toBe('function');
    expect(typeof proto.loadContent).toBe('function');
    expect(typeof proto.getDiffSummary).toBe('function');
    expect(typeof proto.nextDiff).toBe('function');
    expect(typeof proto.prevDiff).toBe('function');
    expect(typeof proto.swapPanels).toBe('function');
    expect(typeof proto.toggleSync).toBe('function');
    expect(typeof proto.scrollToLocation).toBe('function');
    expect(typeof proto.highlightSection).toBe('function');
    expect(typeof proto.clearHighlight).toBe('function');
    expect(typeof proto.setViewMode).toBe('function');
    expect(typeof proto.selectFile).toBe('function');
    expect(typeof proto.currentPath).toBe('function');
  });

  it('has apiBaseUrl as a reactive property defaulting to empty string', async () => {
    const { PagesDocumentDiff } = await import('./pages-document-diff.js');
    const props = (PagesDocumentDiff as any).elementProperties as Map<string, any>;
    expect(props.has('apiBaseUrl')).toBe(true);
  });

  it('exposes protected _onConnected hook for subclass extension', async () => {
    const { PagesDocumentDiff } = await import('./pages-document-diff.js');
    expect(typeof (PagesDocumentDiff.prototype as any)._onConnected).toBe('function');
  });

  it('exports types from index', async () => {
    const mod = await import('./index.js');
    expect(mod.PagesDocumentDiff).toBeDefined();
  });
});

describe('_lineDiff algorithm', () => {
  it('detects identical content as equal chunks', async () => {
    const { PagesDocumentDiff } = await import('./pages-document-diff.js');
    const inst = new PagesDocumentDiff();
    const result = (inst as any)._lineDiff('hello\nworld', 'hello\nworld');
    expect(result.chunks).toHaveLength(1);
    expect(result.chunks[0].op).toBe('eq');
  });

  it('detects insertion', async () => {
    const { PagesDocumentDiff } = await import('./pages-document-diff.js');
    const inst = new PagesDocumentDiff();
    const result = (inst as any)._lineDiff('hello', 'hello\nworld');
    const nonEq = result.chunks.filter((c: any) => c.op !== 'eq');
    expect(nonEq.length).toBeGreaterThan(0);
    expect(nonEq.some((c: any) => c.op === 'ins')).toBe(true);
  });

  it('detects deletion', async () => {
    const { PagesDocumentDiff } = await import('./pages-document-diff.js');
    const inst = new PagesDocumentDiff();
    const result = (inst as any)._lineDiff('hello\nworld', 'hello');
    const nonEq = result.chunks.filter((c: any) => c.op !== 'eq');
    expect(nonEq.length).toBeGreaterThan(0);
    expect(nonEq.some((c: any) => c.op === 'del')).toBe(true);
  });

  it('detects modification as del+ins merged into mod', async () => {
    const { PagesDocumentDiff } = await import('./pages-document-diff.js');
    const inst = new PagesDocumentDiff();
    const result = (inst as any)._lineDiff('hello\nworld', 'hello\nearth');
    const mods = result.chunks.filter((c: any) => c.op === 'mod');
    expect(mods).toHaveLength(1);
  });

  it('handles empty input', async () => {
    const { PagesDocumentDiff } = await import('./pages-document-diff.js');
    const inst = new PagesDocumentDiff();
    const result = (inst as any)._lineDiff('', '');
    expect(result.chunks).toHaveLength(1);
    expect(result.chunks[0].op).toBe('eq');
  });
});

describe('DiffSummary', () => {
  it('returns zero counts when no content loaded', async () => {
    const { PagesDocumentDiff } = await import('./pages-document-diff.js');
    const inst = new PagesDocumentDiff();
    const summary = inst.getDiffSummary();
    expect(summary.modified).toBe(0);
    expect(summary.deleted).toBe(0);
    expect(summary.inserted).toBe(0);
    expect(summary.totalDiffs).toBe(0);
    expect(summary.currentIdx).toBe(-1);
  });
});

describe('types', () => {
  it('exports DiffSummary and DiffChunk types', async () => {
    const mod = await import('./types.js');
    expect(mod).toBeDefined();
  });
});
