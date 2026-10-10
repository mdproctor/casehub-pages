// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HighlightRenderer } from './highlight-renderer.js';

function createMockOverlay(): HTMLElement {
  const overlay = document.createElement('div');
  overlay.getBoundingClientRect = vi.fn(() => ({
    left: 0, top: 0, right: 800, bottom: 600, width: 800, height: 600, x: 0, y: 0, toJSON: () => {},
  }));
  return overlay;
}

type RectProvider = (from: number, to: number) => Array<{ left: number; top: number; right: number; bottom: number }>;

function createMockRectProvider(): RectProvider {
  return vi.fn((_from: number, _to: number) => [{
    left: 10, top: 0, right: 90, bottom: 20,
  }]);
}

describe('HighlightRenderer', () => {
  let overlay: HTMLElement;
  let rectProvider: RectProvider;
  let renderer: HighlightRenderer;

  beforeEach(() => {
    overlay = createMockOverlay();
    rectProvider = createMockRectProvider();
    renderer = new HighlightRenderer(overlay, rectProvider);
  });

  it('add creates an overlay element', () => {
    renderer.add('hl-1', 0, 10, { background: 'red' });
    expect(overlay.children).toHaveLength(1);
    const el = overlay.children[0] as HTMLElement;
    expect(el.style.position).toBe('absolute');
    expect(el.style.background).toBe('red');
  });

  it('add sets CSS transition for animation', () => {
    renderer.add('hl-1', 0, 10, { background: 'red' });
    const el = overlay.children[0] as HTMLElement;
    expect(el.style.transition).toContain('top');
    expect(el.style.transition).toContain('left');
  });

  it('add sets label as title attribute', () => {
    renderer.add('hl-1', 0, 10, { background: 'red', label: 'Error here' });
    const el = overlay.children[0] as HTMLElement;
    expect(el.title).toBe('Error here');
  });

  it('remove removes the overlay element', () => {
    renderer.add('hl-1', 0, 10, { background: 'red' });
    renderer.remove('hl-1');
    expect(overlay.children).toHaveLength(0);
  });

  it('clear removes all overlay elements', () => {
    renderer.add('hl-1', 0, 10, { background: 'red' });
    renderer.add('hl-2', 20, 30, { background: 'blue' });
    renderer.clear();
    expect(overlay.children).toHaveLength(0);
  });

  it('reposition updates element positions', () => {
    renderer.add('hl-1', 0, 10, { background: 'red' });
    const el = overlay.children[0] as HTMLElement;
    const initialLeft = el.style.left;
    (rectProvider as any).mockReturnValue([{ left: 100, top: 50, right: 180, bottom: 70 }]);
    renderer.reposition();
    expect(el.style.left).not.toBe(initialLeft);
  });

  it('destroy cleans up everything', () => {
    renderer.add('hl-1', 0, 10, { background: 'red' });
    renderer.startTracking();
    renderer.destroy();
    expect(overlay.children).toHaveLength(0);
  });

  it('add with border applies border style', () => {
    renderer.add('hl-1', 0, 10, { border: '2px solid blue', borderRadius: '4px' });
    const el = overlay.children[0] as HTMLElement;
    expect(el.style.border).toBe('2px solid blue');
    expect(el.style.borderRadius).toBe('4px');
  });

  it('remove is idempotent for unknown IDs', () => {
    renderer.remove('nonexistent');
    expect(overlay.children).toHaveLength(0);
  });
});
