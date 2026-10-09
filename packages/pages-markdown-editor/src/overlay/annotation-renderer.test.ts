// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AnnotationRenderer } from './annotation-renderer.js';
import type { AnnotationOptions, Position } from '@casehubio/pages-editor-core';

function createOverlayDiv(): HTMLDivElement {
  const div = document.createElement('div');
  document.body.appendChild(div);
  return div;
}

function mockCoordsProvider(): (offset: number) => { left: number; top: number; right: number; bottom: number } {
  return (offset: number) => ({
    left: offset * 10,
    top: 20,
    right: offset * 10 + 50,
    bottom: 40,
  });
}

describe('AnnotationRenderer', () => {
  let overlay: HTMLDivElement;
  let renderer: AnnotationRenderer;

  beforeEach(() => {
    overlay = createOverlayDiv();
    renderer = new AnnotationRenderer(overlay, mockCoordsProvider());
  });

  it('add creates a DOM element in the overlay', () => {
    renderer.add('ann-1', { line: 0, col: 5 }, { type: 'callout', text: 'Note' });
    expect(overlay.children.length).toBe(1);
    const el = overlay.children[0] as HTMLElement;
    expect(el.dataset['annotationId']).toBe('ann-1');
  });

  it('add creates elements with correct annotation type class', () => {
    renderer.add('ann-1', { line: 0, col: 0 }, { type: 'callout' });
    renderer.add('ann-2', { line: 0, col: 5 }, { type: 'arrow' });
    renderer.add('ann-3', { line: 1, col: 0 }, { type: 'marker' });
    renderer.add('ann-4', { line: 1, col: 3 }, { type: 'numbered', text: '1' });
    expect(overlay.querySelector('.annotation-callout')).toBeTruthy();
    expect(overlay.querySelector('.annotation-arrow')).toBeTruthy();
    expect(overlay.querySelector('.annotation-marker')).toBeTruthy();
    expect(overlay.querySelector('.annotation-numbered')).toBeTruthy();
  });

  it('callout annotation displays text', () => {
    renderer.add('ann-1', { line: 0, col: 0 }, { type: 'callout', text: 'Important note' });
    const el = overlay.querySelector('.annotation-callout') as HTMLElement;
    expect(el.textContent).toContain('Important note');
  });

  it('remove deletes the DOM element', () => {
    renderer.add('ann-1', { line: 0, col: 0 }, { type: 'callout' });
    expect(overlay.children.length).toBe(1);
    renderer.remove('ann-1');
    expect(overlay.children.length).toBe(0);
  });

  it('remove is a no-op for unknown ID', () => {
    renderer.remove('nonexistent');
    expect(overlay.children.length).toBe(0);
  });

  it('clear removes all DOM elements', () => {
    renderer.add('ann-1', { line: 0, col: 0 }, { type: 'callout' });
    renderer.add('ann-2', { line: 1, col: 0 }, { type: 'arrow' });
    renderer.add('ann-3', { line: 2, col: 0 }, { type: 'marker' });
    expect(overlay.children.length).toBe(3);
    renderer.clear();
    expect(overlay.children.length).toBe(0);
  });

  it('elements are positioned absolutely', () => {
    renderer.add('ann-1', { line: 0, col: 5 }, { type: 'callout', text: 'test' });
    const el = overlay.children[0] as HTMLElement;
    expect(el.style.position).toBe('absolute');
  });

  it('count returns number of active annotations', () => {
    expect(renderer.count).toBe(0);
    renderer.add('ann-1', { line: 0, col: 0 }, { type: 'callout' });
    renderer.add('ann-2', { line: 1, col: 0 }, { type: 'arrow' });
    expect(renderer.count).toBe(2);
    renderer.remove('ann-1');
    expect(renderer.count).toBe(1);
  });

  it('destroy cleans up all elements', () => {
    renderer.add('ann-1', { line: 0, col: 0 }, { type: 'callout' });
    renderer.destroy();
    expect(overlay.children.length).toBe(0);
    expect(renderer.count).toBe(0);
  });
});
