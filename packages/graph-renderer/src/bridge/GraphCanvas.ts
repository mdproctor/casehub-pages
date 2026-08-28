import { LitElement } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { Node, Edge, ReactFlowInstance, Connection } from '@xyflow/react';
import type { GraphModel } from '@casehubio/graph-core';
import { nodeById } from '@casehubio/graph-core';
import type { EditPolicy } from '../editing/types.js';
import type { GraphEdit } from '../editing/types.js';
import { createNodeMoveCoordinator } from '../editing/node-move-coordinator.js';
import type { NodeMoveCoordinator, DragEndResult } from '../editing/node-move-coordinator.js';
import { applyTheme, getTheme } from '@casehubio/pages-ui-tokens';
import { ReactFlowApp, type ReactFlowAppProps } from './ReactFlowApp.js';
import { getNodeTypes } from '../registry/stencil-registry.js';
import { injectIsolationStyles, releaseIsolationStyles, DIAGRAM_ROOT_CLASS } from './css-isolation.js';
import { emitPagesEvent } from '@casehubio/pages-data';
import { toReactFlowGraph } from '../mapping.js';
import { computeElkLayout, type ElkLayoutOptions } from '../layout/elk-layout.js';

@customElement('pages-graph-canvas')
export class GraphCanvas extends LitElement {
  @property({ attribute: false }) model: GraphModel | undefined;
  @property({ attribute: false }) layoutOptions: ElkLayoutOptions | undefined;
  @property({ attribute: false }) nodes: Node[] | undefined;
  @property({ attribute: false }) edges: Edge[] | undefined;
  @property({ attribute: false }) editPolicy: EditPolicy | undefined;
  @property({ attribute: false }) onMutation: ((edit: GraphEdit) => void) | undefined;
  @property({ attribute: false }) miniMapNodeColor: ReactFlowAppProps['miniMapNodeColor'];

  @state() private _nodes: Node[] = [];
  @state() private _edges: Edge[] = [];

  private _root: Root | undefined;
  private _container: HTMLDivElement | undefined;
  private _themeListener: ((e: Event) => void) | undefined;
  private _layoutGeneration = 0;
  private _reactFlowInstance: ReactFlowInstance | undefined;
  private _connectSourceNodeId: string | undefined;
  private _connectStartPos: { x: number; y: number } | undefined;
  private _moveCoordinator: NodeMoveCoordinator | null = null;
  private _moveWasActive = false;
  private _pointerDownHandler: ((e: PointerEvent) => void) | undefined;

  screenToFlow(screenX: number, screenY: number): { x: number; y: number } | undefined {
    return this._reactFlowInstance?.screenToFlowPosition({ x: screenX, y: screenY });
  }

  flowToScreen(flowX: number, flowY: number): { x: number; y: number } | undefined {
    return this._reactFlowInstance?.flowToScreenPosition({ x: flowX, y: flowY });
  }

  override createRenderRoot(): HTMLElement {
    return this;
  }

  override connectedCallback(): void {
    super.connectedCallback();
    this.setAttribute('role', 'img');
    this.setAttribute('aria-label', 'Graph canvas');

    this._container = document.createElement('div');
    this._container.classList.add(DIAGRAM_ROOT_CLASS);

    injectIsolationStyles(this);

    const currentTheme = getTheme(document.documentElement) || 'default-light';
    applyTheme(currentTheme, this._container);

    this.appendChild(this._container);

    this._pointerDownHandler = (e: PointerEvent) => {
      const target = e.target as HTMLElement;
      const nodeEl = target.closest('.react-flow__node') as HTMLElement | null;
      const nodeId = nodeEl?.dataset['id'];
      if (!nodeId || !this.model || !this.editPolicy) return;

      if (!this._moveCoordinator) {
        this._moveCoordinator = createNodeMoveCoordinator({
          editPolicy: this.editPolicy,
          containerEl: this._container!,
          onResult: (result: DragEndResult) => this._handleMoveResult(result),
        });
      }
      this._moveCoordinator.startDrag(nodeId, e, this.model);
    };
    this._container.addEventListener('pointerdown', this._pointerDownHandler);

    this._root = createRoot(this._container);
    this._renderReact();

    this._themeListener = (e: Event) => {
      if (e.target === document.documentElement && this._container) {
        const detail = (e as CustomEvent<{ name: string }>).detail;
        applyTheme(detail.name, this._container);
      }
    };
    document.documentElement.addEventListener('pages-theme-change', this._themeListener);
  }

  override disconnectedCallback(): void {
    if (this._themeListener) {
      document.documentElement.removeEventListener('pages-theme-change', this._themeListener);
      this._themeListener = undefined;
    }
    this._moveCoordinator?.dispose();
    this._moveCoordinator = null;
    if (this._pointerDownHandler && this._container) {
      this._container.removeEventListener('pointerdown', this._pointerDownHandler);
    }
    this._pointerDownHandler = undefined;
    this._root?.unmount();
    this._root = undefined;
    this._container?.remove();
    this._container = undefined;
    releaseIsolationStyles(this);
    super.disconnectedCallback();
  }

  override updated(changed: Map<string, unknown>): void {
    if (changed.has('model') || changed.has('layoutOptions')) {
      void this._runLayout();
    }
    this._renderReact();
  }

  private async _runLayout(): Promise<void> {
    const model = this.model;
    if (!model) {
      this._nodes = [];
      this._edges = [];
      return;
    }

    const generation = ++this._layoutGeneration;

    try {
      const layout = await computeElkLayout(model, this.layoutOptions);
      if (generation !== this._layoutGeneration) return;
      const { nodes, edges } = toReactFlowGraph(model, layout, undefined, this.layoutOptions?.direction);
      this._nodes = nodes;
      this._edges = edges;
    } catch (err) {
      if (generation !== this._layoutGeneration) return;
      const { nodes, edges } = toReactFlowGraph(model, undefined, undefined, this.layoutOptions?.direction);
      this._nodes = nodes;
      this._edges = edges;
      emitPagesEvent(this, 'graph:layout:error', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  private _handleMoveResult(result: DragEndResult): void {
    this._moveWasActive = true;
    if (result.type === 'splice') {
      this.onMutation?.({
        type: 'moveNodeToEdge',
        nodeId: result.nodeId,
        edgeId: result.edgeId,
        sourceCleanup: result.sourceCleanup,
      });
    }
  }

  private _renderReact(): void {
    if (!this._root) return;

    this._root.render(
      createElement(ReactFlowApp, {
        nodes: this.nodes ?? this._nodes,
        edges: this.edges ?? this._edges,
        nodeTypes: getNodeTypes(),
        onNodeClick: (nodeId: string, node: Node) => {
          this._nodes = this._nodes.map(n => ({ ...n, selected: n.id === nodeId }));
          this._renderReact();
          emitPagesEvent(this, 'graph:node:click', {
            nodeId,
            nodeType: node.type ?? '',
          });
        },
        onEdgeClick: (edgeId: string, edge: Edge) => {
          emitPagesEvent(this, 'graph:edge:click', {
            edgeId,
            edgeType: edge.type ?? '',
          });
        },
        onSelectionChange: (nodes: Node[], edges: Edge[]) => {
          emitPagesEvent(this, 'graph:selection:change', {
            nodeIds: nodes.map(n => n.id),
            edgeIds: edges.map(e => e.id),
          });
        },
        onViewportChange: (viewport: { x: number; y: number; zoom: number }) => {
          emitPagesEvent(this, 'graph:viewport:change', viewport);
        },
        onRelayout: () => {
          emitPagesEvent(this, 'graph:layout:relayout', {});
          void this._runLayout();
        },
        onConnect: (connection: Connection) => {
          if (!this.model) return;
          const source = nodeById(this.model, connection.source);
          const target = nodeById(this.model, connection.target);
          if (!source || !target) return;
          const policy = this.editPolicy;
          if (policy && !policy.canConnect(source, target, this.model)) return;
          this.onMutation?.({ type: 'addEdge', sourceId: connection.source, targetId: connection.target });
          emitPagesEvent(this, 'graph:edge:create', { sourceId: connection.source, targetId: connection.target });
        },
        isValidConnection: (connection: Connection) => {
          if (!this.model) return false;
          const policy = this.editPolicy;
          if (!policy) return true;
          const source = nodeById(this.model, connection.source);
          const target = nodeById(this.model, connection.target);
          if (!source || !target) return false;
          return policy.canConnect(source, target, this.model);
        },
        onReactFlowReady: (instance: ReactFlowInstance) => {
          this._reactFlowInstance = instance;
        },
        onConnectStart: (event: MouseEvent | TouchEvent, params: { nodeId: string | null }) => {
          this._connectSourceNodeId = params.nodeId ?? undefined;
          this._connectStartPos = event instanceof MouseEvent
            ? { x: event.clientX, y: event.clientY }
            : { x: event.touches[0]?.clientX ?? 0, y: event.touches[0]?.clientY ?? 0 };
          this.classList.add('graph-connecting');
        },
        onConnectEnd: (event: MouseEvent | TouchEvent) => {
          const sourceId = this._connectSourceNodeId;
          const startPos = this._connectStartPos;
          this._connectSourceNodeId = undefined;
          this._connectStartPos = undefined;

          const wasMoveActive = this._moveCoordinator?.isActive || this._moveWasActive;
          this._moveWasActive = false;
          if (wasMoveActive) { this.classList.remove('graph-connecting'); return; }
          if (!sourceId || !this.model) { this.classList.remove('graph-connecting'); return; }

          const pos = event instanceof MouseEvent
            ? { x: event.clientX, y: event.clientY }
            : { x: event.changedTouches[0]?.clientX ?? 0, y: event.changedTouches[0]?.clientY ?? 0 };

          let targetNodeId: string | undefined;
          for (const hitEl of document.elementsFromPoint(pos.x, pos.y)) {
            const nodeEl = hitEl.closest('.react-flow__node') as HTMLElement | null;
            if (nodeEl?.dataset['id']) {
              targetNodeId = nodeEl.dataset['id'];
              break;
            }
          }
          this.classList.remove('graph-connecting');

          if (targetNodeId && targetNodeId !== sourceId) {
            const source = nodeById(this.model, sourceId);
            const target = nodeById(this.model, targetNodeId);
            if (source && target) {
              const policy = this.editPolicy;
              if (!policy || policy.canConnect(source, target, this.model)) {
                this.onMutation?.({ type: 'addEdge', sourceId, targetId: targetNodeId });
                emitPagesEvent(this, 'graph:edge:create', { sourceId, targetId: targetNodeId });
              }
            }
            return;
          }

          const canvasRect = this._container?.getBoundingClientRect();
          if (canvasRect && (pos.x < canvasRect.left || pos.x > canvasRect.right || pos.y < canvasRect.top || pos.y > canvasRect.bottom)) return;

          emitPagesEvent(this, 'graph:connect:end-on-empty', { ...pos, sourceNodeId: sourceId });
        },
        onPaneClick: (event) => {
          emitPagesEvent(this, 'graph:pane:click', { x: event.clientX, y: event.clientY });
        },
        onPaneContextMenu: (event) => {
          emitPagesEvent(this, 'graph:pane:contextmenu', { x: event.clientX, y: event.clientY });
        },
        onNodeContextMenu: (_event, node: Node) => {
          emitPagesEvent(this, 'graph:node:contextmenu', { nodeId: node.id, nodeType: node.type ?? '' });
        },
        onEdgeContextMenu: (_event, edge: Edge) => {
          emitPagesEvent(this, 'graph:edge:contextmenu', { edgeId: edge.id, edgeType: edge.type ?? '' });
        },
        miniMapNodeColor: this.miniMapNodeColor,
      }),
    );
  }
}
