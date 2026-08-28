import type { GraphModel, GraphNode, GraphEdge } from '@casehubio/graph-core';
import { nodeById, edgesOf } from '@casehubio/graph-core';
import type { EditPolicy } from './types.js';

export function buildProjectedModel(
  model: GraphModel,
  targetEdge: GraphEdge,
  draggedNode: GraphNode,
): GraphModel {
  const edgesToRemove = new Set<string>();
  edgesToRemove.add(targetEdge.id);
  for (const e of edgesOf(model, draggedNode.id)) {
    edgesToRemove.add(e.id);
  }
  return {
    ...model,
    edges: model.edges.filter(e => !edgesToRemove.has(e.id)),
  };
}

export function defaultCanSpliceOntoEdge(
  policy: EditPolicy,
  edge: GraphEdge,
  node: GraphNode,
  model: GraphModel,
): boolean {
  const projected = buildProjectedModel(model, edge, node);
  const source = nodeById(projected, edge.source);
  const target = nodeById(projected, edge.target);
  if (!source || !target) return false;
  return policy.canConnect(source, node, projected)
      && policy.canConnect(node, target, projected);
}
