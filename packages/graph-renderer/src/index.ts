export {
  registerStencil,
  deregisterStencil,
  getStencil,
  getAllStencils,
  registerEdgeType,
  deregisterEdgeType,
  getEdgeDescriptor,
  getNodeTypes,
  getRegisteredStyles,
  clearRegistry,
} from './registry/stencil-registry.js';
export type { StencilDescriptor, EdgeDescriptor } from './registry/stencil-registry.js';
export { emitPagesEvent } from '@casehubio/pages-data';
export type { PagesEventDetail } from '@casehubio/pages-data';
export { GraphCanvas } from './bridge/GraphCanvas.js';
export { computeElkLayout } from './layout/elk-layout.js';
export type { ElkLayoutOptions, ElkLayoutResult, NodeLayout } from './layout/elk-layout.js';
export { toReactFlowNode, toReactFlowEdge, toReactFlowGraph } from './mapping.js';
export {
  createStencilNodeComponent,
} from './stencil-wrapper.js';
export type {
  StencilTemplate,
  StencilRenderFn,
} from './stencil-wrapper.js';

export { createWorkStencilRenderFn, toWorkStencilDescriptor } from './work-stencil-renderer.js';
export type { GraphModel, GraphNode, GraphEdge, NodeDecoration } from '@casehubio/graph-core';
export { validateEdgeRouting } from './edge-routing-validator.js';
export type { ValidationResult } from './edge-routing-validator.js';
export { defaultEditPolicy } from './editing/edit-policy.js';
export { applyGraphEdit } from './editing/apply-graph-edit.js';
export type { EditPolicy, GraphEdit, StencilTypeInfo, DeleteStrategy, DeleteOption, SourceCleanupStrategy } from './editing/types.js';
export { createNodeMoveCoordinator } from './editing/node-move-coordinator.js';
export type { NodeMoveCoordinator, NodeMoveCoordinatorOptions, DragEndResult } from './editing/node-move-coordinator.js';
export { defaultCanSpliceOntoEdge, buildProjectedModel } from './editing/splice-validation.js';
