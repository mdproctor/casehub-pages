import type { GraphModel, GraphNode, GraphEdge } from '@casehubio/graph-core';
import { nodeById, childrenOf } from '@casehubio/graph-core';
import type { EditPolicy, SourceCleanupStrategy } from './types.js';
import { defaultCanSpliceOntoEdge } from './splice-validation.js';

const HOLD_DURATION = 300;
const HOLD_MOVE_TOLERANCE = 3;
const DRAG_THRESHOLD = 5;

export type DragEndResult =
  | { type: 'splice'; nodeId: string; edgeId: string; sourceCleanup: SourceCleanupStrategy }
  | { type: 'cancelled' };

export interface NodeMoveCoordinator {
  startDrag(nodeId: string, event: PointerEvent, model: GraphModel): void;
  dispose(): void;
  readonly isActive: boolean;
}

export interface NodeMoveCoordinatorOptions {
  editPolicy: EditPolicy;
  containerEl: HTMLElement;
  onResult: (result: DragEndResult) => void;
}

export function createNodeMoveCoordinator(opts: NodeMoveCoordinatorOptions): NodeMoveCoordinator {
  const { editPolicy, containerEl, onResult } = opts;

  let activeModel: GraphModel | null = null;
  let draggedNodeId: string | null = null;
  let startPos: { x: number; y: number } | null = null;
  let holdTimer: ReturnType<typeof setTimeout> | null = null;
  let holdConfirmed = false;
  let dragActive = false;
  let ghostedNodeEl: HTMLElement | null = null;
  let cloneEl: HTMLElement | null = null;
  let highlightedEdgeEl: HTMLElement | null = null;
  let spliceIndicator: HTMLElement | null = null;
  let grabOffset = { x: 0, y: 0 };
  let capturedPointerId: number | null = null;
  let leaveTimer: ReturnType<typeof setTimeout> | null = null;

  const LEAVE_TIMEOUT = 500;

  function isEligible(nodeId: string, model: GraphModel): boolean {
    const node = nodeById(model, nodeId);
    if (!node) return false;
    if (node.parentId) return false;
    if (childrenOf(model, nodeId).length > 0) return false;
    return true;
  }

  function canSplice(edge: GraphEdge, node: GraphNode, model: GraphModel): boolean {
    return editPolicy.canSpliceOntoEdge?.(edge, node, model)
      ?? defaultCanSpliceOntoEdge(editPolicy, edge, node, model);
  }

  function getSourceCleanup(node: GraphNode, model: GraphModel): SourceCleanupStrategy {
    const strategy = editPolicy.getDeleteStrategy(node, model);
    return strategy.type === 'auto-join' ? 'auto-join' : 'disconnect';
  }

  function confirmHold(): void {
    holdConfirmed = true;
    const nodeEl = containerEl.querySelector(`.react-flow__node[data-id="${draggedNodeId}"]`) as HTMLElement | null;
    if (nodeEl) {
      nodeEl.classList.add('node-move-ghost');
      ghostedNodeEl = nodeEl;
    }
    if (nodeEl && capturedPointerId !== null) {
      const handle = nodeEl.querySelector('.stencil-source-handle') as HTMLElement | null;
      if (handle) {
        try { handle.releasePointerCapture(capturedPointerId); } catch (_e) { /* ignore */ }
      }
    }
    const canvas = containerEl.closest('pages-graph-canvas');
    if (canvas) {
      canvas.classList.remove('graph-connecting');
    }
    containerEl.classList.add('node-move-active');
    containerEl.addEventListener('pointerleave', onPointerLeave);
    containerEl.addEventListener('pointerenter', onPointerEnter);
  }

  function activateDrag(e: PointerEvent): void {
    dragActive = true;
    const nodeEl = containerEl.querySelector(`.react-flow__node[data-id="${draggedNodeId}"]`) as HTMLElement | null;
    if (nodeEl) {
      nodeEl.classList.add('node-move-ghost');
      ghostedNodeEl = nodeEl;
    }
    const wrapper = ghostedNodeEl?.querySelector('.stencil-decoration-wrapper');
    if (wrapper) {
      cloneEl = document.createElement('div');
      cloneEl.innerHTML = wrapper.innerHTML;
      cloneEl.style.position = 'fixed';
      cloneEl.style.pointerEvents = 'none';
      cloneEl.style.opacity = '0.5';
      cloneEl.style.zIndex = '1000';
      cloneEl.style.filter = 'drop-shadow(0 4px 12px rgba(0,0,0,0.2))';
      cloneEl.style.transform = 'scale(0.85)';
      cloneEl.style.left = `${e.clientX - grabOffset.x}px`;
      cloneEl.style.top = `${e.clientY - grabOffset.y}px`;
      const rect = wrapper.getBoundingClientRect();
      cloneEl.style.width = `${rect.width}px`;
      cloneEl.style.height = `${rect.height}px`;
      document.body.appendChild(cloneEl);
    }
  }

  function onPointerLeave(): void {
    if (!holdConfirmed) return;
    leaveTimer = setTimeout(() => {
      leaveTimer = null;
      cleanup();
      onResult({ type: 'cancelled' });
    }, LEAVE_TIMEOUT);
  }

  function onPointerEnter(): void {
    if (leaveTimer) {
      clearTimeout(leaveTimer);
      leaveTimer = null;
    }
  }

  function onHoldMove(e: PointerEvent): void {
    if (!startPos) return;
    if (Math.hypot(e.clientX - startPos.x, e.clientY - startPos.y) > HOLD_MOVE_TOLERANCE) {
      cancelHold();
    }
  }

  function onHoldUp(): void {
    cancelHold();
  }

  function cancelHold(): void {
    if (holdTimer) { clearTimeout(holdTimer); holdTimer = null; }
    document.removeEventListener('pointermove', onHoldMove);
    document.removeEventListener('pointerup', onHoldUp);
    activeModel = null;
    draggedNodeId = null;
    startPos = null;
    capturedPointerId = null;
  }

  function onDragMove(e: PointerEvent): void {
    if (!startPos || !activeModel || !draggedNodeId) return;
    e.stopPropagation();
    e.preventDefault();

    if (!dragActive) {
      if (Math.hypot(e.clientX - startPos.x, e.clientY - startPos.y) < DRAG_THRESHOLD) return;
      activateDrag(e);
    }

    if (cloneEl) {
      cloneEl.style.left = `${e.clientX - grabOffset.x}px`;
      cloneEl.style.top = `${e.clientY - grabOffset.y}px`;
    }

    clearEdgeHighlight();
    const draggedNode = nodeById(activeModel, draggedNodeId);
    if (!draggedNode) return;

    const hits = typeof document.elementsFromPoint === 'function'
      ? document.elementsFromPoint(e.clientX, e.clientY)
      : [];
    for (const hitEl of hits) {
      const edgeEl = hitEl.closest('.react-flow__edge') as HTMLElement | null;
      if (!edgeEl) continue;
      const edgeId = edgeEl.dataset['id'];
      if (!edgeId) continue;
      const edge = activeModel.edges.find(ed => ed.id === edgeId);
      if (!edge) continue;
      if (edge.source === draggedNodeId || edge.target === draggedNodeId) continue;
      if (canSplice(edge, draggedNode, activeModel)) {
        edgeEl.classList.add('edge-splice-valid');
        highlightedEdgeEl = edgeEl;
        showSpliceIndicator(edgeEl);
      }
      break;
    }
  }

  function onDragUp(_e: PointerEvent): void {
    if (!dragActive || !activeModel || !draggedNodeId) {
      cleanup();
      onResult({ type: 'cancelled' });
      return;
    }
    let result: DragEndResult = { type: 'cancelled' };
    if (highlightedEdgeEl) {
      const edgeId = highlightedEdgeEl.dataset['id'];
      const node = nodeById(activeModel, draggedNodeId);
      if (edgeId && node) {
        result = { type: 'splice', nodeId: draggedNodeId, edgeId, sourceCleanup: getSourceCleanup(node, activeModel) };
      }
    }
    cleanup();
    onResult(result);
  }

  function showSpliceIndicator(edgeEl: HTMLElement): void {
    clearSpliceIndicator();
    const path = edgeEl.querySelector('.react-flow__edge-path') as SVGPathElement | null;
    if (!path) return;
    const len = path.getTotalLength();
    const pt = path.getPointAtLength(len / 2);
    const svg = path.ownerSVGElement;
    if (!svg) return;
    const ctm = svg.getScreenCTM();
    if (!ctm) return;
    const screenX = pt.x * ctm.a + ctm.e;
    const screenY = pt.y * ctm.d + ctm.f;
    spliceIndicator = document.createElement('div');
    spliceIndicator.style.cssText = `position:fixed;left:${screenX - 12}px;top:${screenY - 3}px;width:24px;height:6px;background:#16a34a;border-radius:3px;pointer-events:none;z-index:1001;box-shadow:0 0 12px 4px rgba(22,163,106,0.6);transition:opacity 100ms;`;
    document.body.appendChild(spliceIndicator);
  }

  function clearSpliceIndicator(): void {
    if (spliceIndicator) { spliceIndicator.remove(); spliceIndicator = null; }
  }

  function clearEdgeHighlight(): void {
    if (highlightedEdgeEl) { highlightedEdgeEl.classList.remove('edge-splice-valid'); highlightedEdgeEl = null; }
    clearSpliceIndicator();
  }

  function cleanup(): void {
    if (holdTimer) { clearTimeout(holdTimer); holdTimer = null; }
    if (leaveTimer) { clearTimeout(leaveTimer); leaveTimer = null; }
    document.removeEventListener('pointermove', onHoldMove);
    document.removeEventListener('pointerup', onHoldUp);
    document.removeEventListener('pointermove', onDragMove, true);
    document.removeEventListener('pointerup', onDragUp, true);
    containerEl.removeEventListener('pointerleave', onPointerLeave);
    containerEl.removeEventListener('pointerenter', onPointerEnter);
    containerEl.classList.remove('node-move-active');
    if (ghostedNodeEl) { ghostedNodeEl.classList.remove('node-move-ghost'); ghostedNodeEl = null; }
    if (cloneEl) { cloneEl.remove(); cloneEl = null; }
    clearEdgeHighlight();
    activeModel = null;
    draggedNodeId = null;
    startPos = null;
    holdTimer = null;
    holdConfirmed = false;
    dragActive = false;
    capturedPointerId = null;
  }

  return {
    get isActive(): boolean {
      return holdConfirmed;
    },

    startDrag(nodeId: string, event: PointerEvent, model: GraphModel): void {
      if (!isEligible(nodeId, model)) return;

      draggedNodeId = nodeId;
      activeModel = model;
      startPos = { x: event.clientX, y: event.clientY };
      capturedPointerId = event.pointerId;
      holdConfirmed = false;
      dragActive = false;

      const wrapper = containerEl.querySelector(
        `.react-flow__node[data-id="${nodeId}"] .stencil-decoration-wrapper`
      );
      if (wrapper) {
        const rect = wrapper.getBoundingClientRect();
        grabOffset = { x: event.clientX - rect.left, y: event.clientY - rect.top };
      }

      document.addEventListener('pointermove', onHoldMove);
      document.addEventListener('pointerup', onHoldUp);

      holdTimer = setTimeout(() => {
        holdTimer = null;
        document.removeEventListener('pointermove', onHoldMove);
        document.removeEventListener('pointerup', onHoldUp);
        confirmHold();
        document.addEventListener('pointermove', onDragMove, true);
        document.addEventListener('pointerup', onDragUp, true);
      }, HOLD_DURATION);
    },

    dispose(): void {
      cleanup();
    },
  };
}
