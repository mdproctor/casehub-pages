import type { HighlightOptions } from '@casehubio/pages-editor-core';

type RectProvider = (from: number, to: number) => Array<{ left: number; top: number; right: number; bottom: number }>;

interface RenderedHighlight {
  id: string;
  from: number;
  to: number;
  options: HighlightOptions;
  elements: HTMLElement[];
}

export class HighlightRenderer {
  private _highlights = new Map<string, RenderedHighlight>();
  private _rafId: number | null = null;

  constructor(
    private readonly overlay: HTMLElement,
    private readonly rectsFor: RectProvider,
  ) {}

  add(id: string, from: number, to: number, options: HighlightOptions): void {
    this.remove(id);
    const rects = this.rectsFor(from, to);
    const overlayRect = this.overlay.getBoundingClientRect();
    const elements = rects.map(rect => {
      const el = document.createElement('div');
      el.className = 'highlight-overlay';
      el.dataset['highlightId'] = id;
      el.style.position = 'absolute';
      el.style.pointerEvents = 'none';
      el.style.transition = 'top 0.3s ease, left 0.3s ease, width 0.3s ease, height 0.3s ease';
      el.style.left = `${rect.left - overlayRect.left}px`;
      el.style.top = `${rect.top - overlayRect.top}px`;
      el.style.width = `${rect.right - rect.left}px`;
      el.style.height = `${rect.bottom - rect.top}px`;
      if (options.background) el.style.background = options.background;
      if (options.border) el.style.border = options.border;
      if (options.borderRadius) el.style.borderRadius = options.borderRadius;
      if (options.textDecoration) el.style.textDecoration = options.textDecoration;
      if (options.label) el.title = options.label;
      this.overlay.appendChild(el);
      return el;
    });
    this._highlights.set(id, { id, from, to, options, elements });
  }

  remove(id: string): void {
    const hl = this._highlights.get(id);
    if (hl) {
      for (const el of hl.elements) el.remove();
      this._highlights.delete(id);
    }
  }

  clear(): void {
    for (const hl of this._highlights.values()) {
      for (const el of hl.elements) el.remove();
    }
    this._highlights.clear();
  }

  reposition(): void {
    const overlayRect = this.overlay.getBoundingClientRect();
    for (const hl of this._highlights.values()) {
      const rects = this.rectsFor(hl.from, hl.to);
      for (let i = 0; i < hl.elements.length; i++) {
        const rect = rects[i];
        const el = hl.elements[i];
        if (rect && el) {
          el.style.left = `${rect.left - overlayRect.left}px`;
          el.style.top = `${rect.top - overlayRect.top}px`;
          el.style.width = `${rect.right - rect.left}px`;
          el.style.height = `${rect.bottom - rect.top}px`;
        }
      }
    }
  }

  startTracking(): void {
    if (this._rafId !== null) return;
    const tick = () => {
      this.reposition();
      this._rafId = requestAnimationFrame(tick);
    };
    this._rafId = requestAnimationFrame(tick);
  }

  stopTracking(): void {
    if (this._rafId !== null) {
      cancelAnimationFrame(this._rafId);
      this._rafId = null;
    }
  }

  destroy(): void {
    this.stopTracking();
    this.clear();
  }
}
