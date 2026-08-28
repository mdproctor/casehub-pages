import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { clearGrammarRegistry, registerGrammar } from '@casehubio/graph-core';
import type { GraphModel } from '@casehubio/graph-core';
import { defaultEditPolicy } from './edit-policy.js';
import type { DragEndResult } from './node-move-coordinator.js';

vi.mock('@xyflow/react', () => ({
  Handle: () => null,
  Position: { Top: 'top', Bottom: 'bottom', Left: 'left', Right: 'right' },
}));

// jsdom does not provide PointerEvent — polyfill as MouseEvent subclass
if (typeof globalThis.PointerEvent === 'undefined') {
  (globalThis as any).PointerEvent = class PointerEvent extends MouseEvent {
    readonly pointerId: number;
    constructor(type: string, init?: PointerEventInit) {
      super(type, init);
      this.pointerId = init?.pointerId ?? 0;
    }
  };
}

function makeGrammar(type: string, outMax: number, allowedTo: string[]) {
  return {
    type,
    connections: {
      inbound: { min: 0, max: 10, allowedFrom: [] as string[] },
      outbound: { min: 0, max: outMax, allowedTo },
    },
  };
}

function makeModel(): GraphModel {
  return {
    nodes: [
      { id: 'a', type: 'start', properties: {} },
      { id: 'x', type: 'worker', properties: {} },
      { id: 'b', type: 'end', properties: {} },
    ],
    edges: [
      { id: 'e1', type: 'default', source: 'a', target: 'x' },
      { id: 'e2', type: 'default', source: 'x', target: 'b' },
    ],
  };
}

function makeDisconnectedModel(): GraphModel {
  return {
    nodes: [
      { id: 'x', type: 'worker', properties: {} },
      { id: 'p', type: 'start', properties: {} },
      { id: 'q', type: 'end', properties: {} },
    ],
    edges: [
      { id: 'e-pq', type: 'flow', source: 'p', target: 'q' },
    ],
  };
}

function setupContainer(): HTMLDivElement {
  const container = document.createElement('div');
  document.body.appendChild(container);

  const nodeEl = document.createElement('div');
  nodeEl.className = 'react-flow__node';
  nodeEl.dataset['id'] = 'x';
  const wrapper = document.createElement('div');
  wrapper.className = 'stencil-decoration-wrapper';
  wrapper.textContent = 'Node X';
  nodeEl.appendChild(wrapper);
  container.appendChild(nodeEl);

  return container;
}

describe('NodeMoveCoordinator', () => {
  let container: HTMLDivElement;
  let onResult: ReturnType<typeof vi.fn>;
  let createNodeMoveCoordinator: typeof import('./node-move-coordinator.js').createNodeMoveCoordinator;

  beforeEach(async () => {
    clearGrammarRegistry();
    registerGrammar(makeGrammar('start', 10, []));
    registerGrammar(makeGrammar('worker', 10, []));
    registerGrammar(makeGrammar('end', 10, []));
    container = setupContainer();
    onResult = vi.fn();
    const mod = await import('./node-move-coordinator.js');
    createNodeMoveCoordinator = mod.createNodeMoveCoordinator;
  });

  afterEach(() => {
    clearGrammarRegistry();
    container.remove();
  });

  it('does not stop propagation on pointerdown — lets React Flow start connection', () => {
    const coord = createNodeMoveCoordinator({
      editPolicy: defaultEditPolicy(),
      containerEl: container,
      onResult,
    });

    const event = new PointerEvent('pointerdown', {
      clientX: 100, clientY: 100, bubbles: true, cancelable: true,
    });
    const stopSpy = vi.spyOn(event, 'stopPropagation');

    coord.startDrag('x', event, makeDisconnectedModel());

    expect(stopSpy).not.toHaveBeenCalled();

    coord.dispose();
  });

  it('does not ghost before hold timer fires', () => {
    const coord = createNodeMoveCoordinator({
      editPolicy: defaultEditPolicy(),
      containerEl: container,
      onResult,
    });

    coord.startDrag('x', new PointerEvent('pointerdown', {
      clientX: 100, clientY: 100, bubbles: true,
    }), makeModel());

    const nodeEl = container.querySelector('.react-flow__node')!;
    expect(nodeEl.classList.contains('node-move-ghost')).toBe(false);

    coord.dispose();
  });

  it('ghosts node immediately when hold timer fires — before any drag', () => {
    vi.useFakeTimers();
    const coord = createNodeMoveCoordinator({
      editPolicy: defaultEditPolicy(),
      containerEl: container,
      onResult,
    });

    coord.startDrag('x', new PointerEvent('pointerdown', {
      clientX: 100, clientY: 100, bubbles: true,
    }), makeDisconnectedModel());

    const nodeEl = container.querySelector('.react-flow__node')!;
    expect(nodeEl.classList.contains('node-move-ghost')).toBe(false);

    vi.advanceTimersByTime(350);

    // Ghost appears on hold complete, BEFORE any pointermove
    expect(nodeEl.classList.contains('node-move-ghost')).toBe(true);

    coord.dispose();
    vi.useRealTimers();
  });

  it('reports isActive after hold completes', () => {
    vi.useFakeTimers();
    const coord = createNodeMoveCoordinator({
      editPolicy: defaultEditPolicy(),
      containerEl: container,
      onResult,
    });

    coord.startDrag('x', new PointerEvent('pointerdown', {
      clientX: 100, clientY: 100, bubbles: true,
    }), makeDisconnectedModel());

    expect(coord.isActive).toBe(false);
    vi.advanceTimersByTime(350);
    expect(coord.isActive).toBe(true);

    coord.dispose();
    vi.useRealTimers();
  });

  it('adds node-move-active class to container on hold to suppress connection line', () => {
    vi.useFakeTimers();
    const coord = createNodeMoveCoordinator({
      editPolicy: defaultEditPolicy(),
      containerEl: container,
      onResult,
    });

    coord.startDrag('x', new PointerEvent('pointerdown', {
      clientX: 100, clientY: 100, bubbles: true,
    }), makeDisconnectedModel());

    expect(container.classList.contains('node-move-active')).toBe(false);
    vi.advanceTimersByTime(350);
    expect(container.classList.contains('node-move-active')).toBe(true);

    coord.dispose();
    expect(container.classList.contains('node-move-active')).toBe(false);
    vi.useRealTimers();
  });

  it('cancels hold if pointer moves during hold period', () => {
    vi.useFakeTimers();
    const coord = createNodeMoveCoordinator({
      editPolicy: defaultEditPolicy(),
      containerEl: container,
      onResult,
    });

    coord.startDrag('x', new PointerEvent('pointerdown', {
      clientX: 100, clientY: 100, bubbles: true,
    }), makeDisconnectedModel());

    // Move beyond tolerance during hold period
    document.dispatchEvent(new PointerEvent('pointermove', {
      clientX: 110, clientY: 110, bubbles: true,
    }));

    // Timer fires but hold was cancelled
    vi.advanceTimersByTime(350);

    document.dispatchEvent(new PointerEvent('pointermove', {
      clientX: 130, clientY: 130, bubbles: true,
    }));

    const nodeEl = container.querySelector('.react-flow__node')!;
    expect(nodeEl.classList.contains('node-move-ghost')).toBe(false);

    coord.dispose();
    vi.useRealTimers();
  });

  it('ineligible node with parentId is a no-op', () => {
    vi.useFakeTimers();
    const coord = createNodeMoveCoordinator({
      editPolicy: defaultEditPolicy(),
      containerEl: container,
      onResult,
    });

    const model: GraphModel = {
      nodes: [
        { id: 'x', type: 'worker', parentId: 'container1', properties: {} },
        { id: 'container1', type: 'start', properties: {} },
      ],
      edges: [],
    };

    coord.startDrag('x', new PointerEvent('pointerdown', {
      clientX: 100, clientY: 100, bubbles: true,
    }), model);

    vi.advanceTimersByTime(350);
    document.dispatchEvent(new PointerEvent('pointermove', { clientX: 120, clientY: 120, bubbles: true }));

    const nodeEl = container.querySelector('.react-flow__node')!;
    expect(nodeEl.classList.contains('node-move-ghost')).toBe(false);

    coord.dispose();
    vi.useRealTimers();
  });

  it('ineligible node with children is a no-op', () => {
    vi.useFakeTimers();
    const coord = createNodeMoveCoordinator({
      editPolicy: defaultEditPolicy(),
      containerEl: container,
      onResult,
    });

    const model: GraphModel = {
      nodes: [
        { id: 'x', type: 'worker', properties: {} },
        { id: 'child1', type: 'end', parentId: 'x', properties: {} },
      ],
      edges: [],
    };

    coord.startDrag('x', new PointerEvent('pointerdown', {
      clientX: 100, clientY: 100, bubbles: true,
    }), model);

    vi.advanceTimersByTime(350);
    document.dispatchEvent(new PointerEvent('pointermove', { clientX: 120, clientY: 120, bubbles: true }));

    const nodeEl = container.querySelector('.react-flow__node')!;
    expect(nodeEl.classList.contains('node-move-ghost')).toBe(false);

    coord.dispose();
    vi.useRealTimers();
  });

  it('cancels when pointerup without hitting valid edge after hold', () => {
    vi.useFakeTimers();
    const coord = createNodeMoveCoordinator({
      editPolicy: defaultEditPolicy(),
      containerEl: container,
      onResult,
    });

    coord.startDrag('x', new PointerEvent('pointerdown', {
      clientX: 100, clientY: 100, bubbles: true,
    }), makeDisconnectedModel());

    vi.advanceTimersByTime(350);

    document.dispatchEvent(new PointerEvent('pointermove', { clientX: 120, clientY: 120, bubbles: true }));
    document.dispatchEvent(new PointerEvent('pointerup', { clientX: 120, clientY: 120, bubbles: true }));

    expect(onResult).toHaveBeenCalledWith({ type: 'cancelled' });
    const nodeEl = container.querySelector('.react-flow__node')!;
    expect(nodeEl.classList.contains('node-move-ghost')).toBe(false);

    coord.dispose();
    vi.useRealTimers();
  });

  it('cancels on quick release during hold period', () => {
    vi.useFakeTimers();
    const coord = createNodeMoveCoordinator({
      editPolicy: defaultEditPolicy(),
      containerEl: container,
      onResult,
    });

    coord.startDrag('x', new PointerEvent('pointerdown', {
      clientX: 100, clientY: 100, bubbles: true,
    }), makeModel());

    // Release before hold timer — connection/click, not move
    document.dispatchEvent(new PointerEvent('pointerup', { clientX: 101, clientY: 101, bubbles: true }));

    // Hold timer fires after release — should be no-op
    vi.advanceTimersByTime(350);

    const nodeEl = container.querySelector('.react-flow__node')!;
    expect(nodeEl.classList.contains('node-move-ghost')).toBe(false);

    coord.dispose();
    vi.useRealTimers();
  });

  it('cancels after 500ms when pointer leaves container', () => {
    vi.useFakeTimers();
    const coord = createNodeMoveCoordinator({
      editPolicy: defaultEditPolicy(),
      containerEl: container,
      onResult,
    });

    coord.startDrag('x', new PointerEvent('pointerdown', {
      clientX: 100, clientY: 100, bubbles: true,
    }), makeDisconnectedModel());

    vi.advanceTimersByTime(350); // hold completes
    const nodeEl = container.querySelector('.react-flow__node')!;
    expect(nodeEl.classList.contains('node-move-ghost')).toBe(true);

    // Pointer leaves container
    container.dispatchEvent(new PointerEvent('pointerleave', { bubbles: false }));

    // Ghost still visible during 500ms grace period
    vi.advanceTimersByTime(400);
    expect(nodeEl.classList.contains('node-move-ghost')).toBe(true);

    // After 500ms, auto-cancels
    vi.advanceTimersByTime(200);
    expect(nodeEl.classList.contains('node-move-ghost')).toBe(false);
    expect(onResult).toHaveBeenCalledWith({ type: 'cancelled' });

    vi.useRealTimers();
  });

  it('does not cancel if pointer re-enters within 500ms', () => {
    vi.useFakeTimers();
    const coord = createNodeMoveCoordinator({
      editPolicy: defaultEditPolicy(),
      containerEl: container,
      onResult,
    });

    coord.startDrag('x', new PointerEvent('pointerdown', {
      clientX: 100, clientY: 100, bubbles: true,
    }), makeDisconnectedModel());

    vi.advanceTimersByTime(350);

    container.dispatchEvent(new PointerEvent('pointerleave', { bubbles: false }));
    vi.advanceTimersByTime(300);
    container.dispatchEvent(new PointerEvent('pointerenter', { bubbles: false }));
    vi.advanceTimersByTime(300);

    const nodeEl = container.querySelector('.react-flow__node')!;
    expect(nodeEl.classList.contains('node-move-ghost')).toBe(true);
    expect(onResult).not.toHaveBeenCalled();

    coord.dispose();
    vi.useRealTimers();
  });

  it('dispose cleans up ghost and clone after hold', () => {
    vi.useFakeTimers();
    const coord = createNodeMoveCoordinator({
      editPolicy: defaultEditPolicy(),
      containerEl: container,
      onResult,
    });

    coord.startDrag('x', new PointerEvent('pointerdown', {
      clientX: 100, clientY: 100, bubbles: true,
    }), makeDisconnectedModel());

    vi.advanceTimersByTime(350);
    document.dispatchEvent(new PointerEvent('pointermove', { clientX: 120, clientY: 120, bubbles: true }));

    const nodeEl = container.querySelector('.react-flow__node')!;
    expect(nodeEl.classList.contains('node-move-ghost')).toBe(true);

    coord.dispose();

    expect(nodeEl.classList.contains('node-move-ghost')).toBe(false);
    vi.useRealTimers();
  });
});
