import { html, nothing, type LitElement, type TemplateResult } from 'lit';
import { property, state } from 'lit/decorators.js';
import { computeElkLayout, toReactFlowGraph } from '@casehubio/graph-renderer';
import type { ElkLayoutOptions, ElkLayoutResult, EditPolicy, GraphEdit } from '@casehubio/graph-renderer';
import type { PersistenceBackend, GraphModel, NodeDecoration } from '@casehubio/graph-core';
import type { Node, Edge } from '@xyflow/react';
import type { PropertyPaletteSource, EditorResolver } from '@casehubio/pages-property-palette';
import type { PaletteItem, PaletteSelectDetail } from '@casehubio/pages-diagram-palette';
import { exportDiagram } from '@casehubio/graph-renderer';
import type { ExportFormat } from '@casehubio/graph-renderer';
import { getPropertySchema } from './schema-registry.js';
import '@casehubio/pages-property-palette';
import '@casehubio/pages-diagram-palette';

export interface AdapterResult {
  readonly model: GraphModel;
  readonly yamlPaths: ReadonlyMap<string, readonly (string | number)[]>;
  readonly degraded?: { readonly reason: string };
}

const MAX_UNDO = 50;

type Constructor<T = Record<string, unknown>> = new (...args: any[]) => T;

export declare class DiagramBaseInterface {
  yaml: string;
  src: string;
  backend: PersistenceBackend | null;
  uri: string;
  readonly: boolean;
  _nodes: Node[];
  _edges: Edge[];
  _error: string;
  _selectedNodeId: string;
  _selectedData: Record<string, unknown>;
  _selectedSchema: Record<string, unknown>;
  _saving: boolean;
  _showConflict: boolean;
  _confirmMessage: string;
  _mode: 'design' | 'runtime';
  _currentYaml: string;
  _savedYaml: string;
  _adapterResult: AdapterResult | null;
  _undoStack: string[];
  _redoStack: string[];
  _renderInProgress: boolean;
  _pendingRenderYaml: string;
  _lastLayout: ElkLayoutResult | undefined;
  _pendingConfirm: ((v: boolean) => void) | null;
  get _isDirty(): boolean;
  _fullRender(yamlStr: string): Promise<void>;
  _updateWithoutLayout(yamlStr: string): void;
  _updateSelectedNode(): void;
  _pushUndo(): void;
  _undo(): Promise<void>;
  _redo(): Promise<void>;
  _load(): Promise<void>;
  _save(): Promise<void>;
  _resolveConflict(action: 'overwrite' | 'reload' | 'cancel'): Promise<void>;
  _handleNodeClick: (e: Event) => void;
  _handleSelectionChange: (e: Event) => void;
  _handlePropertyChange: (e: Event) => void;
  _onPropertyChange(field: (string | number)[], value: unknown): void;
  _handlePaletteSelect: (e: Event) => void;
  _handleMutation: (edit: GraphEdit) => void;
  protected _applyGraphEdit(yaml: string, edit: GraphEdit): string;
  _exportDiagram(format: ExportFormat): Promise<void>;
  _renderError(): TemplateResult;
  _clearErrorAndRetry(): void;
  _renderConflictDialog(): TemplateResult;
  _renderDeleteConfirm(): TemplateResult;
  _renderPropertyPanel(): TemplateResult;
  _renderStencilPalette(): TemplateResult;
  _paletteItems(): PaletteItem[];
  protected _layoutOptions(): ElkLayoutOptions;
  protected _decorations(): ReadonlyMap<string, NodeDecoration> | undefined;
  protected _editPolicy(): EditPolicy | undefined;
  protected _editorResolver(): EditorResolver | undefined;
  protected _iconRenderer(): ((icon: string) => TemplateResult) | undefined;
  protected get _propertyPaletteSource(): PropertyPaletteSource | undefined;
}

export function DiagramBaseMixin<T extends Constructor<LitElement>>(Base: T): Constructor<DiagramBaseInterface> & T;
export function DiagramBaseMixin<T extends Constructor<LitElement>>(Base: T) {
  abstract class DiagramBase extends Base {
    @property() yaml = '';
    @property() src = '';
    @property({ attribute: false }) backend: PersistenceBackend | null = null;
    @property() uri = '';
    @property({ type: Boolean }) readonly = false;

    @state() protected _nodes: Node[] = [];
    @state() protected _edges: Edge[] = [];
    @state() protected _error = '';
    @state() protected _selectedNodeId = '';
    @state() protected _selectedData: Record<string, unknown> = {};
    @state() protected _selectedSchema: Record<string, unknown> = {};
    @state() protected _saving = false;
    @state() protected _showConflict = false;
    @state() protected _confirmMessage = '';
    @state() protected _mode: 'design' | 'runtime' = 'design';

    protected _currentYaml = '';
    protected _savedYaml = '';
    protected _version = '';
    protected _adapterResult: AdapterResult | null = null;
    protected _undoStack: string[] = [];
    protected _redoStack: string[] = [];
    protected _renderInProgress = false;
    protected _pendingRenderYaml = '';
    protected _lastLayout: ElkLayoutResult | undefined;
    private _conflictVersion = '';
    protected _pendingConfirm: ((v: boolean) => void) | null = null;
    private _srcAbortController: AbortController | null = null;

    protected abstract _adaptYaml(yaml: string): AdapterResult;

    protected abstract _applyPropertyEdit(
      yaml: string,
      nodePath: readonly (string | number)[],
      field: (string | number)[],
      value: unknown,
    ): string;

    protected abstract _emptyTemplate(): string | null;

    protected _decorations(): ReadonlyMap<string, NodeDecoration> | undefined {
      return undefined;
    }

    protected _layoutOptions(): ElkLayoutOptions {
      return { direction: 'DOWN', spacing: 60 };
    }

    protected _editPolicy(): EditPolicy | undefined {
      return undefined;
    }

    protected _editorResolver(): EditorResolver | undefined {
      return undefined;
    }

    protected get _propertyPaletteSource(): PropertyPaletteSource | undefined {
      if (!this._selectedNodeId) return undefined;
      return {
        schema: this._selectedSchema,
        data: this._selectedData,
        readonly: this.readonly,
        onChange: (field, value) => { this._onPropertyChange(field, value); },
      };
    }

    protected _onPropertyChange(field: (string | number)[], value: unknown): void {
      if (this.readonly) return;
      if (this._adapterResult?.degraded) return;
      if (!this._selectedNodeId || !this._adapterResult) return;
      const nodePath = this._adapterResult.yamlPaths.get(this._selectedNodeId);
      if (!nodePath) return;
      this._pushUndo();
      try {
        this._currentYaml = this._applyPropertyEdit(this._currentYaml, nodePath, field, value);
        this._updateWithoutLayout(this._currentYaml);
      } catch (e) {
        this._currentYaml = this._undoStack.pop() ?? this._currentYaml;
        this._error = `Edit failed: ${e}`;
      }
    }

    protected _paletteItems(): PaletteItem[] {
      const policy = this._editPolicy();
      if (!policy || !this._adapterResult) return [];
      const emptyModel: GraphModel = { nodes: [], edges: [] };
      return policy.getCreatableTypes(null, this._adapterResult?.model ?? emptyModel)
        .map(s => {
          const item: PaletteItem = { type: s.type, label: s.label, icon: s.icon };
          if (s.group) (item as any).group = s.group;
          return item;
        });
    }

    protected _handlePaletteSelect = (e: Event): void => {
      if (this.readonly) return;
      const detail = (e as CustomEvent<PaletteSelectDetail>).detail;
      const policy = this._editPolicy();
      if (policy) {
        const emptyModel: GraphModel = { nodes: [], edges: [] };
        const creatable = policy.getCreatableTypes(null, this._adapterResult?.model ?? emptyModel);
        if (!creatable.some(s => s.type === detail.item.type)) return;
      }
      this._handleMutation({ type: 'addNode', nodeType: detail.item.type });
    };

    _handleMutation = (edit: GraphEdit): void => {
      if (this.readonly) return;
      this._pushUndo();
      try {
        this._currentYaml = this._applyGraphEdit(this._currentYaml, edit);
        void this._fullRender(this._currentYaml);
      } catch (e) {
        this._currentYaml = this._undoStack.pop() ?? this._currentYaml;
        this._error = `Edit failed: ${e}`;
      }
    };

    protected _applyGraphEdit(_yaml: string, edit: GraphEdit): string {
      throw new Error(`_applyGraphEdit not implemented for edit type: ${edit.type}`);
    }

    protected _renderPropertyPanel(): TemplateResult {
      const source = this._propertyPaletteSource;
      if (!source) return html``;
      return html`
        <pages-property-palette
          .source=${source}
          .resolver=${this._editorResolver()}
          paletteId=${this.tagName.toLowerCase()}>
        </pages-property-palette>
      `;
    }

    protected _iconRenderer(): ((icon: string) => TemplateResult) | undefined {
      return undefined;
    }

    protected _renderStencilPalette(): TemplateResult {
      const items = this._paletteItems();
      if (items.length === 0) return html``;
      return html`
        <pages-diagram-palette
          .items=${items}
          .iconRenderer=${this._iconRenderer()}
          paletteId=${this.tagName.toLowerCase()}
          @pages-palette-select=${this._handlePaletteSelect}>
        </pages-diagram-palette>
      `;
    }

    override createRenderRoot(): HTMLElement {
      return this;
    }

    override connectedCallback(): void {
      super.connectedCallback();
      this.addEventListener('keydown', this._handleKeydown);
    }

    override disconnectedCallback(): void {
      this.removeEventListener('keydown', this._handleKeydown);
      this._srcAbortController?.abort();
      super.disconnectedCallback();
    }

    override async updated(changed: Map<string, unknown>): Promise<void> {
      if (changed.has('yaml') && this.yaml) {
        this._currentYaml = this.yaml;
        this._savedYaml = this.yaml;
        this._undoStack = [];
        this._redoStack = [];
        this._selectedNodeId = '';
        await this._fullRender(this.yaml);
      }
      if (changed.has('src') && this.src) {
        this._srcAbortController?.abort();
        this._srcAbortController = new AbortController();
        try {
          const response = await fetch(this.src, { signal: this._srcAbortController.signal });
          if (!response.ok) {
            this._error = `Failed to fetch ${this.src}: HTTP ${response.status}`;
            return;
          }
          const text = await response.text();
          this._currentYaml = text;
          this._savedYaml = text;
          this._undoStack = [];
          this._redoStack = [];
          this._selectedNodeId = '';
          await this._fullRender(text);
        } catch (e) {
          if ((e as Error).name !== 'AbortError') {
            this._error = `Failed to fetch ${this.src}: ${e}`;
          }
        }
      }
      if ((changed.has('backend') || changed.has('uri')) && this.backend && this.uri) {
        await this._load();
      }
    }

    protected async _fullRender(yamlStr: string): Promise<void> {
      if (this._renderInProgress) {
        this._pendingRenderYaml = yamlStr;
        return;
      }
      this._renderInProgress = true;
      try {
        this._error = '';
        const result = this._adaptYaml(yamlStr);
        this._adapterResult = result;
        const layout = await computeElkLayout(result.model, this._layoutOptions());
        if (this._adapterResult !== result) {
          this._renderInProgress = false;
          await this._fullRender(this._currentYaml);
          return;
        }
        this._lastLayout = layout;
        const { nodes, edges } = toReactFlowGraph(result.model, layout, this._decorations(), this._layoutOptions().direction);
        this._nodes = nodes;
        this._edges = edges;
      } catch (e) {
        this._error = String(e);
      } finally {
        this._renderInProgress = false;
        if (this._pendingRenderYaml && this._pendingRenderYaml !== yamlStr) {
          const pending = this._pendingRenderYaml;
          this._pendingRenderYaml = '';
          await this._fullRender(pending);
        } else {
          this._pendingRenderYaml = '';
        }
      }
    }

    protected _updateWithoutLayout(yamlStr: string): void {
      if (!this._lastLayout) return;
      try {
        this._error = '';
        this._adapterResult = this._adaptYaml(yamlStr);
        const { nodes, edges } = toReactFlowGraph(this._adapterResult.model, this._lastLayout, this._decorations(), this._layoutOptions().direction);
        this._nodes = nodes;
        this._edges = edges;
        this._updateSelectedNode();
      } catch (e) {
        this._error = `Edit failed: ${e}`;
        this._currentYaml = this._undoStack.pop() ?? this._currentYaml;
      }
    }

    protected _updateSelectedNode(): void {
      if (!this._selectedNodeId || !this._adapterResult) {
        this._selectedData = {};
        this._selectedSchema = {};
        return;
      }
      const node = this._adapterResult.model.nodes.find(n => n.id === this._selectedNodeId);
      if (!node) {
        this._selectedNodeId = '';
        this._selectedData = {};
        this._selectedSchema = {};
        return;
      }
      this._selectedData = { ...node.properties };
      this._selectedSchema = getPropertySchema(node.type) ?? {};
    }

    protected _pushUndo(): void {
      this._undoStack.push(this._currentYaml);
      if (this._undoStack.length > MAX_UNDO) this._undoStack.shift();
      this._redoStack = [];
    }

    protected async _undo(): Promise<void> {
      if (this._undoStack.length === 0) return;
      this._redoStack.push(this._currentYaml);
      this._currentYaml = this._undoStack.pop()!;
      await this._fullRender(this._currentYaml);
      this._updateSelectedNode();
    }

    protected async _redo(): Promise<void> {
      if (this._redoStack.length === 0) return;
      this._undoStack.push(this._currentYaml);
      this._currentYaml = this._redoStack.pop()!;
      await this._fullRender(this._currentYaml);
      this._updateSelectedNode();
    }

    protected async _load(): Promise<void> {
      if (!this.backend || this._saving) return;
      try {
        const result = await this.backend.read(this.uri);
        if (result.status === 'ok') {
          this._currentYaml = result.yaml;
          this._savedYaml = result.yaml;
          this._version = result.version;
          this._undoStack = [];
          this._redoStack = [];
          this._selectedNodeId = '';
          await this._fullRender(result.yaml);
        } else if (result.status === 'not_found') {
          const empty = this._emptyTemplate();
          if (empty === null) {
            this._error = `Document not found: ${this.uri}`;
            return;
          }
          this._currentYaml = empty;
          this._savedYaml = empty;
          this._version = '';
          await this._fullRender(empty);
        } else if (result.status === 'parse_error') {
          this._error = result.message;
        } else if (result.status === 'schema_error') {
          this._currentYaml = result.yaml;
          this._savedYaml = result.yaml;
          this._version = result.version;
          await this._fullRender(result.yaml);
        }
      } catch (e) {
        this._error = `Load failed: ${e}`;
      }
    }

    protected async _save(): Promise<void> {
      if (!this.backend || this._currentYaml === this._savedYaml || this._saving || this._renderInProgress) return;
      this._saving = true;
      this.requestUpdate();
      try {
        const result = await this.backend.write(this.uri, this._currentYaml, this._version);
        if (result.status === 'ok') {
          this._version = result.version;
          this._savedYaml = this._currentYaml;
        } else if (result.status === 'conflict') {
          this._conflictVersion = result.currentVersion;
          this._showConflict = true;
        }
      } catch (e) {
        this._error = `Save failed: ${e}`;
      } finally {
        this._saving = false;
        this.requestUpdate();
      }
    }

    protected async _resolveConflict(action: 'overwrite' | 'reload' | 'cancel'): Promise<void> {
      this._showConflict = false;
      if (action === 'overwrite' && this.backend) {
        this._version = this._conflictVersion;
        await this._save();
      } else if (action === 'reload') {
        await this._load();
      }
      this.requestUpdate();
    }

    private _nodeClickGuard = false;

    protected _handleNodeClick = (e: Event): void => {
      const detail = (e as CustomEvent).detail;
      const payload = detail?.payload ?? detail;
      const nodeId = payload?.nodeId ?? '';
      if (nodeId && this._selectedNodeId !== nodeId) {
        this._selectedNodeId = nodeId;
        this._updateSelectedNode();
      }
      this._nodeClickGuard = true;
      setTimeout(() => { this._nodeClickGuard = false; }, 100);
    };

    protected _handleSelectionChange = (e: Event): void => {
      const detail = (e as CustomEvent).detail;
      const payload = detail?.payload ?? detail;
      const nodeIds: string[] = payload?.nodeIds ?? [];
      if (nodeIds.length > 0) {
        if (this._selectedNodeId !== nodeIds[0]) {
          this._selectedNodeId = nodeIds[0]!;
          this._updateSelectedNode();
        }
      } else if (this._selectedNodeId !== '' && !this._nodeClickGuard) {
        this._selectedNodeId = '';
        this._selectedData = {};
        this._selectedSchema = {};
      }
    };

    protected _handlePropertyChange = (e: Event): void => {
      if (this.readonly) return;
      if (this._adapterResult?.degraded) return;
      const detail = (e as CustomEvent<{ field: (string | number)[]; value: unknown }>).detail;
      if (!this._selectedNodeId || !this._adapterResult) return;

      const nodePath = this._adapterResult.yamlPaths.get(this._selectedNodeId);
      if (!nodePath) return;

      this._pushUndo();

      try {
        this._currentYaml = this._applyPropertyEdit(
          this._currentYaml,
          nodePath,
          detail.field,
          detail.value,
        );
        this._updateWithoutLayout(this._currentYaml);
      } catch (e) {
        this._currentYaml = this._undoStack.pop() ?? this._currentYaml;
        this._error = `Edit failed: ${e}`;
      }
    };

    private _handleKeydown = (e: KeyboardEvent): void => {
      const tag = (e.target as HTMLElement).tagName;
      const isTextInput = tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement).isContentEditable;

      if (e.key === 'Escape') {
        this._selectedNodeId = '';
        this._selectedData = {};
        this._selectedSchema = {};
        return;
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && !isTextInput && this._editPolicy() != null) {
        e.preventDefault();
        this._onDelete();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        this._undo().catch(() => {});
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && e.shiftKey) {
        e.preventDefault();
        this._redo().catch(() => {});
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        this._save().catch(() => {});
      }
    };

    protected async _exportDiagram(format: ExportFormat): Promise<void> {
      const canvas = this.renderRoot.querySelector('pages-graph-canvas');
      if (!canvas) return;
      const name = this.uri ? this.uri.replace(/\.[^.]+$/, '') : 'diagram';
      await exportDiagram(canvas as HTMLElement, this._nodes, format, name);
    }

    protected _onDelete(): void {
      // Subclasses with structural editing override this
    }

    protected _renderError(): TemplateResult {
      const showRetry = !this.readonly || !!this.src;
      return html`
        <div style="color: red; padding: 16px;">
          ${this._error}
          ${showRetry ? html`<button @click=${() => { this._clearErrorAndRetry(); }}>Retry</button>` : nothing}
        </div>
      `;
    }

    protected _clearErrorAndRetry(): void {
      this._error = '';
      void this._fullRender(this._currentYaml);
    }

    protected _renderConflictDialog(): TemplateResult {
      return html`
        <div style="position: fixed; inset: 0; background: rgba(0,0,0,0.3); display: flex; align-items: center; justify-content: center; z-index: 1000;">
          <div style="background: var(--pages-surface-color, #fff); padding: 20px; border-radius: 8px; max-width: 400px; box-shadow: 0 4px 12px rgba(0,0,0,0.15);">
            <div style="font-weight: 600; margin-bottom: 12px;">Conflict detected</div>
            <div style="font-size: 13px; margin-bottom: 16px;">The file was modified externally since your last load.</div>
            <div style="display: flex; gap: 8px; justify-content: flex-end;">
              <button @click=${() => this._resolveConflict('cancel')}>Keep editing</button>
              <button @click=${() => this._resolveConflict('reload')}>Discard my changes</button>
              <button @click=${() => this._resolveConflict('overwrite')}>Save anyway</button>
            </div>
          </div>
        </div>
      `;
    }

    protected _renderDeleteConfirm(): TemplateResult {
      return html`
        <div style="position: fixed; inset: 0; background: rgba(0,0,0,0.3); display: flex; align-items: center; justify-content: center; z-index: 1000;">
          <div style="background: var(--pages-surface-color, #fff); padding: 20px; border-radius: 8px; max-width: 400px; box-shadow: 0 4px 12px rgba(0,0,0,0.15);">
            <div style="font-size: 13px; margin-bottom: 16px;">${this._confirmMessage}</div>
            <div style="display: flex; gap: 8px; justify-content: flex-end;">
              <button @click=${() => { this._confirmMessage = ''; this._pendingConfirm?.(false); this.requestUpdate(); }}>Cancel</button>
              <button @click=${() => { this._confirmMessage = ''; this._pendingConfirm?.(true); this.requestUpdate(); }}>Remove</button>
            </div>
          </div>
        </div>
      `;
    }

    protected get _isDirty(): boolean {
      return this._currentYaml !== this._savedYaml;
    }
  }

  return DiagramBase as unknown as Constructor<DiagramBaseInterface> & T;
}
