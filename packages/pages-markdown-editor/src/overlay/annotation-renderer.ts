import type { AnnotationOptions, Position } from '@casehubio/pages-editor-core';

type CoordsProvider = (offset: number) => { left: number; top: number; right: number; bottom: number };

interface RenderedAnnotation {
  id: string;
  anchor: Position;
  options: AnnotationOptions;
  element: HTMLElement;
}

export class AnnotationRenderer {
  private _annotations = new Map<string, RenderedAnnotation>();
  private _rafId: number | null = null;

  constructor(
    private readonly overlay: HTMLElement,
    private readonly coordsAt: CoordsProvider,
  ) {}

  add(id: string, anchor: Position, options: AnnotationOptions): void {
    const element = this._createElement(id, anchor, options);
    this.overlay.appendChild(element);
    this._annotations.set(id, { id, anchor, options, element });
    this._positionElement(element, anchor);
  }

  remove(id: string): void {
    const ann = this._annotations.get(id);
    if (ann) {
      ann.element.remove();
      this._annotations.delete(id);
    }
  }

  clear(): void {
    for (const ann of this._annotations.values()) {
      ann.element.remove();
    }
    this._annotations.clear();
  }

  get count(): number {
    return this._annotations.size;
  }

  reposition(): void {
    for (const ann of this._annotations.values()) {
      this._positionElement(ann.element, ann.anchor);
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

  private _positionElement(element: HTMLElement, anchor: Position): void {
    const offset = anchor.line * 1000 + anchor.col;
    try {
      const coords = this.coordsAt(offset);
      const overlayRect = this.overlay.getBoundingClientRect();
      element.style.left = `${coords.left - overlayRect.left}px`;
      element.style.top = `${coords.bottom - overlayRect.top}px`;
    } catch {
      // coordsAt may fail if position is out of viewport
    }
  }

  private _createElement(id: string, _anchor: Position, options: AnnotationOptions): HTMLElement {
    const el = document.createElement('div');
    el.className = `annotation annotation-${options.type}`;
    el.dataset['annotationId'] = id;
    el.style.position = 'absolute';
    el.style.pointerEvents = 'auto';
    el.style.zIndex = '10';

    switch (options.type) {
      case 'callout':
        el.style.padding = '4px 8px';
        el.style.borderRadius = '4px';
        el.style.background = 'var(--pages-accent-3, #c7d2fe)';
        el.style.border = '1px solid var(--pages-accent-7, #818cf8)';
        el.style.fontSize = '12px';
        el.style.maxWidth = '200px';
        if (options.text) el.textContent = options.text;
        break;
      case 'arrow':
        el.style.width = '16px';
        el.style.height = '16px';
        el.innerHTML = '<svg viewBox="0 0 16 16" width="16" height="16"><path d="M8 2L14 10H2Z" fill="var(--pages-accent-9, #6366f1)"/></svg>';
        break;
      case 'marker':
        el.style.width = '12px';
        el.style.height = '12px';
        el.style.borderRadius = '50%';
        el.style.background = 'var(--pages-accent-9, #6366f1)';
        break;
      case 'numbered':
        el.style.width = '20px';
        el.style.height = '20px';
        el.style.borderRadius = '50%';
        el.style.background = 'var(--pages-accent-9, #6366f1)';
        el.style.color = 'white';
        el.style.display = 'flex';
        el.style.alignItems = 'center';
        el.style.justifyContent = 'center';
        el.style.fontSize = '11px';
        el.style.fontWeight = '600';
        if (options.text) el.textContent = options.text;
        break;
    }

    if (options.style) {
      for (const [key, value] of Object.entries(options.style)) {
        el.style.setProperty(key, value);
      }
    }

    return el;
  }
}
