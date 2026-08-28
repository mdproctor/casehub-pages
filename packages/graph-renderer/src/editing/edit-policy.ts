import type { GraphModel, GraphNode, GraphEdge } from '@casehubio/graph-core';
import { getGrammar, inboundEdges, outboundEdges, childrenOf, nodeById } from '@casehubio/graph-core';
import { getAllStencils } from '../registry/stencil-registry.js';
import type { EditPolicy, StencilTypeInfo, DeleteStrategy } from './types.js';
import { defaultCanSpliceOntoEdge } from './splice-validation.js';

export function defaultEditPolicy(): EditPolicy {
  const policy: EditPolicy = {
    canConnect(source: GraphNode, target: GraphNode, model: GraphModel, _edgeType?: string): boolean {
      const grammar = getGrammar(source.type);
      if (!grammar) return true;

      const { outbound } = grammar.connections;
      if (outbound.allowedTo.length > 0 && !outbound.allowedTo.includes(target.type)) {
        return false;
      }

      const currentOutbound = outboundEdges(model, source.id);
      if (currentOutbound.length >= outbound.max) {
        return false;
      }

      const targetGrammar = getGrammar(target.type);
      if (targetGrammar) {
        const { inbound } = targetGrammar.connections;
        if (inbound.allowedFrom.length > 0 && !inbound.allowedFrom.includes(source.type)) {
          return false;
        }
        const currentInbound = inboundEdges(model, target.id);
        if (currentInbound.length >= inbound.max) {
          return false;
        }
      }

      return true;
    },

    getInsertableTypes(edge: GraphEdge, model: GraphModel): StencilTypeInfo[] {
      const sourceNode = model.nodes.find(n => n.id === edge.source);
      const targetNode = model.nodes.find(n => n.id === edge.target);
      if (!sourceNode || !targetNode) return [];

      return getAllStencils()
        .filter(s => {
          const g = s.grammar;
          if (g.connections.inbound.max === 0) return false;
          if (g.connections.outbound.max === 0) return false;
          const inboundOk = g.connections.inbound.allowedFrom.length === 0 ||
            g.connections.inbound.allowedFrom.includes(sourceNode.type);
          const outboundOk = g.connections.outbound.allowedTo.length === 0 ||
            g.connections.outbound.allowedTo.includes(targetNode.type);
          return inboundOk && outboundOk;
        })
        .map(s => ({ type: s.type, label: s.label, icon: s.icon }));
    },

    getCreatableTypes(nearNode: GraphNode | null, model: GraphModel): StencilTypeInfo[] {
      return getAllStencils()
        .filter(s => {
          const parentTypes = s.grammar.containment?.allowedParentTypes;
          if (parentTypes) {
            if (!nearNode || !parentTypes.includes(nearNode.type)) return false;
          }
          if (nearNode) {
            const sourceGrammar = getGrammar(nearNode.type);
            if (sourceGrammar) {
              const { allowedTo, max } = sourceGrammar.connections.outbound;
              if (max === 0) return false;
              const currentOutbound = outboundEdges(model, nearNode.id);
              if (currentOutbound.length >= max) return false;
              if (allowedTo.length > 0 && !allowedTo.includes(s.type)) return false;
            }
          }
          return true;
        })
        .map(s => ({ type: s.type, label: s.label, icon: s.icon }));
    },

    canDelete(_node: GraphNode, _model: GraphModel): boolean {
      return true;
    },

    getDeleteStrategy(node: GraphNode, model: GraphModel, deletionSet?: ReadonlySet<string>): DeleteStrategy {
      const children = childrenOf(model, node.id);
      if (children.length > 0) {
        return { type: 'cascade' };
      }

      const inbound = inboundEdges(model, node.id);
      const outbound = outboundEdges(model, node.id);

      if (inbound.length === 1 && outbound.length === 1) {
        const joinTargetId = outbound[0]!.target;
        if (deletionSet?.has(joinTargetId)) {
          return { type: 'disconnect' };
        }
        const predecessor = nodeById(model, inbound[0]!.source);
        const successor = nodeById(model, joinTargetId);
        if (predecessor && successor && policy.canConnect(predecessor, successor, model)) {
          return { type: 'auto-join' };
        }
        return { type: 'disconnect' };
      }

      return { type: 'disconnect' };
    },

    canSpliceOntoEdge(edge: GraphEdge, node: GraphNode, model: GraphModel): boolean {
      return defaultCanSpliceOntoEdge(policy, edge, node, model);
    },
  };
  return policy;
}
