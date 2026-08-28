import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { html } from 'lit-html';
import type { GraphNode, NodeDecoration } from '@casehubio/graph-core';
import { registerGrammar, clearGrammarRegistry } from '@casehubio/graph-core';

vi.mock('@xyflow/react', () => ({
  Handle: ({ type, position, style, className }: { type: string; position: string; style?: React.CSSProperties; className?: string }) =>
    React.createElement('div', { 'data-handletype': type, 'data-handlepos': position, style, className }),
  Position: { Top: 'top', Bottom: 'bottom', Left: 'left', Right: 'right' },
}));

import { createStencilNodeComponent, type StencilRenderFn } from './stencil-wrapper.js';

function mountWithProps(
  Component: React.ComponentType<any>,
  props: Record<string, unknown>,
): { container: HTMLDivElement; unmount: () => void } {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(React.createElement(Component, props));
  });
  return {
    container,
    unmount: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

const defaultNodeProps = {
  id: 'n1',
  type: 'test',
  data: { label: 'Test Node', _sourceHandlePosition: 'bottom', _targetHandlePosition: 'top' } as Record<string, unknown>,
  dragging: false,
  zIndex: 0,
  selectable: true,
  deletable: true,
  selected: false,
  draggable: true,
  isConnectable: true,
  positionAbsoluteX: 0,
  positionAbsoluteY: 0,
};

describe('createStencilNodeComponent', () => {
  beforeEach(() => {
    clearGrammarRegistry();
  });

  afterEach(() => {
    clearGrammarRegistry();
  });

  it('returns a function', () => {
    const renderFn: StencilRenderFn = () => html`<div>test</div>`;
    const Component = createStencilNodeComponent(renderFn);
    expect(typeof Component).toBe('function');
  });

  it('renders Lit template into container', () => {
    const renderFn: StencilRenderFn = (node) =>
      html`<span class="label">${String(node.properties['label'] ?? '')}</span>`;
    const Component = createStencilNodeComponent(renderFn);
    const { container, unmount } = mountWithProps(Component, defaultNodeProps);
    expect(container.querySelector('.label')?.textContent).toBe('Test Node');
    unmount();
  });

  it('passes correct GraphNode to render function', () => {
    const receivedNodes: GraphNode[] = [];
    const renderFn: StencilRenderFn = (node) => {
      receivedNodes.push(node);
      return html`<div>ok</div>`;
    };
    const Component = createStencilNodeComponent(renderFn);
    const { unmount } = mountWithProps(Component, {
      ...defaultNodeProps,
      id: 'x1',
      type: 'worker',
      parentId: 'p1',
      data: { count: 42 },
    });
    expect(receivedNodes).toHaveLength(1);
    expect(receivedNodes[0]!.id).toBe('x1');
    expect(receivedNodes[0]!.type).toBe('worker');
    expect(receivedNodes[0]!.parentId).toBe('p1');
    expect(receivedNodes[0]!.properties).toEqual({ count: 42 });
    unmount();
  });

  it('updates template when data changes', () => {
    const renderFn: StencilRenderFn = (node) =>
      html`<span class="v">${String(node.properties['val'] ?? '')}</span>`;
    const Component = createStencilNodeComponent(renderFn);
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(React.createElement(Component, { ...defaultNodeProps, data: { val: 'A' } }));
    });
    expect(container.querySelector('.v')?.textContent).toBe('A');

    act(() => {
      root.render(React.createElement(Component, { ...defaultNodeProps, data: { val: 'B' } }));
    });
    expect(container.querySelector('.v')?.textContent).toBe('B');

    act(() => root.unmount());
    container.remove();
  });

  it('shows both handles when no grammar registered', () => {
    const renderFn: StencilRenderFn = () => html`<div>node</div>`;
    const Component = createStencilNodeComponent(renderFn);
    const { container, unmount } = mountWithProps(Component, defaultNodeProps);
    const handles = Array.from(container.querySelectorAll('[data-handletype]'));
    expect(handles).toHaveLength(2);
    const targets = handles.filter(h => h.getAttribute('data-handletype') === 'target');
    const sources = handles.filter(h => h.getAttribute('data-handletype') === 'source');
    expect(targets).toHaveLength(1);
    expect(sources).toHaveLength(1);
    unmount();
  });

  it('suppresses target handle when inbound.max is 0', () => {
    registerGrammar({
      type: 'entry',
      connections: {
        inbound: { min: 0, max: 0, allowedFrom: [] },
        outbound: { min: 0, max: 5, allowedTo: [] },
      },
    });
    const renderFn: StencilRenderFn = () => html`<div>entry</div>`;
    const Component = createStencilNodeComponent(renderFn);
    const { container, unmount } = mountWithProps(Component, {
      ...defaultNodeProps,
      type: 'entry',
    });
    const handles = Array.from(container.querySelectorAll('[data-handletype]'));
    expect(handles).toHaveLength(1);
    expect(handles.every(h => h.getAttribute('data-handletype') === 'source')).toBe(true);
    unmount();
  });

  it('suppresses source handle when outbound.max is 0', () => {
    registerGrammar({
      type: 'goal',
      connections: {
        inbound: { min: 0, max: 5, allowedFrom: [] },
        outbound: { min: 0, max: 0, allowedTo: [] },
      },
    });
    const renderFn: StencilRenderFn = () => html`<div>goal</div>`;
    const Component = createStencilNodeComponent(renderFn);
    const { container, unmount } = mountWithProps(Component, {
      ...defaultNodeProps,
      type: 'goal',
    });
    const handles = Array.from(container.querySelectorAll('[data-handletype]'));
    expect(handles).toHaveLength(1);
    expect(handles.every(h => h.getAttribute('data-handletype') === 'target')).toBe(true);
    unmount();
  });

  it('renders both source and target handles as full-node', () => {
    const renderFn: StencilRenderFn = () => html`<div>node</div>`;
    const Component = createStencilNodeComponent(renderFn);
    const { container, unmount } = mountWithProps(Component, defaultNodeProps);
    const sourceHandle = container.querySelector('[data-handletype="source"]') as HTMLElement;
    const targetHandle = container.querySelector('[data-handletype="target"]') as HTMLElement;
    expect(sourceHandle).toBeTruthy();
    expect(sourceHandle.style.width).toBe('100%');
    expect(sourceHandle.style.height).toBe('100%');
    expect(targetHandle).toBeTruthy();
    expect(targetHandle.style.width).toBe('100%');
    expect(targetHandle.style.height).toBe('100%');
    unmount();
  });

  it('catches render function errors via error boundary', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const renderFn: StencilRenderFn = () => {
      throw new Error('Stencil broke');
    };
    const Component = createStencilNodeComponent(renderFn);
    const { container, unmount } = mountWithProps(Component, defaultNodeProps);
    expect(container.textContent).toContain('Stencil broke');
    unmount();
    consoleSpy.mockRestore();
  });
});

describe('decoration rendering', () => {
  beforeEach(() => {
    clearGrammarRegistry();
  });

  afterEach(() => {
    clearGrammarRegistry();
  });

  it('passes decoration as second argument to render function', () => {
    const received: Array<{ node: GraphNode; decoration: NodeDecoration | undefined }> = [];
    const renderFn: StencilRenderFn = (node, decoration) => {
      received.push({ node, decoration });
      return html`<div>ok</div>`;
    };
    const decoration: NodeDecoration = { badge: { icon: 'play', color: 'green' } };
    const Component = createStencilNodeComponent(renderFn);
    const { unmount } = mountWithProps(Component, {
      ...defaultNodeProps,
      data: { label: 'test', _decoration: decoration },
    });
    expect(received).toHaveLength(1);
    expect(received[0]!.decoration).toEqual(decoration);
    expect(received[0]!.node.properties).toEqual({ label: 'test' });
    expect('_decoration' in received[0]!.node.properties).toBe(false);
    unmount();
  });

  it('passes undefined decoration when none provided', () => {
    const received: Array<{ decoration: NodeDecoration | undefined }> = [];
    const renderFn: StencilRenderFn = (_node, decoration) => {
      received.push({ decoration });
      return html`<div>ok</div>`;
    };
    const Component = createStencilNodeComponent(renderFn);
    const { unmount } = mountWithProps(Component, defaultNodeProps);
    expect(received[0]!.decoration).toBeUndefined();
    unmount();
  });

  it('renders badge element when decoration has badge', () => {
    const renderFn: StencilRenderFn = () => html`<div>node</div>`;
    const Component = createStencilNodeComponent(renderFn);
    const decoration: NodeDecoration = { badge: { icon: '▶', color: '#0f0', count: 3 } };
    const { container, unmount } = mountWithProps(Component, {
      ...defaultNodeProps,
      data: { _decoration: decoration },
    });
    const badge = container.querySelector('.stencil-decoration-badge');
    expect(badge).not.toBeNull();
    expect(badge?.querySelector('.stencil-badge-icon')?.textContent).toBe('▶');
    expect(badge?.querySelector('.stencil-badge-count')?.textContent).toBe('3');
    unmount();
  });

  it('omits badge count when not provided', () => {
    const renderFn: StencilRenderFn = () => html`<div>node</div>`;
    const Component = createStencilNodeComponent(renderFn);
    const decoration: NodeDecoration = { badge: { icon: '✓', color: 'blue' } };
    const { container, unmount } = mountWithProps(Component, {
      ...defaultNodeProps,
      data: { _decoration: decoration },
    });
    const countEl = container.querySelector('.stencil-badge-count');
    expect(countEl).toBeNull();
    unmount();
  });

  it('renders overlay element when decoration has overlay', () => {
    const renderFn: StencilRenderFn = () => html`<div>node</div>`;
    const Component = createStencilNodeComponent(renderFn);
    const decoration: NodeDecoration = { overlay: { type: 'heatmap', intensity: 0.5 } };
    const { container, unmount } = mountWithProps(Component, {
      ...defaultNodeProps,
      data: { _decoration: decoration },
    });
    const overlay = container.querySelector('.stencil-decoration-overlay');
    expect(overlay).not.toBeNull();
    unmount();
  });

  it('applies border style from decoration', () => {
    const renderFn: StencilRenderFn = () => html`<div>node</div>`;
    const Component = createStencilNodeComponent(renderFn);
    const decoration: NodeDecoration = { border: { style: 'dashed', color: 'red' } };
    const { container, unmount } = mountWithProps(Component, {
      ...defaultNodeProps,
      data: { _decoration: decoration },
    });
    const wrapper = container.querySelector('.stencil-decoration-wrapper') as HTMLElement;
    expect(wrapper).not.toBeNull();
    expect(wrapper.style.border).toBe('2px dashed red');
    unmount();
  });

  it('sets tooltip from decoration', () => {
    const renderFn: StencilRenderFn = () => html`<div>node</div>`;
    const Component = createStencilNodeComponent(renderFn);
    const decoration: NodeDecoration = { tooltip: 'Running: 3 of 5' };
    const { container, unmount } = mountWithProps(Component, {
      ...defaultNodeProps,
      data: { _decoration: decoration },
    });
    const wrapper = container.querySelector('.stencil-decoration-wrapper') as HTMLElement;
    expect(wrapper.title).toBe('Running: 3 of 5');
    unmount();
  });

  it('renders no decoration elements when decoration is absent', () => {
    const renderFn: StencilRenderFn = () => html`<div>node</div>`;
    const Component = createStencilNodeComponent(renderFn);
    const { container, unmount } = mountWithProps(Component, defaultNodeProps);
    expect(container.querySelector('.stencil-decoration-badge')).toBeNull();
    expect(container.querySelector('.stencil-decoration-overlay')).toBeNull();
    const wrapper = container.querySelector('.stencil-decoration-wrapper') as HTMLElement;
    expect(wrapper.title).toBe('');
    unmount();
  });

  it('existing stencils without second param still work', () => {
    const renderFn = (node: GraphNode) => html`<span class="legacy">${String(node.properties['label'] ?? '')}</span>`;
    const Component = createStencilNodeComponent(renderFn as StencilRenderFn);
    const { container, unmount } = mountWithProps(Component, {
      ...defaultNodeProps,
      data: { label: 'Legacy', _decoration: { badge: { icon: 'x', color: 'red' } } },
    });
    expect(container.querySelector('.legacy')?.textContent).toBe('Legacy');
    unmount();
  });

  it('does not apply constraints when width/height are zero', () => {
    registerGrammar({
      type: 'zero-sized',
      connections: {
        inbound: { min: 0, max: 5, allowedFrom: [] },
        outbound: { min: 0, max: 5, allowedTo: [] },
      },
    });
    const renderFn: StencilRenderFn = () => html`<div class="content">leaf</div>`;
    const Component = createStencilNodeComponent(renderFn);

    const { container, unmount } = mountWithProps(Component, {
      ...defaultNodeProps,
      type: 'zero-sized',
      width: 0,
      height: 0,
    });

    const wrapper = container.querySelector('.stencil-decoration-wrapper') as HTMLElement;
    expect(wrapper).not.toBeNull();
    expect(wrapper.style.maxWidth).toBe('');
    expect(wrapper.style.maxHeight).toBe('');
    expect(wrapper.style.overflow).toBe('');

    unmount();
  });
});

describe('dimension constraints', () => {
  beforeEach(() => {
    clearGrammarRegistry();
  });

  afterEach(() => {
    clearGrammarRegistry();
  });

  it('applies width constraint from NodeProps', () => {
    registerGrammar({
      type: 'sized',
      connections: {
        inbound: { min: 0, max: 5, allowedFrom: [] },
        outbound: { min: 0, max: 5, allowedTo: [] },
      },
    });
    const renderFn: StencilRenderFn = () => html`<div class="content">sized</div>`;
    const Component = createStencilNodeComponent(renderFn);

    const { container, unmount } = mountWithProps(Component, {
      ...defaultNodeProps,
      type: 'sized',
      width: 200,
      height: 100,
    });

    const wrapper = container.querySelector('.stencil-decoration-wrapper') as HTMLElement;
    expect(wrapper).not.toBeNull();
    expect(wrapper.style.width).toBe('200px');

    unmount();
  });

  it('does not apply width constraint when width is absent', () => {
    registerGrammar({
      type: 'unsized',
      connections: {
        inbound: { min: 0, max: 5, allowedFrom: [] },
        outbound: { min: 0, max: 5, allowedTo: [] },
      },
    });
    const renderFn: StencilRenderFn = () => html`<div class="content">unsized</div>`;
    const Component = createStencilNodeComponent(renderFn);

    const { container, unmount } = mountWithProps(Component, {
      ...defaultNodeProps,
      type: 'unsized',
    });

    const wrapper = container.querySelector('.stencil-decoration-wrapper') as HTMLElement;
    expect(wrapper).not.toBeNull();
    expect(wrapper.style.width).toBe('');

    unmount();
  });

  it('does not apply width constraint when width is zero', () => {
    registerGrammar({
      type: 'zero-sized',
      connections: {
        inbound: { min: 0, max: 5, allowedFrom: [] },
        outbound: { min: 0, max: 5, allowedTo: [] },
      },
    });
    const renderFn: StencilRenderFn = () => html`<div class="content">leaf</div>`;
    const Component = createStencilNodeComponent(renderFn);

    const { container, unmount } = mountWithProps(Component, {
      ...defaultNodeProps,
      type: 'zero-sized',
      width: 0,
      height: 0,
    });

    const wrapper = container.querySelector('.stencil-decoration-wrapper') as HTMLElement;
    expect(wrapper).not.toBeNull();
    expect(wrapper.style.width).toBe('');

    unmount();
  });
});
