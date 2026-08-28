import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { html } from 'lit-html';
import {
  registerGrammar,
  clearGrammarRegistry,
} from '@casehubio/graph-core';
import type { GraphModel, GraphNode, GraphEdge } from '@casehubio/graph-core';

vi.mock('@xyflow/react', () => ({
  Handle: () => null,
  Position: { Top: 'top', Bottom: 'bottom', Left: 'left', Right: 'right' },
}));

import { registerStencil, clearRegistry } from '../registry/stencil-registry.js';
import { defaultEditPolicy } from './edit-policy.js';
import { applyGraphEdit } from './apply-graph-edit.js';
import { defaultCanSpliceOntoEdge } from './splice-validation.js';

const dummyRender = () => html`<div>test</div>`;

function makeGrammar(type: string, outMax: number, allowedTo: string[]) {
  return {
    type,
    connections: {
      inbound: { min: 0, max: 10, allowedFrom: [] as string[] },
      outbound: { min: 0, max: outMax, allowedTo },
    },
  };
}

describe('defaultEditPolicy', () => {
  beforeEach(() => {
    clearGrammarRegistry();
    clearRegistry();
  });

  afterEach(() => {
    clearGrammarRegistry();
    clearRegistry();
  });

  const model: GraphModel = {
    nodes: [
      { id: 'n1', type: 'binding', properties: {} },
      { id: 'n2', type: 'worker', properties: {} },
    ],
    edges: [{ id: 'e1', type: 'default', source: 'n1', target: 'n2' }],
  };

  describe('canConnect', () => {
    it('returns true when no grammar registered', () => {
      const policy = defaultEditPolicy();
      expect(policy.canConnect(model.nodes[0]!, model.nodes[1]!, model)).toBe(true);
    });

    it('returns false when outbound allowedTo excludes target type', () => {
      registerGrammar(makeGrammar('binding', 1, ['milestone']));
      const policy = defaultEditPolicy();
      expect(policy.canConnect(model.nodes[0]!, model.nodes[1]!, model)).toBe(false);
    });

    it('returns false when outbound cardinality exceeded', () => {
      registerGrammar(makeGrammar('binding', 1, ['worker']));
      const policy = defaultEditPolicy();
      expect(policy.canConnect(model.nodes[0]!, model.nodes[1]!, model)).toBe(false);
    });
  });

  describe('canDelete', () => {
    it('returns true for any node', () => {
      const policy = defaultEditPolicy();
      expect(policy.canDelete(model.nodes[0]!, model)).toBe(true);
    });
  });

  describe('getDeleteStrategy', () => {
    it('returns auto-join for leaf with 1 inbound + 1 outbound when join is valid', () => {
      const chain: GraphModel = {
        nodes: [
          { id: 'a', type: 'x', properties: {} },
          { id: 'b', type: 'x', properties: {} },
          { id: 'c', type: 'x', properties: {} },
        ],
        edges: [
          { id: 'e1', type: 'd', source: 'a', target: 'b' },
          { id: 'e2', type: 'd', source: 'b', target: 'c' },
        ],
      };
      const policy = defaultEditPolicy();
      expect(policy.getDeleteStrategy(chain.nodes[1]!, chain)).toEqual({ type: 'auto-join' });
    });

    it('returns disconnect when auto-join would violate grammar', () => {
      registerGrammar({
        type: 'a',
        connections: {
          inbound: { min: 0, max: 10, allowedFrom: [] },
          outbound: { min: 0, max: 1, allowedTo: ['b'] },
        },
      });
      const chain: GraphModel = {
        nodes: [
          { id: 'a', type: 'a', properties: {} },
          { id: 'b', type: 'b', properties: {} },
          { id: 'c', type: 'c', properties: {} },
        ],
        edges: [
          { id: 'e1', type: 'd', source: 'a', target: 'b' },
          { id: 'e2', type: 'd', source: 'b', target: 'c' },
        ],
      };
      const policy = defaultEditPolicy();
      expect(policy.getDeleteStrategy(chain.nodes[1]!, chain)).toEqual({ type: 'disconnect' });
    });

    it('returns disconnect for node with multiple inbound', () => {
      const multi: GraphModel = {
        nodes: [
          { id: 'a', type: 'x', properties: {} },
          { id: 'b', type: 'x', properties: {} },
          { id: 'c', type: 'x', properties: {} },
        ],
        edges: [
          { id: 'e1', type: 'd', source: 'a', target: 'c' },
          { id: 'e2', type: 'd', source: 'b', target: 'c' },
        ],
      };
      const policy = defaultEditPolicy();
      expect(policy.getDeleteStrategy(multi.nodes[2]!, multi)).toEqual({ type: 'disconnect' });
    });

    it('returns cascade for node with children', () => {
      const container: GraphModel = {
        nodes: [
          { id: 'parent', type: 'x', properties: {} },
          { id: 'child', type: 'y', parentId: 'parent', properties: {} },
        ],
        edges: [],
      };
      const policy = defaultEditPolicy();
      expect(policy.getDeleteStrategy(container.nodes[0]!, container)).toEqual({ type: 'cascade' });
    });

    it('returns disconnect when auto-join target is in deletionSet', () => {
      const chain: GraphModel = {
        nodes: [
          { id: 'a', type: 'x', properties: {} },
          { id: 'b', type: 'x', properties: {} },
          { id: 'c', type: 'x', properties: {} },
        ],
        edges: [
          { id: 'e1', type: 'd', source: 'a', target: 'b' },
          { id: 'e2', type: 'd', source: 'b', target: 'c' },
        ],
      };
      const policy = defaultEditPolicy();
      const deletionSet = new Set(['b', 'c']);
      expect(policy.getDeleteStrategy(chain.nodes[1]!, chain, deletionSet)).toEqual({ type: 'disconnect' });
    });
  });

  describe('getInsertableTypes', () => {
    it('excludes types with outbound max 0 (e.g. Sink)', () => {
      registerStencil({
        type: 'mid', label: 'Mid', icon: 'm',
        grammar: { type: 'mid', connections: { inbound: { min: 0, max: 2, allowedFrom: [] }, outbound: { min: 0, max: 2, allowedTo: [] } } },
        render: dummyRender,
      });
      registerStencil({
        type: 'terminal', label: 'Terminal', icon: 't',
        grammar: { type: 'terminal', connections: { inbound: { min: 0, max: 2, allowedFrom: [] }, outbound: { min: 0, max: 0, allowedTo: [] } } },
        render: dummyRender,
      });
      const m: GraphModel = {
        nodes: [{ id: 'a', type: 'mid', properties: {} }, { id: 'b', type: 'mid', properties: {} }],
        edges: [{ id: 'e1', type: 'd', source: 'a', target: 'b' }],
      };
      const policy = defaultEditPolicy();
      const types = policy.getInsertableTypes(m.edges[0]!, m);
      expect(types.some(t => t.type === 'mid')).toBe(true);
      expect(types.some(t => t.type === 'terminal')).toBe(false);
    });

    it('excludes types with inbound max 0 (e.g. Source)', () => {
      registerStencil({
        type: 'origin', label: 'Origin', icon: 'o',
        grammar: { type: 'origin', connections: { inbound: { min: 0, max: 0, allowedFrom: [] }, outbound: { min: 0, max: 2, allowedTo: [] } } },
        render: dummyRender,
      });
      const m: GraphModel = {
        nodes: [{ id: 'a', type: 'origin', properties: {} }, { id: 'b', type: 'origin', properties: {} }],
        edges: [{ id: 'e1', type: 'd', source: 'a', target: 'b' }],
      };
      const policy = defaultEditPolicy();
      const types = policy.getInsertableTypes(m.edges[0]!, m);
      expect(types.some(t => t.type === 'origin')).toBe(false);
    });
  });

  describe('getCreatableTypes', () => {
    it('includes child types when nearNode is a container', () => {
      registerGrammar({
        type: 'container',
        connections: { inbound: { min: 0, max: 10, allowedFrom: [] }, outbound: { min: 0, max: 10, allowedTo: [] } },
        containment: { allowedChildTypes: ['child'] },
      });
      registerStencil({
        type: 'child', label: 'Child', icon: 'c',
        grammar: {
          type: 'child',
          connections: { inbound: { min: 0, max: 10, allowedFrom: [] }, outbound: { min: 0, max: 10, allowedTo: [] } },
          containment: { allowedParentTypes: ['container'] },
        },
        render: dummyRender,
      });
      const m: GraphModel = { nodes: [{ id: 'c1', type: 'container', properties: {} }], edges: [] };
      const policy = defaultEditPolicy();
      const types = policy.getCreatableTypes(m.nodes[0]!, m);
      expect(types.some(t => t.type === 'child')).toBe(true);
    });
  });
});

describe('applyGraphEdit', () => {
  const model: GraphModel = {
    nodes: [
      { id: 'n1', type: 'a', properties: {} },
      { id: 'n2', type: 'b', properties: {} },
    ],
    edges: [{ id: 'e1', type: 'default', source: 'n1', target: 'n2' }],
  };

  it('applies addEdge edit', () => {
    const noEdgeModel: GraphModel = { ...model, edges: [] };
    const result = applyGraphEdit(noEdgeModel, { type: 'addEdge', sourceId: 'n1', targetId: 'n2' });
    expect(result.model.edges).toHaveLength(1);
  });

  it('applies removeEdge edit', () => {
    const result = applyGraphEdit(model, { type: 'removeEdge', edgeId: 'e1' });
    expect(result.model.edges).toHaveLength(0);
  });

  it('auto-joins predecessor to successor when removeNode strategy is auto-join', () => {
    const chain: GraphModel = {
      nodes: [
        { id: 'a', type: 'x', properties: {} },
        { id: 'b', type: 'x', properties: {} },
        { id: 'c', type: 'x', properties: {} },
      ],
      edges: [
        { id: 'e1', type: 'default', source: 'a', target: 'b' },
        { id: 'e2', type: 'default', source: 'b', target: 'c' },
      ],
    };
    const result = applyGraphEdit(chain, {
      type: 'removeNode', nodeId: 'b', strategy: { type: 'auto-join' },
    });
    expect(result.model.nodes).toHaveLength(2);
    expect(result.model.nodes.find(n => n.id === 'b')).toBeUndefined();
    expect(result.model.edges).toHaveLength(1);
    expect(result.model.edges[0]!.source).toBe('a');
    expect(result.model.edges[0]!.target).toBe('c');
  });

  it('disconnects edges when removeNode strategy is disconnect', () => {
    const chain: GraphModel = {
      nodes: [
        { id: 'a', type: 'x', properties: {} },
        { id: 'b', type: 'x', properties: {} },
        { id: 'c', type: 'x', properties: {} },
      ],
      edges: [
        { id: 'e1', type: 'default', source: 'a', target: 'b' },
        { id: 'e2', type: 'default', source: 'b', target: 'c' },
      ],
    };
    const result = applyGraphEdit(chain, {
      type: 'removeNode', nodeId: 'b', strategy: { type: 'disconnect' },
    });
    expect(result.model.nodes).toHaveLength(2);
    expect(result.model.edges).toHaveLength(0);
  });

  it('applies compound edit as single operation', () => {
    const noEdgeModel: GraphModel = { ...model, edges: [] };
    const result = applyGraphEdit(noEdgeModel, {
      type: 'compound',
      edits: [
        { type: 'addEdge', sourceId: 'n1', targetId: 'n2' },
        { type: 'addNode', nodeType: 'c', properties: {} },
      ],
    });
    expect(result.model.edges).toHaveLength(1);
    expect(result.model.nodes).toHaveLength(3);
  });
});

describe('canSpliceOntoEdge', () => {
  beforeEach(() => {
    clearGrammarRegistry();
    clearRegistry();
  });

  afterEach(() => {
    clearGrammarRegistry();
    clearRegistry();
  });

  it('returns true when both directions are grammar-valid', () => {
    registerGrammar(makeGrammar('start', 10, []));
    registerGrammar(makeGrammar('worker', 10, []));
    registerGrammar(makeGrammar('end', 0, []));

    const m: GraphModel = {
      nodes: [
        { id: 'a', type: 'start', properties: {} },
        { id: 'b', type: 'end', properties: {} },
        { id: 'x', type: 'worker', properties: {} },
      ],
      edges: [{ id: 'e1', type: 'default', source: 'a', target: 'b' }],
    };
    const edge = m.edges[0]!;
    const nodeX = m.nodes[2]!;
    const policy = defaultEditPolicy();
    expect(policy.canSpliceOntoEdge!(edge, nodeX, m)).toBe(true);
  });

  it('returns false when source grammar forbids connection to node type', () => {
    registerGrammar(makeGrammar('start', 10, ['end']));
    registerGrammar(makeGrammar('worker', 10, []));
    registerGrammar(makeGrammar('end', 0, []));

    const m: GraphModel = {
      nodes: [
        { id: 'a', type: 'start', properties: {} },
        { id: 'b', type: 'end', properties: {} },
        { id: 'x', type: 'worker', properties: {} },
      ],
      edges: [{ id: 'e1', type: 'default', source: 'a', target: 'b' }],
    };
    const policy = defaultEditPolicy();
    expect(policy.canSpliceOntoEdge!(m.edges[0]!, m.nodes[2]!, m)).toBe(false);
  });

  it('returns true when source is at outbound max — projected model frees the slot', () => {
    registerGrammar(makeGrammar('start', 1, []));
    registerGrammar(makeGrammar('worker', 10, []));
    registerGrammar(makeGrammar('end', 0, []));

    const m: GraphModel = {
      nodes: [
        { id: 'a', type: 'start', properties: {} },
        { id: 'b', type: 'end', properties: {} },
        { id: 'x', type: 'worker', properties: {} },
      ],
      edges: [{ id: 'e1', type: 'default', source: 'a', target: 'b' }],
    };
    const policy = defaultEditPolicy();
    expect(policy.canSpliceOntoEdge!(m.edges[0]!, m.nodes[2]!, m)).toBe(true);
  });

  it('defaultCanSpliceOntoEdge fallback respects custom canConnect', () => {
    registerGrammar(makeGrammar('start', 10, []));
    registerGrammar(makeGrammar('worker', 10, []));
    registerGrammar(makeGrammar('end', 0, []));

    const m: GraphModel = {
      nodes: [
        { id: 'a', type: 'start', properties: {} },
        { id: 'b', type: 'end', properties: {} },
        { id: 'x', type: 'worker', properties: {} },
      ],
      edges: [{ id: 'e1', type: 'default', source: 'a', target: 'b' }],
    };

    const customPolicy = {
      ...defaultEditPolicy(),
      canConnect: () => false,
    };
    delete (customPolicy as any).canSpliceOntoEdge;

    expect(defaultCanSpliceOntoEdge(customPolicy, m.edges[0]!, m.nodes[2]!, m)).toBe(false);
  });
});

describe('applyGraphEdit moveNodeToEdge', () => {
  beforeEach(() => {
    clearGrammarRegistry();
    clearRegistry();
  });

  afterEach(() => {
    clearGrammarRegistry();
    clearRegistry();
  });

  it('splices node onto edge with auto-join at source', () => {
    registerGrammar(makeGrammar('start', 10, []));
    registerGrammar(makeGrammar('worker', 10, []));
    registerGrammar(makeGrammar('end', 0, []));

    const m: GraphModel = {
      nodes: [
        { id: 'a', type: 'start', properties: {} },
        { id: 'x', type: 'worker', properties: {} },
        { id: 'b', type: 'end', properties: {} },
        { id: 'p', type: 'start', properties: {} },
        { id: 'q', type: 'end', properties: {} },
      ],
      edges: [
        { id: 'e-ax', type: 'default', source: 'a', target: 'x' },
        { id: 'e-xb', type: 'default', source: 'x', target: 'b' },
        { id: 'e-pq', type: 'flow', source: 'p', target: 'q' },
      ],
    };

    const result = applyGraphEdit(m, {
      type: 'moveNodeToEdge',
      nodeId: 'x',
      edgeId: 'e-pq',
      sourceCleanup: 'auto-join',
    });

    expect(result.model.edges.find(e => e.id === 'e-ax')).toBeUndefined();
    expect(result.model.edges.find(e => e.id === 'e-xb')).toBeUndefined();
    const joinEdge = result.model.edges.find(e => e.source === 'a' && e.target === 'b');
    expect(joinEdge).toBeTruthy();
    expect(joinEdge!.type).toBe('default');

    expect(result.model.edges.find(e => e.id === 'e-pq')).toBeUndefined();
    const preEdge = result.model.edges.find(e => e.source === 'p' && e.target === 'x');
    const postEdge = result.model.edges.find(e => e.source === 'x' && e.target === 'q');
    expect(preEdge).toBeTruthy();
    expect(postEdge).toBeTruthy();
    expect(preEdge!.type).toBe('flow');
    expect(postEdge!.type).toBe('flow');
  });

  it('splices with disconnect at source — removes all edges', () => {
    const m: GraphModel = {
      nodes: [
        { id: 'a', type: 'start', properties: {} },
        { id: 'x', type: 'worker', properties: {} },
        { id: 'b', type: 'end', properties: {} },
        { id: 'c', type: 'end', properties: {} },
        { id: 'p', type: 'start', properties: {} },
        { id: 'q', type: 'end', properties: {} },
      ],
      edges: [
        { id: 'e-ax', type: 'default', source: 'a', target: 'x' },
        { id: 'e-xb', type: 'default', source: 'x', target: 'b' },
        { id: 'e-xc', type: 'default', source: 'x', target: 'c' },
        { id: 'e-pq', type: 'flow', source: 'p', target: 'q' },
      ],
    };

    const result = applyGraphEdit(m, {
      type: 'moveNodeToEdge',
      nodeId: 'x',
      edgeId: 'e-pq',
      sourceCleanup: 'disconnect',
    });

    expect(result.model.edges.find(e => e.id === 'e-ax')).toBeUndefined();
    expect(result.model.edges.find(e => e.id === 'e-xb')).toBeUndefined();
    expect(result.model.edges.find(e => e.id === 'e-xc')).toBeUndefined();
    expect(result.model.edges.find(e => e.source === 'a' && e.target === 'b')).toBeUndefined();

    const preEdge = result.model.edges.find(e => e.source === 'p' && e.target === 'x');
    const postEdge = result.model.edges.find(e => e.source === 'x' && e.target === 'q');
    expect(preEdge).toBeTruthy();
    expect(postEdge).toBeTruthy();
  });

  it('splices disconnected node — only target-side splice happens', () => {
    const m: GraphModel = {
      nodes: [
        { id: 'x', type: 'worker', properties: {} },
        { id: 'p', type: 'start', properties: {} },
        { id: 'q', type: 'end', properties: {} },
      ],
      edges: [
        { id: 'e-pq', type: 'flow', source: 'p', target: 'q' },
      ],
    };

    const result = applyGraphEdit(m, {
      type: 'moveNodeToEdge',
      nodeId: 'x',
      edgeId: 'e-pq',
      sourceCleanup: 'disconnect',
    });

    expect(result.model.edges.find(e => e.id === 'e-pq')).toBeUndefined();
    const preEdge = result.model.edges.find(e => e.source === 'p' && e.target === 'x');
    const postEdge = result.model.edges.find(e => e.source === 'x' && e.target === 'q');
    expect(preEdge).toBeTruthy();
    expect(postEdge).toBeTruthy();
    expect(preEdge!.type).toBe('flow');
  });
});
