import { LitElement, html, css, nothing, type TemplateResult } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import type { TypedDataSet, TypedRow, Column, ColumnId, CellValue, ColumnSettings } from '@casehubio/pages-data/dist/dataset/types.js';
import { ColumnType } from '@casehubio/pages-data/dist/dataset/types.js';
import type { SortColumn } from '@casehubio/pages-data/dist/dataset/sort.js';
import type { TableColumnConfig, ColumnRenderer, DisplayMode, PageChangeDetail, LoadMoreDetail, SelectionMode, SelectionChangeDetail, RowActivateDetail, SortDirection, SortChangeDetail, SortEntry, ColumnChangeDetail, FilterChangeDetail, FilterConfig, DetailMode, DetailChangeDetail } from './types.js';
import { computeScrollWindow } from './virtual-scroll-engine.js';
import { createMultiComparator } from './sort.js';
import { flattenTree, type TreeRow } from './tree.js';
import { resolveColumnName, cellToRaw, applyCellExpression, resolveColumnExpression } from './cell-utils.js';
import { until } from 'lit/directives/until.js';
import { tableToCsv, downloadCsv, copyToClipboard } from './csv-export.js';
import { evaluateExpression, createRowContext } from '@casehubio/pages-component/dist/context/expression-evaluator.js';
import { buildTreeIndex, computeDefaultExpandState, collectVisibleNodes, paginateTreeByRoots, findMatchingNodes, rowMatchesText, sortTreeLevel, type TreeNode, type ExpandableConfig } from './tree-builder.js';
import { EMPTY_CONTEXT } from '@casehubio/pages-component/dist/context/types.js';

const AUTO_THRESHOLD = 50;

interface RowStyleRule {
  readonly condition: string;
  readonly className?: string;
  readonly style?: Record<string, string>;
}

@customElement('pages-table')
export class PagesTable extends LitElement {
  @property({ attribute: false }) dataSet?: TypedDataSet;
  @property({ attribute: false }) columnRenderers?: ReadonlyMap<ColumnId, ColumnRenderer>;
  @property({ attribute: false }) columnConfig?: readonly TableColumnConfig[];
  @property({ type: String }) mode: DisplayMode = 'auto';
  @property({ type: String }) selection: SelectionMode = 'none';
  @property({ type: Array, attribute: 'selected-keys' }) selectedKeys?: readonly string[];
  @property({ attribute: false }) getRowKey?: (row: TypedRow) => string;
  @property({ attribute: false }) getRowClass?: (row: TypedRow) => string;
  @property({ attribute: false }) getChildren?: (row: TypedRow) => readonly TypedRow[];
  @property({ attribute: false }) getRowDetail?: (row: TypedRow) => TemplateResult | undefined;
  @property({ type: String, attribute: 'detail-mode' }) detailMode: DetailMode = 'single';
  @property({ type: Array, attribute: false }) expandedDetailKeys?: readonly string[];
  @property({ type: Boolean }) loading = false;
  @property({ type: String }) error = '';

  set activeSort(sort: SortColumn | undefined) {
    if (!sort) {
      this._sortStack = [];
    } else {
      const dir = sort.order === 'ASCENDING' ? 'asc' as const : 'desc' as const;
      this._sortStack = [{ columnId: String(sort.columnId), direction: dir }];
    }
  }

  set activePage(page: number | undefined) {
    if (page !== undefined) this.currentPage = page;
  }
  get activePage(): number | undefined { return this.currentPage; }

  @property({ type: String, attribute: 'empty-message' }) emptyMessage = 'No data';
  @property({ type: Number, attribute: 'row-height' }) rowHeight = 48;
  @property({ type: Number, attribute: 'buffer-size' }) bufferSize = 5;
  @property({ type: Number, attribute: 'page-size' }) pageSize = 25;
  @property({ type: Number, attribute: 'current-page' }) currentPage = 0;
  @property({ type: Number, attribute: 'total-rows' }) totalRows?: number;
  @property({ type: Boolean, attribute: 'has-more' }) hasMore = false;
  @property({ type: String, attribute: 'sort-column-id' })
  get sortColumnId(): string | undefined { return this._sortStack[0]?.columnId; }
  set sortColumnId(id: string | undefined) {
    if (id === undefined) {
      this._sortStack = [];
    } else {
      const dir = this._sortStack[0]?.columnId === id ? this._sortStack[0].direction : 'asc';
      this._sortStack = [{ columnId: id, direction: dir }];
    }
  }

  @property({ type: String, attribute: 'sort-direction' })
  get sortDirection(): SortDirection { return this._sortStack[0]?.direction ?? 'none'; }
  set sortDirection(dir: SortDirection) {
    const first = this._sortStack[0];
    if (!first) return;
    this._sortStack = [{ columnId: first.columnId, direction: dir }, ...this._sortStack.slice(1)];
  }

  @property({ type: Boolean, attribute: 'client-sort' }) clientSort = false;
  @property({ type: Boolean, attribute: 'client-filter' }) clientFilter = false;
  @property({ type: String, attribute: 'filter-text' }) filterText = '';

  @state() private _sortStack: SortEntry[] = [];
  @state() private _expandedRowIds = new Set<string>();
  private _treeMetadata = new Map<TypedRow, TreeRow>();

  @state() private _scrollTop = 0;
  @state() private _containerHeight = 0;
  @state() private _loadingMore = false;
  @state() private _internalSelectedKeys = new Set<string>();
  @state() private _lastClickedKey: string | null = null;
  @state() private _columnPickerOpen = false;
  @state() private _focusRowIndex = 0;
  @state() private _focusColIndex = 0;
  @state() private _hiddenColumnIds = new Set<string>();

  private _filterDebounceTimer?: number;
  private _selectedColumnId: ColumnId | undefined;
  private _selectedValue: string | undefined;
  private _pipelineMode = false;
  private _lookup: unknown = undefined;
  private _filterConfig: FilterConfig = { enabled: false };
  private _sortableFromProps = false;
  private _dataRequestPending = false;
  private _propsColumns: readonly ColumnSettings[] | undefined;
  private _rowStyleRules: readonly RowStyleRule[] = [];
  private _expandableConfig: ExpandableConfig | undefined;
  private _treeRoots: TreeNode[] = [];
  private _treeNodeMap = new Map<string, TreeNode>();
  private _treeExpandState = new Map<string, boolean>();
  private _treeExpandStateInitialized = false;
  private _treeNodeByRow = new Map<TypedRow, TreeNode>();
  private _csvExportEnabled = false;
  private _rowDetailConfig?: { mode?: string; columns?: readonly { id: string; label?: string }[] };
  @state() private _internalExpandedDetailKeys = new Set<string>();
  private _instanceId = '';

  set props(p: Record<string, unknown>) {
    this._pipelineMode = true;

    const lookup = p.lookup as unknown;
    if (lookup) {
      this._lookup = lookup;
      this._dataRequestPending = true;
    }

    if (typeof p.pageSize === 'number') {
      this.pageSize = p.pageSize;
      this.mode = 'paginated';
    }

    this._sortableFromProps = p.sortable === true;

    const filter = p.filter as Record<string, unknown> | undefined;
    if (filter) {
      this._filterConfig = {
        enabled: filter.enabled !== false && filter.notification === true,
        group: typeof filter.group === 'string' ? filter.group : undefined,
      };
    }

    const columns = p.columns as readonly ColumnSettings[] | undefined;
    if (columns) {
      this._propsColumns = columns;
    }

    const expandable = p.expandable as ExpandableConfig | undefined;
    if (expandable) {
      this._expandableConfig = expandable;
      this.mode = 'auto';
    }

    const rowStyle = p.rowStyle as readonly RowStyleRule[] | undefined;
    if (rowStyle) {
      this._rowStyleRules = rowStyle;
    }

    const rowDetail = p.rowDetail as { mode?: string; columns?: readonly { id: string; label?: string }[] } | undefined;
    if (rowDetail) {
      this._rowDetailConfig = rowDetail;
      if (rowDetail.mode === 'multi') {
        this.detailMode = 'multi';
      }
    }

    if (p.csvExport === true) {
      this._csvExportEnabled = true;
    }

    if (typeof p.height === 'string' || typeof p.height === 'number') {
      this.style.height = typeof p.height === 'number' ? `${String(p.height)}px` : String(p.height);
    }
  }

  private _requestData(): void {
    if (!this._lookup) return;
    this.dispatchEvent(new CustomEvent('pages-data-request', {
      bubbles: true,
      composed: true,
      detail: { element: this, lookup: this._lookup },
    }));
  }

  private _rebuildConfigFromProps(): void {
    if (!this.dataSet) return;
    const cols = this.dataSet.columns;

    const config: TableColumnConfig[] = cols.map(col => {
      const label = this._propsColumns
        ? resolveColumnName(col, this._propsColumns)
        : col.name;
      return {
        id: col.id,
        label,
        sortable: this._sortableFromProps,
        width: '1fr',
      };
    });
    this.columnConfig = config;

    if (this._propsColumns) {
      const renderers = new Map<ColumnId, ColumnRenderer>();
      for (const col of cols) {
        const expr = resolveColumnExpression(col.id, this._propsColumns);
        if (expr) {
          const expression = expr;
          renderers.set(col.id, (cell: CellValue) => {
            const raw = cellToRaw(cell);
            if (raw === null) return '';
            return until(
              applyCellExpression(raw, expression).then(r => r === null ? '' : String(r)),
              String(raw),
            );
          });
        }
      }
      if (renderers.size > 0) {
        this.columnRenderers = renderers;
      }
    }

    if (this._rowDetailConfig?.columns && this._rowDetailConfig.columns.length > 0) {
      const allCols = this.dataSet.columns;
      const detailColIds = this._rowDetailConfig.columns.map(c => ({
        id: c.id as ColumnId,
        label: c.label,
      }));
      if (!this.getRowKey) {
        const firstCol = cols[0];
        if (firstCol) {
          this.getRowKey = (row: TypedRow) => {
            const cell = row.cell(firstCol.id);
            return cell.type === 'NULL' ? '' : String(cell.value);
          };
        }
      }
      this.getRowDetail = (row: TypedRow) => {
        const pairs = detailColIds.map(dc => {
          const col = allCols.find(c => String(c.id) === String(dc.id));
          const label = dc.label ?? col?.name ?? String(dc.id);
          try {
            const cell = row.cell(dc.id);
            const value = cell.type === 'NULL' ? '—' : String(cell.value);
            return { label, value };
          } catch {
            return { label, value: '—' };
          }
        });
        return html`
          <div style="display: grid; grid-template-columns: auto 1fr; gap: 4px 16px; padding: 12px 0;">
            ${pairs.map(p => html`
              <span style="font-weight: var(--pages-font-weight-semibold, 600); font-size: var(--pages-font-size-sm, 12px); color: var(--pages-neutral-9, #737373);">${p.label}</span>
              <span style="font-size: var(--pages-font-size-base, 14px); color: var(--pages-neutral-11, #404040);">${p.value}</span>
            `)}
          </div>
        `;
      };
    }
  }

  private _rebuildTree(): void {
    if (!this.dataSet || !this._expandableConfig) return;
    const { roots, nodeMap } = buildTreeIndex(this.dataSet, this._expandableConfig);
    this._treeRoots = roots;
    this._treeNodeMap = nodeMap;

    if (!this._treeExpandStateInitialized) {
      this._treeExpandState = computeDefaultExpandState(roots, this._expandableConfig.defaultExpanded);
      this._treeExpandStateInitialized = true;
    }

    this._treeNodeByRow.clear();
    for (const [, node] of nodeMap) {
      this._treeNodeByRow.set(node.row, node);
    }

    this.getRowKey = (row: TypedRow) => {
      const node = this._treeNodeByRow.get(row);
      return node?.id ?? '';
    };
    this.getChildren = (row: TypedRow) => {
      const node = this._treeNodeByRow.get(row);
      return node?.children.map(c => c.row) ?? [];
    };

    const expandState = this._treeExpandState;
    this._expandedRowIds = new Set(
      [...expandState.entries()].filter(([, v]) => v).map(([k]) => k)
    );
  }

  private _toggleTreeExpand(nodeId: string): void {
    const current = this._treeExpandState.get(nodeId) ?? false;
    this._treeExpandState.set(nodeId, !current);
    this._expandedRowIds = new Set(
      [...this._treeExpandState.entries()].filter(([, v]) => v).map(([k]) => k)
    );
    this.requestUpdate();
  }

  private _handleCopyToClipboard = async (): Promise<void> => {
    if (!this.dataSet) return;
    const csv = tableToCsv(this.dataSet, this.columnConfig);
    const success = await copyToClipboard(csv);
    if (success) {
      const btn = this.shadowRoot?.querySelector('[aria-label="Copy CSV"]');
      if (btn) {
        const original = btn.textContent;
        btn.textContent = '✓';
        setTimeout(() => { btn.textContent = original; }, 1500);
      }
    }
  };

  private _emitPipelineTextFilter(): void {
    this.dispatchEvent(new CustomEvent('pages-text-filter', {
      detail: { text: this.filterText },
      bubbles: true,
      composed: true,
    }));
  }

  private get _dataRows(): readonly TypedRow[] {
    return this.dataSet?.rows ?? [];
  }

  private get _dataColumns(): readonly Column[] {
    return this.dataSet?.columns ?? [];
  }

  private _configFor(col: Column): TableColumnConfig | undefined {
    return this.columnConfig?.find(c => c.id === col.id);
  }

  static override styles = css`
    :host {
      display: block;
      height: 100%;
      font-family: var(--pages-font-family, system-ui);
    }

    .data-table {
      display: flex;
      flex-direction: column;
      height: 100%;
      min-height: 0;
    }

    .header-container {
      position: relative;
      border-bottom: 1px solid var(--pages-neutral-6, #d4d4d4);
      background: var(--pages-neutral-2, #fafafa);
      flex-shrink: 0;
      display: flex;
      align-items: center;
    }

    .header {
      display: grid;
      flex: 1;
      min-width: 0;
    }

    .header-cell {
      padding: var(--pages-space-3, 12px) var(--pages-space-2, 8px);
      font-weight: var(--pages-font-weight-semibold, 600);
      font-size: var(--pages-font-size-sm, 12px);
      color: var(--pages-neutral-12, #171717);
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .checkbox-cell {
      display: flex;
      align-items: center;
      justify-content: center;
      padding: var(--pages-space-3, 12px) var(--pages-space-2, 8px);
    }

    .checkbox {
      width: 16px;
      height: 16px;
      border: 2px solid var(--pages-neutral-7, #a3a3a3);
      border-radius: 3px;
      cursor: pointer;
      background: var(--pages-neutral-1, #ffffff);
      position: relative;
    }

    .checkbox[aria-checked="true"]::after,
    .checkbox[aria-checked="mixed"]::after {
      content: '';
      position: absolute;
      left: 4px;
      top: 1px;
      width: 4px;
      height: 8px;
      border: solid var(--pages-neutral-1, #ffffff);
      border-width: 0 2px 2px 0;
      transform: rotate(45deg);
    }

    .checkbox[aria-checked="true"],
    .checkbox[aria-checked="mixed"] {
      background: var(--pages-primary-9, #3b82f6);
      border-color: var(--pages-primary-9, #3b82f6);
    }

    .checkbox[aria-checked="mixed"]::after {
      border-width: 0 0 2px 0;
      transform: rotate(0deg);
      top: 6px;
      left: 2px;
      width: 8px;
      height: 0;
    }

    .body {
      flex: 1;
      overflow-y: auto;
      overflow-x: auto;
      position: relative;
    }

    .body-content {
      position: relative;
    }

    .row {
      display: grid;
      border-bottom: 1px solid var(--pages-neutral-4, #e5e5e5);
      padding-right: 36px;
    }

    .row-odd {
      background: var(--pages-neutral-2, #fafafa);
    }

    .row:hover {
      background: var(--pages-neutral-3, #f5f5f5);
    }

    .row:focus {
      outline: 2px solid var(--pages-primary-9, #3b82f6);
      outline-offset: -2px;
    }

    .row[aria-selected="true"] {
      background: var(--pages-primary-3, #dbeafe);
    }

    .row[aria-selected="true"]:hover {
      background: var(--pages-primary-4, #bfdbfe);
    }

    .row.clickable:hover {
      background: var(--pages-accent-4, #e8f0fe);
      cursor: pointer;
    }

    .row.selected {
      background: var(--pages-accent-5, #d3e3fd);
    }

    .row.pages-row-danger {
      background: var(--pages-danger-3, #ffe6e6);
    }

    .row.pages-row-warning {
      background: var(--pages-warning-3, #fff4e6);
    }

    .row.pages-row-success {
      background: var(--pages-success-3, #e6ffe6);
    }

    .row.pages-row-muted {
      background: var(--pages-neutral-3, #f5f5f5);
    }

    .cell {
      padding: var(--pages-space-3, 12px) var(--pages-space-2, 8px);
      font-size: var(--pages-font-size-base, 14px);
      color: var(--pages-neutral-11, #404040);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .empty-state,
    .loading-state {
      display: flex;
      align-items: center;
      justify-content: center;
      padding: var(--pages-space-8, 32px);
      color: var(--pages-neutral-9, #737373);
      font-size: var(--pages-font-size-base, 14px);
    }

    .pagination {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: var(--pages-space-3, 12px) var(--pages-space-4, 16px);
      border-top: 1px solid var(--pages-neutral-4, #e5e5e5);
      background: var(--pages-neutral-1, #ffffff);
    }

    .pagination-info {
      display: flex;
      align-items: center;
      gap: var(--pages-space-4, 16px);
      font-size: var(--pages-font-size-sm, 12px);
      color: var(--pages-neutral-11, #404040);
    }

    .pagination-controls {
      display: flex;
      align-items: center;
      gap: var(--pages-space-2, 8px);
    }

    .pagination-button {
      padding: var(--pages-space-2, 8px) var(--pages-space-3, 12px);
      border: 1px solid var(--pages-neutral-6, #d4d4d4);
      background: var(--pages-neutral-1, #ffffff);
      color: var(--pages-neutral-11, #404040);
      font-size: var(--pages-font-size-sm, 12px);
      cursor: pointer;
      border-radius: 4px;
      transition: all 0.15s;
    }

    .pagination-button:hover:not(:disabled) {
      background: var(--pages-neutral-2, #fafafa);
      border-color: var(--pages-neutral-7, #a3a3a3);
    }

    .pagination-button:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .sortable-header {
      cursor: pointer;
      user-select: none;
      display: flex;
      align-items: center;
      gap: 4px;
    }

    .sortable-header:hover {
      background: var(--pages-neutral-3, #f5f5f5);
    }

    .sort-indicator {
      font-size: 10px;
      opacity: 0.3;
      flex-shrink: 0;
    }

    .tree-toggle {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 20px;
      height: 20px;
      border: none;
      background: none;
      cursor: pointer;
      padding: 0;
      font-size: 10px;
      color: var(--pages-neutral-9, #737373);
      border-radius: 3px;
      flex-shrink: 0;
    }

    .tree-toggle:hover {
      background: var(--pages-neutral-3, #f5f5f5);
      color: var(--pages-neutral-12, #171717);
    }

    .tree-spacer {
      display: inline-block;
      width: 20px;
      flex-shrink: 0;
    }

    .tree-cell {
      display: flex;
      align-items: center;
      gap: 2px;
    }

    .sort-priority {
      font-size: 9px;
      font-weight: 600;
      margin-left: 1px;
      vertical-align: super;
      color: var(--pages-primary-9, #3b82f6);
    }

    .sort-indicator.active {
      opacity: 1;
      color: var(--pages-accent-9, #2563eb);
    }

    .toolbar {
      display: flex;
      align-items: center;
      gap: var(--pages-space-2, 8px);
      padding: 0 var(--pages-space-2, 8px);
      flex-shrink: 0;
    }

    .filter-input {
      padding: var(--pages-space-1, 4px) var(--pages-space-2, 8px);
      border: 1px solid var(--pages-neutral-5, #e0e0e0);
      background: var(--pages-neutral-1, #ffffff);
      border-radius: 4px;
      font-size: 13px;
      color: var(--pages-neutral-12, #171717);
      width: 200px;
    }

    .filter-input::placeholder {
      color: var(--pages-neutral-8, #8c8c8c);
    }

    .filter-input:focus {
      outline: 2px solid var(--pages-primary-9, #3b82f6);
      outline-offset: 0;
      border-color: var(--pages-primary-9, #3b82f6);
    }

    .column-picker-wrapper {
      position: relative;
    }

    .column-picker-trigger {
      padding: var(--pages-space-1, 4px) var(--pages-space-2, 8px);
      border: 1px solid var(--pages-neutral-5, #e0e0e0);
      background: var(--pages-neutral-2, #fafafa);
      cursor: pointer;
      border-radius: 4px;
      font-size: 14px;
      line-height: 1;
      color: var(--pages-neutral-9, #737373);
    }

    .column-picker-trigger:hover {
      background: var(--pages-neutral-3, #f5f5f5);
      border-color: var(--pages-neutral-7, #a3a3a3);
      color: var(--pages-neutral-12, #171717);
    }

    .column-picker-dropdown {
      position: absolute;
      top: 100%;
      right: 0;
      margin-top: var(--pages-space-1, 4px);
      background: var(--pages-neutral-1, #ffffff);
      border: 1px solid var(--pages-neutral-6, #d4d4d4);
      border-radius: 4px;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
      z-index: 10;
      min-width: 200px;
    }

    .column-picker-item {
      display: flex;
      align-items: center;
      gap: var(--pages-space-2, 8px);
      padding: var(--pages-space-2, 8px) var(--pages-space-3, 12px);
      cursor: pointer;
    }

    .column-picker-item:hover {
      background: var(--pages-neutral-2, #fafafa);
    }

    .column-picker-item input[type="checkbox"] {
      margin: 0;
    }

    .column-picker-item input[type="checkbox"]:disabled {
      cursor: not-allowed;
    }

    .picker-section-label {
      padding: 6px 12px 2px;
      font-size: 10px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--pages-neutral-9, #737373);
    }

    .picker-divider {
      height: 1px;
      background: var(--pages-neutral-4, #e5e5e5);
      margin: 4px 0;
    }

    .mode-switcher {
      display: flex;
      margin: 4px 8px 6px;
      border: 1px solid var(--pages-neutral-6, #d4d4d4);
      border-radius: 4px;
      overflow: hidden;
    }

    .mode-switcher button {
      flex: 1;
      padding: 4px 8px;
      border: none;
      border-right: 1px solid var(--pages-neutral-6, #d4d4d4);
      background: var(--pages-neutral-1, #ffffff);
      color: var(--pages-neutral-9, #737373);
      font-size: 11px;
      cursor: pointer;
      line-height: 1.2;
    }

    .mode-switcher button:last-child {
      border-right: none;
    }

    .mode-switcher button:hover {
      background: var(--pages-neutral-3, #f5f5f5);
    }

    .mode-switcher button[aria-pressed="true"] {
      background: var(--pages-neutral-12, #171717);
      color: var(--pages-neutral-1, #ffffff);
    }

    .expand-header {
      display: flex;
      align-items: center;
      justify-content: center;
      padding: var(--pages-space-3, 12px) var(--pages-space-2, 8px);
    }

    .expand-cell {
      display: flex;
      align-items: center;
      justify-content: center;
      padding: var(--pages-space-3, 12px) var(--pages-space-2, 8px);
    }

    .expand-toggle {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 24px;
      height: 24px;
      border: none;
      background: none;
      cursor: pointer;
      padding: 0;
      border-radius: var(--pages-radius-sm, 4px);
      color: var(--pages-neutral-9, #737373);
    }

    .expand-toggle:hover {
      background: var(--pages-neutral-3, #f5f5f5);
      color: var(--pages-neutral-12, #171717);
    }

    .expand-toggle:focus-visible {
      outline: 2px solid var(--pages-primary-9, #3b82f6);
      outline-offset: -2px;
    }

    .expand-chevron {
      display: inline-block;
      font-size: 10px;
      transition: transform var(--pages-duration-fast, 120ms) var(--pages-ease-out, ease-out);
    }

    .expand-chevron.expanded {
      transform: rotate(90deg);
    }

    .expand-all-toggle {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 24px;
      height: 24px;
      border: none;
      background: none;
      cursor: pointer;
      padding: 0;
      border-radius: var(--pages-radius-sm, 4px);
      color: var(--pages-neutral-9, #737373);
      font-size: 10px;
    }

    .expand-all-toggle:hover {
      background: var(--pages-neutral-3, #f5f5f5);
      color: var(--pages-neutral-12, #171717);
    }

    .row.detail-expanded {
      background: var(--pages-surface-1);
      border-bottom: none;
    }

    .detail-panel {
      display: grid;
      grid-template-rows: 0fr;
      transition: grid-template-rows var(--pages-duration-normal, 200ms) var(--pages-ease-out, ease-out);
    }

    .detail-panel[hidden] {
      display: none !important;
    }

    .detail-panel.expanded {
      grid-template-rows: 1fr;
    }

    .detail-panel > .detail-content {
      overflow: hidden;
      min-height: 0;
      background: var(--pages-surface-2);
      padding-left: 40px;
      opacity: 0;
      transition: opacity var(--pages-duration-fast, 120ms) var(--pages-ease-out, ease-out);
    }

    .detail-panel.expanded > .detail-content {
      opacity: 1;
    }

    @media (prefers-reduced-motion: reduce) {
      .detail-panel,
      .detail-panel > .detail-content,
      .expand-chevron {
        transition: none !important;
      }
    }
  `;

  private _onScroll = (e: Event): void => {
    const target = e.target as HTMLElement;
    this._scrollTop = target.scrollTop;

    if (this.mode === 'scroll' && this.hasMore && !this._loadingMore) {
      const { scrollTop, clientHeight, scrollHeight } = target;
      const bufferHeight = this.bufferSize * this.rowHeight;
      const nearBottom = scrollTop + clientHeight >= scrollHeight - bufferHeight;

      if (nearBottom) {
        this._loadingMore = true;
        const detail: LoadMoreDetail = {};
        this.dispatchEvent(new CustomEvent('load-more', {
          detail,
          bubbles: true,
          composed: true,
        }));
      }
    }
  };

  private _emitPageChange(page: number): void {
    this._clearFilterSelection();
    const detail: PageChangeDetail = {
      page,
      pageSize: this.pageSize,
    };
    this.dispatchEvent(new CustomEvent('page-change', {
      detail,
      bubbles: true,
      composed: true,
    }));

    if (this._pipelineMode) {
      this.dispatchEvent(new CustomEvent('pages-page', {
        detail: { offset: page * this.pageSize, count: this.pageSize },
        bubbles: true,
        composed: true,
      }));
    }
  }

  private _goToFirstPage = (): void => {
    this.currentPage = 0;
    this._focusRowIndex = 0;
    this._emitPageChange(0);
  };

  private _goToPrevPage = (): void => {
    if (this.currentPage > 0) {
      this.currentPage = this.currentPage - 1;
      this._focusRowIndex = 0;
      this._emitPageChange(this.currentPage);
    }
  };

  private _goToNextPage = (): void => {
    if (this.currentPage < this._totalPageCount - 1) {
      this.currentPage = this.currentPage + 1;
      this._focusRowIndex = 0;
      this._emitPageChange(this.currentPage);
    }
  };

  private _goToLastPage = (): void => {
    const lastPage = this._totalPageCount - 1;
    this.currentPage = lastPage;
    this._focusRowIndex = 0;
    this._emitPageChange(lastPage);
  };

  private _resizeObserver?: ResizeObserver;

  override connectedCallback(): void {
    super.connectedCallback();
    if (!this._instanceId) this._instanceId = crypto.randomUUID();
    this._updateContainerHeight();
    if (this._dataRequestPending) {
      this._dataRequestPending = false;
      void this.updateComplete.then(() => this._requestData());
    }
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this._resizeObserver?.disconnect();
  }

  override firstUpdated(): void {
    this._updateContainerHeight();
    const body = this.shadowRoot?.querySelector('.body');
    if (body && typeof ResizeObserver !== 'undefined') {
      this._resizeObserver = new ResizeObserver(() => {
        this._updateContainerHeight();
      });
      this._resizeObserver.observe(body);
    }
  }

  override willUpdate(changed: Map<PropertyKey, unknown>): void {
    if (changed.has('dataSet') && this.mode === 'scroll') {
      this._loadingMore = false;
    }

    if (changed.has('dataSet') && this._selectedColumnId !== undefined && this._selectedValue !== undefined && this.dataSet) {
      const colId = this._selectedColumnId;
      const selVal = this._selectedValue;
      const found = this.dataSet.rows.some(row => {
        try {
          const cell = row.cell(colId);
          return cell.type !== 'NULL' && String(cell.value) === selVal;
        } catch { return false; }
      });
      if (!found) {
        this._selectedColumnId = undefined;
        this._selectedValue = undefined;
      }
    }

    if (changed.has('dataSet') && this._pipelineMode && this.dataSet) {
      this._rebuildConfigFromProps();
      if (this._expandableConfig) {
        this._rebuildTree();
      }
    }

    if (this.selection !== 'none' && !this.getRowKey) {
      throw new Error('getRowKey is required when selection is enabled');
    }

    if (this.getRowDetail && !this.getRowKey) {
      throw new Error('getRowKey is required when getRowDetail is set');
    }

    if (this.getRowDetail && this.mode === 'scroll') {
      throw new Error("getRowDetail is incompatible with mode='scroll' — virtual scrolling requires fixed row heights");
    }

    if (changed.has('expandedDetailKeys') && this.expandedDetailKeys !== undefined) {
      this._internalExpandedDetailKeys = new Set(this.expandedDetailKeys);
    }

    if (changed.has('selectedKeys') && this.selectedKeys !== undefined) {
      this._internalSelectedKeys = new Set(this.selectedKeys);
    }

    if (changed.has('filterText') && this.clientFilter) {
      this.currentPage = 0;
      this._emitFilterChange();
    }

    if (changed.has('filterText') && this._pipelineMode) {
      this._emitPipelineTextFilter();
    }
  }

  private _updateContainerHeight(): void {
    const body = this.shadowRoot?.querySelector('.body');
    if (body) {
      this._containerHeight = body.clientHeight;
    }
  }

  private get _selectedKeys(): Set<string> {
    if (this.selectedKeys !== undefined) {
      return new Set(this.selectedKeys);
    }
    return this._internalSelectedKeys;
  }

  private _isRowSelected(row: TypedRow): boolean {
    if (this.selection === 'none' || !this.getRowKey) return false;
    const key = this.getRowKey(row);
    return this._selectedKeys.has(key);
  }

  private _emitSelectionChange(keys: Set<string>): void {
    const selectedKeys = Array.from(keys);
    const selectedRows = this._dataRows.filter(row => {
      if (!this.getRowKey) return false;
      return keys.has(this.getRowKey(row));
    });

    const detail: SelectionChangeDetail = {
      selectedKeys,
      selectedRows,
      ...(this.mode === 'paginated' && this.totalRows !== undefined ? { scope: 'page' as const } : {}),
    };

    this.dispatchEvent(new CustomEvent('selection-change', {
      detail,
      bubbles: true,
      composed: true,
    }));
  }

  private _emitFilterChange(): void {
    if (this._filterDebounceTimer !== undefined) {
      clearTimeout(this._filterDebounceTimer);
    }

    this._filterDebounceTimer = window.setTimeout(() => {
      const detail: FilterChangeDetail = {
        text: this.filterText,
        matchCount: this._getFilteredRowCount(),
      };

      this.dispatchEvent(new CustomEvent('filter-change', {
        detail,
        bubbles: true,
        composed: true,
      }));
    }, 150);
  }

  private _getFilteredRowCount(): number {
    if (!this.clientFilter || !this.filterText || this.totalRows !== undefined) {
      return this._dataRows.length;
    }

    const text = this.filterText.toLowerCase();
    return this._dataRows.filter(row =>
      this._visibleColumns.some(col => {
        const config = this._configFor(col);
        const isFilterable = config?.filterable ?? (col.type !== ColumnType.NUMBER && col.type !== ColumnType.DATE);
        if (!isFilterable) return false;

        const cell = row.cell(col.id);
        if (cell.type === 'NULL') return false;
        return String(cell.value).toLowerCase().includes(text);
      })
    ).length;
  }

  private _emitRowActivate(row: TypedRow): void {
    const detail: RowActivateDetail = this.getRowKey
      ? { row, key: this.getRowKey(row) }
      : { row };

    this.dispatchEvent(new CustomEvent('row-activate', {
      detail,
      bubbles: true,
      composed: true,
    }));
  }

  private get _expandedDetails(): Set<string> {
    if (this.expandedDetailKeys !== undefined) {
      return new Set(this.expandedDetailKeys);
    }
    return this._internalExpandedDetailKeys;
  }

  private _isDetailExpanded(key: string): boolean {
    return this._expandedDetails.has(key);
  }

  private _emitDetailChange(key: string, row: TypedRow, expanded: boolean): void {
    const detail: DetailChangeDetail = { key, row, expanded };
    this.dispatchEvent(new CustomEvent('detail-change', {
      detail,
      bubbles: true,
      composed: true,
    }));
  }

  private _toggleDetail(row: TypedRow): void {
    if (!this.getRowKey) return;
    const key = this.getRowKey(row);
    const isExpanded = this._isDetailExpanded(key);

    if (isExpanded) {
      const panelId = `${this._instanceId}-detail-${key}`;
      const panel = this.shadowRoot?.getElementById(panelId);
      const btnId = `${this._instanceId}-detail-btn-${key}`;
      const btn = this.shadowRoot?.getElementById(btnId);
      if (panel && btn && panel.contains(this.shadowRoot?.activeElement ?? document.activeElement)) {
        (btn as HTMLElement).focus();
      }
    }

    if (this.expandedDetailKeys === undefined) {
      if (isExpanded) {
        const next = new Set(this._internalExpandedDetailKeys);
        next.delete(key);
        this._internalExpandedDetailKeys = next;
      } else {
        if (this.detailMode === 'single') {
          for (const prevKey of this._internalExpandedDetailKeys) {
            const prevRow = this._visibleRows.find(r => this.getRowKey!(r) === prevKey);
            if (prevRow) this._emitDetailChange(prevKey, prevRow, false);
          }
          this._internalExpandedDetailKeys = new Set([key]);
        } else {
          const next = new Set(this._internalExpandedDetailKeys);
          next.add(key);
          this._internalExpandedDetailKeys = next;
        }
      }
    }

    this._emitDetailChange(key, row, !isExpanded);
  }

  private _handleExpandAll = (): void => {
    if (!this.getRowDetail || !this.getRowKey) return;
    const anyExpanded = this._expandedDetails.size > 0;

    if (anyExpanded) {
      if (this.expandedDetailKeys === undefined) {
        for (const key of this._internalExpandedDetailKeys) {
          const row = this._visibleRows.find(r => this.getRowKey!(r) === key);
          if (row) this._emitDetailChange(key, row, false);
        }
        this._internalExpandedDetailKeys = new Set();
      } else {
        for (const key of this.expandedDetailKeys) {
          const row = this._visibleRows.find(r => this.getRowKey!(r) === key);
          if (row) this._emitDetailChange(key, row, false);
        }
      }
    } else {
      const toExpand = new Set<string>();
      for (const row of this._visibleRows) {
        const detail = this.getRowDetail(row);
        if (detail !== undefined) {
          const key = this.getRowKey(row);
          toExpand.add(key);
          this._emitDetailChange(key, row, true);
        }
      }
      if (this.expandedDetailKeys === undefined) {
        this._internalExpandedDetailKeys = toExpand;
      }
    }
  };

  private _handleDetailTransitionEnd = (e: TransitionEvent, key: string): void => {
    if (e.propertyName !== 'grid-template-rows') return;
    const panel = e.currentTarget as HTMLElement;
    if (!panel.classList.contains('expanded')) {
      panel.hidden = true;
    }
  };

  private _toggleRowSelection(row: TypedRow): void {
    if (!this.getRowKey) return;
    const key = this.getRowKey(row);
    const newSelection = new Set(this._selectedKeys);

    if (newSelection.has(key)) {
      newSelection.delete(key);
    } else {
      newSelection.add(key);
    }

    if (this.selectedKeys === undefined) {
      this._internalSelectedKeys = newSelection;
    }

    this._emitSelectionChange(newSelection);
  }

  private _selectRow(row: TypedRow, exclusive = false): void {
    if (!this.getRowKey) return;
    const key = this.getRowKey(row);
    const newSelection = exclusive ? new Set([key]) : new Set(this._selectedKeys);
    newSelection.add(key);

    if (this.selectedKeys === undefined) {
      this._internalSelectedKeys = newSelection;
    }

    this._lastClickedKey = key;
    this._emitSelectionChange(newSelection);
  }

  private _selectRange(row: TypedRow): void {
    if (!this.getRowKey || !this._lastClickedKey) {
      this._selectRow(row);
      return;
    }

    const currentKey = this.getRowKey(row);
    const allKeys = this._dataRows.map(r => this.getRowKey!(r));
    const lastIndex = allKeys.indexOf(this._lastClickedKey);
    const currentIndex = allKeys.indexOf(currentKey);

    if (lastIndex === -1 || currentIndex === -1) {
      this._selectRow(row);
      return;
    }

    const [start, end] = lastIndex < currentIndex
      ? [lastIndex, currentIndex]
      : [currentIndex, lastIndex];

    const newSelection = new Set(this._selectedKeys);
    for (let i = start; i <= end; i++) {
      const key = allKeys[i];
      if (key) newSelection.add(key);
    }

    if (this.selectedKeys === undefined) {
      this._internalSelectedKeys = newSelection;
    }

    this._emitSelectionChange(newSelection);
  }

  private _handleRowClick = (row: TypedRow, event: MouseEvent): void => {
    event.stopPropagation();

    if (this.selection === 'single') {
      this._selectRow(row, true);
      this._emitRowActivate(row);
    } else if (this.selection === 'multi') {
      this._emitRowActivate(row);
    } else {
      this._emitRowActivate(row);
    }
  };

  private _handleRowDoubleClick = (_row: TypedRow, _event: MouseEvent): void => {
  };

  private _handleCheckboxClick = (row: TypedRow, event: MouseEvent): void => {
    event.stopPropagation();

    if (event.shiftKey && this._lastClickedKey) {
      this._selectRange(row);
    } else {
      this._toggleRowSelection(row);
    }

    if (this.getRowKey) {
      this._lastClickedKey = this.getRowKey(row);
    }
  };

  private _handleSelectAll = (event: MouseEvent): void => {
    event.stopPropagation();

    const sourceRows = this._usePagination ? this._visibleRows : this._dataRows;
    const visibleKeys = sourceRows
      .map(row => this.getRowKey!(row))
      .filter((key): key is string => key !== undefined);

    const allSelected = visibleKeys.every(key => this._selectedKeys.has(key));
    const newSelection = new Set(this._selectedKeys);

    if (allSelected) {
      visibleKeys.forEach(key => newSelection.delete(key));
    } else {
      visibleKeys.forEach(key => newSelection.add(key));
    }

    if (this.selectedKeys === undefined) {
      this._internalSelectedKeys = newSelection;
    }

    this._emitSelectionChange(newSelection);
  };

  private _toggleExpand = (row: TypedRow, event: MouseEvent): void => {
    event.stopPropagation();
    if (!this.getRowKey) return;
    const id = this.getRowKey(row);
    const next = new Set(this._expandedRowIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    this._expandedRowIds = next;
  };

  private _handleHeaderClick = (column: Column, event?: MouseEvent): void => {
    this._clearFilterSelection();
    const config = this._configFor(column);
    if (!config?.sortable) return;

    const colId = String(column.id);
    const existing = this._sortStack.find(e => e.columnId === colId);
    const currentDirection = existing?.direction ?? 'none';

    let newDirection: SortDirection;
    switch (currentDirection) {
      case 'none': newDirection = 'asc'; break;
      case 'asc': newDirection = 'desc'; break;
      case 'desc': newDirection = 'none'; break;
    }

    if (event?.shiftKey && this._sortStack.length > 0) {
      const stack = this._sortStack.filter(e => e.columnId !== colId);
      this._sortStack = newDirection === 'none' ? stack : [...stack, { columnId: colId, direction: newDirection }];
    } else {
      this._sortStack = newDirection === 'none' ? [] : [{ columnId: colId, direction: newDirection }];
    }

    const detail: SortChangeDetail = {
      columnId: colId,
      direction: newDirection,
      sortStack: [...this._sortStack],
    };

    this.dispatchEvent(new CustomEvent('sort-change', {
      detail,
      bubbles: true,
      composed: true,
    }));

    if (this._pipelineMode && newDirection !== 'none') {
      const order = newDirection === 'asc' ? 'ASCENDING' : 'DESCENDING';
      this.dispatchEvent(new CustomEvent('pages-sort', {
        detail: { columnId: column.id, order },
        bubbles: true,
        composed: true,
      }));
    }
  };

  private _setMode = (newMode: DisplayMode): void => {
    this.mode = newMode;
    this.currentPage = 0;
    this._scrollTop = 0;
  };

  private _toggleColumnPicker = (): void => {
    this._columnPickerOpen = !this._columnPickerOpen;
  };

  private _toggleColumnVisibility = (columnId: string): void => {
    const visibleCount = this._visibleColumns.length;

    const isCurrentlyHidden = this._hiddenColumnIds.has(columnId) ||
      this.columnConfig?.find(c => String(c.id) === columnId)?.visible === false;

    if (!isCurrentlyHidden && visibleCount <= 1) {
      return;
    }

    const newHidden = new Set(this._hiddenColumnIds);
    if (isCurrentlyHidden) {
      newHidden.delete(columnId);
    } else {
      newHidden.add(columnId);
    }
    this._hiddenColumnIds = newHidden;

    const visibleColumns = this._dataColumns
      .filter(c => !this._hiddenColumnIds.has(String(c.id)) && this._configFor(c)?.visible !== false)
      .map(c => String(c.id));

    const detail: ColumnChangeDetail = { visibleColumns };

    this.dispatchEvent(new CustomEvent('column-change', {
      detail,
      bubbles: true,
      composed: true,
    }));
  };

  private _handleKeyDown = (event: KeyboardEvent): void => {
    const key = event.key;
    const target = event.target as HTMLElement;

    const isRowTarget = target.classList.contains('row') && !target.classList.contains('header');

    if (key === 'Escape' && this.selection === 'multi') {
      const newSelection = new Set<string>();
      if (this.selectedKeys === undefined) {
        this._internalSelectedKeys = newSelection;
      }
      this._emitSelectionChange(newSelection);
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    if (!isRowTarget) {
      return;
    }

    const rows = this.shadowRoot?.querySelectorAll('.row[role="row"]:not(.header)');
    if (!rows || rows.length === 0) return;

    let currentRowIndex = -1;
    for (let i = 0; i < rows.length; i++) {
      if (rows[i] === target) {
        currentRowIndex = i;
        break;
      }
    }

    if (currentRowIndex === -1) return;

    const totalRows = this._dataRows.length;
    let handled = false;

    switch (key) {
      case 'ArrowDown':
        event.preventDefault();
        if (this._focusRowIndex < totalRows - 1) {
          this._focusRowIndex++;
          if (event.shiftKey && this.selection === 'multi') {
            const row = this._dataRows[this._focusRowIndex];
            if (row) this._toggleRowSelection(row);
          }
          this._scrollToRowIfNeeded(this._focusRowIndex);
          void this._focusRow(this._focusRowIndex);
          handled = true;
        }
        break;

      case 'ArrowUp':
        event.preventDefault();
        if (this._focusRowIndex > 0) {
          this._focusRowIndex--;
          if (event.shiftKey && this.selection === 'multi') {
            const row = this._dataRows[this._focusRowIndex];
            if (row) this._toggleRowSelection(row);
          }
          this._scrollToRowIfNeeded(this._focusRowIndex);
          void this._focusRow(this._focusRowIndex);
          handled = true;
        }
        break;

      case 'ArrowRight': {
        event.preventDefault();
        const colCount = this._visibleColumns.length;
        if (this._focusColIndex < colCount - 1) {
          this._focusColIndex++;
        }
        handled = true;
        break;
      }

      case 'ArrowLeft': {
        event.preventDefault();
        if (this._focusColIndex > 0) {
          this._focusColIndex--;
        }
        handled = true;
        break;
      }

      case 'Home':
        if (event.ctrlKey || event.metaKey) {
          this._focusRowIndex = 0;
          this._focusColIndex = 0;
          this._scrollToRowIfNeeded(this._focusRowIndex);
          void this._focusRow(this._focusRowIndex);
        } else {
          this._focusRowIndex = 0;
          this._scrollToRowIfNeeded(this._focusRowIndex);
          void this._focusRow(this._focusRowIndex);
        }
        handled = true;
        break;

      case 'End':
        if (event.ctrlKey || event.metaKey) {
          this._focusRowIndex = totalRows - 1;
          this._focusColIndex = this._visibleColumns.length - 1;
          this._scrollToRowIfNeeded(this._focusRowIndex);
          void this._focusRow(this._focusRowIndex);
        } else {
          this._focusRowIndex = totalRows - 1;
          this._scrollToRowIfNeeded(this._focusRowIndex);
          void this._focusRow(this._focusRowIndex);
        }
        handled = true;
        break;

      case 'Enter': {
        const row = this._visibleRows[currentRowIndex];
        if (row) {
          this._emitRowActivate(row);
          handled = true;
        }
        break;
      }

      case ' ': {
        if (this.selection === 'multi') {
          const row = this._visibleRows[currentRowIndex];
          if (row) {
            this._toggleRowSelection(row);
            handled = true;
          }
        }
        break;
      }

      case 'a':
        if ((event.ctrlKey || event.metaKey) && this.selection === 'multi') {
          const allKeys = this._visibleRows
            .map(row => this.getRowKey!(row))
            .filter((key): key is string => key !== undefined);
          const newSelection = new Set(allKeys);
          if (this.selectedKeys === undefined) {
            this._internalSelectedKeys = newSelection;
          }
          this._emitSelectionChange(newSelection);
          handled = true;
        }
        break;
    }

    if (handled) {
      event.preventDefault();
      event.stopPropagation();
    }
  };

  private _scrollToRowIfNeeded(rowIndex: number): void {
    if (!this._useVirtualScroll) return;
    const body = this.shadowRoot?.querySelector('.body') as HTMLElement | null;
    if (!body) return;

    const rowTop = rowIndex * this.rowHeight;
    const rowBottom = rowTop + this.rowHeight;
    const viewTop = body.scrollTop;
    const viewBottom = viewTop + body.clientHeight;

    if (rowTop < viewTop) {
      body.scrollTop = rowTop;
    } else if (rowBottom > viewBottom) {
      body.scrollTop = rowBottom - body.clientHeight;
    }
  }

  private async _focusRow(index: number): Promise<void> {
    await this.updateComplete;
    const rows = this.shadowRoot?.querySelectorAll('.row[role="row"]:not(.header)');
    if (!rows || rows.length === 0) return;

    if (this._useVirtualScroll && this._scrollWindow) {
      const displayIndex = index - this._scrollWindow.startIndex;
      if (displayIndex >= 0 && displayIndex < rows.length && rows[displayIndex]) {
        (rows[displayIndex] as HTMLElement).focus();
      }
    } else {
      if (rows[index]) {
        (rows[index] as HTMLElement).focus();
      }
    }
  }

  private get _visibleColumns(): readonly Column[] {
    return this._dataColumns.filter(c => {
      if (this._hiddenColumnIds.has(String(c.id))) return false;
      if (this._pipelineMode && this._propsColumns && this._propsColumns.length > 0) {
        if (!this._propsColumns.some(pc => String(pc.id) === String(c.id))) return false;
      }
      const config = this._configFor(c);
      return config?.visible !== false;
    });
  }

  private get _gridTemplateColumns(): string {
    if (this._visibleColumns.length === 0) return '1fr';
    const columns = this._visibleColumns.map(c => {
      const config = this._configFor(c);
      return config?.width ?? '1fr';
    }).join(' ');
    const prefix = [
      this.getRowDetail ? '40px' : '',
      this.selection === 'multi' ? '40px' : '',
    ].filter(Boolean).join(' ');
    return prefix ? `${prefix} ${columns}` : columns;
  }

  private get _useVirtualScroll(): boolean {
    if (this.getRowDetail) return false;
    if (this.mode === 'scroll') return true;
    return this.mode === 'auto' && this._dataRows.length > AUTO_THRESHOLD;
  }

  private get _usePagination(): boolean {
    return this.mode === 'paginated';
  }

  private get _totalPageCount(): number {
    if (!this._usePagination) return 1;
    if (this._expandableConfig && this._treeRoots.length > 0) {
      return Math.ceil(this._treeRoots.length / this.pageSize);
    }
    const total = this.totalRows ?? this._dataRows.length;
    return Math.ceil(total / this.pageSize);
  }

  private get _visibleRows(): readonly TypedRow[] {
    let rows: readonly TypedRow[] = this._dataRows;

    if (this.clientFilter && this.filterText && this.totalRows === undefined) {
      const text = this.filterText.toLowerCase();
      rows = [...rows].filter(row =>
        this._visibleColumns.some(col => {
          const config = this._configFor(col);
          const isFilterable = config?.filterable ?? (col.type !== ColumnType.NUMBER && col.type !== ColumnType.DATE);
          if (!isFilterable) return false;

          const cell = row.cell(col.id);
          if (cell.type === 'NULL') return false;
          return String(cell.value).toLowerCase().includes(text);
        })
      );
    }

    if (this.clientSort && this._sortStack.length > 0) {
      const comparator = createMultiComparator(this._sortStack, this.columnConfig ?? []);
      rows = [...rows].sort(comparator);
    }

    this._treeMetadata.clear();
    if (this._expandableConfig && this._treeRoots.length > 0) {
      if (this._usePagination) {
        const { pageNodes } = paginateTreeByRoots(this._treeRoots, this._treeExpandState, this.currentPage, this.pageSize);
        return pageNodes.map(n => n.row);
      }
      const visibleNodes = collectVisibleNodes(this._treeRoots, this._treeExpandState);
      rows = visibleNodes.map(n => n.row);
    } else if (this.getChildren && this.getRowKey) {
      const treeRows = flattenTree(rows, this.getChildren, this._expandedRowIds, this.getRowKey);
      rows = treeRows.map(tr => {
        this._treeMetadata.set(tr.row, tr);
        return tr.row;
      });
    }

    if (this._usePagination) {
      if (this.totalRows !== undefined) {
        return rows;
      }
      const start = this.currentPage * this.pageSize;
      const end = start + this.pageSize;
      return rows.slice(start, end);
    }

    if (!this._useVirtualScroll) {
      return rows;
    }

    const containerH = this._containerHeight > 0 ? this._containerHeight : 500;
    const window = computeScrollWindow(
      this._scrollTop,
      containerH,
      this.rowHeight,
      rows.length,
      this.bufferSize,
    );

    return rows.slice(window.startIndex, window.endIndex);
  }

  private get _scrollWindow() {
    if (!this._useVirtualScroll) {
      return null;
    }

    const containerH = this._containerHeight > 0 ? this._containerHeight : 500;
    return computeScrollWindow(
      this._scrollTop,
      containerH,
      this.rowHeight,
      this._dataRows.length,
      this.bufferSize,
    );
  }

  private _formatCell(cell: CellValue): string {
    if (cell.type === 'NULL') return '';

    switch (cell.type) {
      case ColumnType.DATE:
        return cell.value.toLocaleDateString();
      case ColumnType.NUMBER:
        return cell.value.toLocaleString();
      case ColumnType.TEXT:
      case ColumnType.LABEL:
      default:
        return String(cell.value);
    }
  }

  private _ariaSortValue(col: Column): string | typeof nothing {
    const config = this._configFor(col);
    if (!config?.sortable) return nothing;
    const entry = this._sortStack.find(e => e.columnId === String(col.id));
    if (!entry) return 'none';
    if (entry.direction === 'asc') return 'ascending';
    if (entry.direction === 'desc') return 'descending';
    return 'none';
  }

  private _renderSortIndicator(column: Column) {
    const config = this._configFor(column);
    if (!config?.sortable) return nothing;
    const colId = String(column.id);
    const index = this._sortStack.findIndex(e => e.columnId === colId);
    const entry = index >= 0 ? this._sortStack[index] : null;
    const dir = entry?.direction ?? 'none';
    const arrow = dir === 'asc' ? '▲' : dir === 'desc' ? '▼' : '▲';
    const priority = this._sortStack.length > 1 && index >= 0 ? html`<span class="sort-priority">${index + 1}</span>` : nothing;
    return html`<span class="sort-indicator ${entry && dir !== 'none' ? 'active' : ''}">${arrow}${priority}</span>`;
  }

  private _renderHeaderCell(column: Column) {
    const config = this._configFor(column);
    const isSortable = config?.sortable === true;
    const label = config?.label ?? column.name;

    return html`
      <div
        class="header-cell ${isSortable ? 'sortable-header' : ''}"
        role="columnheader"
        aria-sort="${this._ariaSortValue(column)}"
        @click="${isSortable ? (e: MouseEvent) => this._handleHeaderClick(column, e) : nothing}"
      >
        ${label}${this._renderSortIndicator(column)}
      </div>
    `;
  }

  private _renderToolbar() {
    const visibleCount = this._visibleColumns.length;

    const modes: Array<{ value: DisplayMode; label: string }> = [
      { value: 'auto', label: 'Auto' },
      { value: 'paginated', label: 'Pages' },
      { value: 'scroll', label: 'Scroll' },
    ];

    const showFilter = (this.clientFilter && this.totalRows === undefined) || this._pipelineMode;

    return html`
      <div class="toolbar">
        ${this._csvExportEnabled && this.dataSet ? html`
          <button class="pagination-button" aria-label="Download CSV" @click="${() => downloadCsv(tableToCsv(this.dataSet!, this.columnConfig))}">⬇</button>
          <button class="pagination-button" aria-label="Copy CSV" @click="${this._handleCopyToClipboard}">📋</button>
        ` : nothing}
        ${showFilter ? html`
          <input
            type="text"
            class="filter-input"
            placeholder="Filter..."
            .value="${this.filterText}"
            @input="${(e: Event) => {
              this.filterText = (e.target as HTMLInputElement).value;
            }}"
          />
        ` : nothing}
        <div class="column-picker-wrapper">
          <button
            class="column-picker-trigger"
            @click="${this._toggleColumnPicker}"
            aria-label="Table options"
          >
            ⋮
          </button>
          ${this._columnPickerOpen ? html`
            <div class="column-picker-dropdown">
              <div class="picker-section-label">Columns</div>
              ${this._dataColumns.map(col => {
                const config = this._configFor(col);
                const colId = String(col.id);
                const isVisible = !this._hiddenColumnIds.has(colId) && config?.visible !== false;
                const isLastVisible = isVisible && visibleCount === 1;

                return html`
                  <label class="column-picker-item">
                    <input
                      type="checkbox"
                      .checked="${isVisible}"
                      ?disabled="${isLastVisible}"
                      @change="${() => this._toggleColumnVisibility(colId)}"
                    />
                    <span>${config?.label ?? col.name}</span>
                  </label>
                `;
              })}
              <div class="picker-divider"></div>
              <div class="picker-section-label">Display</div>
              <div class="mode-switcher" role="radiogroup" aria-label="Display mode">
                ${modes.map(m => html`
                  <button
                    role="radio"
                    aria-pressed=${this.mode === m.value ? 'true' : 'false'}
                    @click=${() => this._setMode(m.value)}
                  >${m.label}</button>
                `)}
              </div>
            </div>
          ` : nothing}
        </div>
      </div>
    `;
  }

  private _clearFilterSelection(): void {
    if (this._selectedColumnId === undefined) return;
    const group = this._filterConfig.group;
    const columnId = String(this._selectedColumnId);
    this._selectedColumnId = undefined;
    this._selectedValue = undefined;
    this.dispatchEvent(new CustomEvent('pages-filter', {
      bubbles: true, composed: true,
      detail: { columnId, reset: true, group },
    }));
    if (this._pipelineMode) this._requestData();
  }

  private _renderColumnPicker() {
    return this._renderToolbar();
  }

  private _handleCellFilterClick(row: TypedRow, columnId: ColumnId): void {
    const cellVal = row.cell(columnId);
    if (cellVal.type === 'NULL') return;
    const value = String(cellVal.value);
    const group = this._filterConfig.group;

    if (columnId === this._selectedColumnId && value === this._selectedValue) {
      this._selectedColumnId = undefined;
      this._selectedValue = undefined;
      this.dispatchEvent(new CustomEvent('pages-filter', {
        bubbles: true, composed: true,
        detail: { columnId: String(columnId), reset: true, group },
      }));
      if (this._pipelineMode) this._requestData();
    } else if (this._selectedColumnId !== undefined && this._selectedColumnId !== columnId) {
      const oldColumnId = this._selectedColumnId;
      this._selectedColumnId = columnId;
      this._selectedValue = value;
      this.dispatchEvent(new CustomEvent('pages-filter', {
        bubbles: true, composed: true,
        detail: { columnId: String(oldColumnId), reset: true, group },
      }));
      this.dispatchEvent(new CustomEvent('pages-filter', {
        bubbles: true, composed: true,
        detail: { columnId: String(columnId), value, row, reset: false, group },
      }));
    } else {
      this._selectedColumnId = columnId;
      this._selectedValue = value;
      this.dispatchEvent(new CustomEvent('pages-filter', {
        bubbles: true, composed: true,
        detail: { columnId: String(columnId), value, row, reset: false, group },
      }));
    }
    this.requestUpdate();
  }

  private _renderCell(row: TypedRow, column: Column, isFirstColumn = false, treeNode?: TreeNode) {
    const cell = row.cell(column.id);
    const renderer = this.columnRenderers?.get(column.id);
    const content = renderer
      ? renderer(cell, row, column)
      : this._formatCell(cell);

    const config = this._configFor(column);
    const align = config?.align ?? 'start';
    const treeMeta = treeNode ?? this._treeMetadata.get(row);
    const filterClickHandler = this._filterConfig.enabled
      ? (e: MouseEvent) => { e.stopPropagation(); this._handleCellFilterClick(row, column.id); }
      : undefined;

    if (isFirstColumn && treeMeta) {
      const depth = 'depth' in treeMeta ? treeMeta.depth : 0;
      const hasChildren = 'children' in treeMeta ? treeMeta.children.length > 0 : treeMeta.hasChildren;
      const isExpanded = treeNode
        ? this._treeExpandState.get(treeNode.id) === true
        : (treeMeta as TreeRow).expanded;
      const indent = depth * 20;
      const toggleHandler = treeNode
        ? (e: MouseEvent) => { e.stopPropagation(); this._toggleTreeExpand(treeNode.id); }
        : (e: MouseEvent) => this._toggleExpand(row, e);
      const toggle = hasChildren
        ? html`<button class="tree-toggle" @click="${toggleHandler}" aria-label="${isExpanded ? 'Collapse' : 'Expand'}">${isExpanded ? '▼' : '▶'}</button>`
        : html`<span class="tree-spacer"></span>`;

      return html`
        <div class="cell tree-cell" role="gridcell" style="text-align: ${align}; padding-left: calc(var(--pages-space-2, 8px) + ${indent}px)"
          @click="${filterClickHandler ?? nothing}">
          ${toggle}${content}
        </div>
      `;
    }

    return html`
      <div
        class="cell"
        role="gridcell"
        style="text-align: ${align}"
        @click="${filterClickHandler ?? nothing}"
      >
        ${content}
      </div>
    `;
  }

  private _renderCheckbox(row: TypedRow, isHeader = false) {
    if (this.selection !== 'multi') return nothing;

    if (isHeader) {
      const sourceRows = this._usePagination ? this._visibleRows : this._dataRows;
      const visibleKeys = sourceRows
        .map(r => this.getRowKey!(r))
        .filter((key): key is string => key !== undefined);
      const selectedCount = visibleKeys.filter(key => this._selectedKeys.has(key)).length;
      const checked = selectedCount === visibleKeys.length && visibleKeys.length > 0 ? 'true' :
                      selectedCount > 0 ? 'mixed' : 'false';

      return html`
        <div class="checkbox-cell">
          <div
            class="checkbox"
            role="checkbox"
            aria-checked="${checked}"
            aria-label="Select all"
            @click="${this._handleSelectAll}"
          ></div>
        </div>
      `;
    }

    const isSelected = this._isRowSelected(row);
    return html`
      <div class="checkbox-cell">
        <div
          class="checkbox"
          role="checkbox"
          aria-checked="${isSelected ? 'true' : 'false'}"
          aria-label="Select row"
          @click="${(e: MouseEvent) => this._handleCheckboxClick(row, e)}"
        ></div>
      </div>
    `;
  }

  private _evaluateRowStyle(row: TypedRow): { className?: string; style?: Record<string, string> } | null {
    if (this._rowStyleRules.length === 0) return null;

    const rowCells: Record<string, unknown> = {};
    for (const col of this._dataColumns) {
      rowCells[String(col.id)] = cellToRaw(row.cell(col.id));
    }
    const rowContext = createRowContext(EMPTY_CONTEXT, rowCells);

    for (const rule of this._rowStyleRules) {
      try {
        if (evaluateExpression(rule.condition, rowContext)) {
          const result: { className?: string; style?: Record<string, string> } = {};
          if (rule.className) result.className = rule.className;
          if (rule.style) result.style = rule.style;
          return result;
        }
      } catch {
        continue;
      }
    }
    return null;
  }

  private _isFilterSelected(row: TypedRow): boolean {
    if (!this._selectedColumnId || !this._selectedValue) return false;
    try {
      const cell = row.cell(this._selectedColumnId);
      return cell.type !== 'NULL' && String(cell.value) === this._selectedValue;
    } catch { return false; }
  }

  private _renderExpandHeader() {
    if (!this.getRowDetail) return nothing;
    if (this.detailMode === 'multi') {
      const anyExpanded = this._expandedDetails.size > 0;
      return html`
        <div class="expand-header">
          <button
            class="expand-all-toggle"
            aria-label="${anyExpanded ? 'Collapse all details' : 'Expand all details'}"
            @click="${this._handleExpandAll}"
          >
            ${anyExpanded ? '▼' : '▶'}
          </button>
        </div>
      `;
    }
    return html`<div class="expand-header"></div>`;
  }

  private _renderExpandCell(row: TypedRow) {
    if (!this.getRowDetail) return nothing;
    const detail = this.getRowDetail(row);
    if (detail === undefined) {
      return html`<div class="expand-cell"></div>`;
    }
    const key = this.getRowKey!(row);
    const isExpanded = this._isDetailExpanded(key);
    const panelId = `${this._instanceId}-detail-${key}`;
    const btnId = `${this._instanceId}-detail-btn-${key}`;
    return html`
      <div class="expand-cell">
        <button
          id="${btnId}"
          class="expand-toggle"
          aria-expanded="${isExpanded ? 'true' : 'false'}"
          aria-controls="${panelId}"
          aria-label="${isExpanded ? 'Hide details' : 'Show details'} for row ${key}"
          @click="${(e: MouseEvent) => { e.stopPropagation(); this._toggleDetail(row); }}"
        >
          <span class="expand-chevron ${isExpanded ? 'expanded' : ''}">▶</span>
        </button>
      </div>
    `;
  }

  private _renderDetailPanel(row: TypedRow) {
    if (!this.getRowDetail) return nothing;
    const detail = this.getRowDetail(row);
    if (detail === undefined) return nothing;
    const key = this.getRowKey!(row);
    const isExpanded = this._isDetailExpanded(key);
    const panelId = `${this._instanceId}-detail-${key}`;
    const btnId = `${this._instanceId}-detail-btn-${key}`;
    return html`
      <div
        id="${panelId}"
        class="detail-panel ${isExpanded ? 'expanded' : ''}"
        role="region"
        aria-labelledby="${btnId}"
        ?hidden="${!isExpanded}"
        @transitionend="${(e: TransitionEvent) => this._handleDetailTransitionEnd(e, key)}"
      >
        <div class="detail-content">
          ${isExpanded ? detail : nothing}
        </div>
      </div>
    `;
  }

  private _renderRow(row: TypedRow, actualIndex: number, displayIndex: number) {
    const rowClass = this.getRowClass?.(row) ?? '';
    const part = rowClass ? `row ${rowClass}` : 'row';
    const ariaRowIndex = actualIndex + 2;
    const isSelected = this._isRowSelected(row);
    const tabindex = actualIndex === this._focusRowIndex ? '0' : '-1';
    const isClickable = this._filterConfig.enabled;
    const isFilterSelected = this._isFilterSelected(row);
    const treeNode = this._treeNodeByRow.get(row);
    const rowStyleResult = this._evaluateRowStyle(row);
    const rowStyleClass = isFilterSelected ? '' : (rowStyleResult?.className ?? '');
    const effectiveStyle = isFilterSelected
      ? { ...rowStyleResult?.style, backgroundColor: 'var(--pages-accent-5, #d3e3fd)' }
      : rowStyleResult?.style;
    const rowInlineStyle = effectiveStyle
      ? Object.entries(effectiveStyle).map(([k, v]) => `${k.replace(/[A-Z]/g, m => `-${m.toLowerCase()}`)}: ${String(v)}`).join('; ')
      : '';

    const stripe = actualIndex % 2 === 0 ? 'row-even' : 'row-odd';

    const isDetailExpanded = this.getRowDetail && this.getRowKey
      ? this._isDetailExpanded(this.getRowKey(row))
      : false;

    return html`
      <div
        class="row ${stripe} ${isClickable ? 'clickable' : ''} ${isFilterSelected ? 'selected' : ''} ${rowStyleClass} ${isDetailExpanded ? 'detail-expanded' : ''}"
        style="grid-template-columns: ${this._gridTemplateColumns}; ${rowInlineStyle}"
        role="row"
        part="${part}"
        aria-rowindex="${ariaRowIndex}"
        aria-selected="${this.selection !== 'none' && isSelected ? 'true' : 'false'}"
        aria-level="${treeNode ? String(treeNode.depth + 1) : nothing}"
        aria-setsize="${treeNode ? String(treeNode.siblingCount) : nothing}"
        aria-posinset="${treeNode ? String(treeNode.siblingIndex) : nothing}"
        aria-expanded="${treeNode && treeNode.children.length > 0 ? String(this._treeExpandState.get(treeNode.id) === true) : nothing}"
        tabindex="${tabindex}"
        @click="${(e: MouseEvent) => this._handleRowClick(row, e)}"
        @dblclick="${(e: MouseEvent) => this._handleRowDoubleClick(row, e)}"
      >
        ${this._renderExpandCell(row)}
        ${this._renderCheckbox(row)}
        ${this._visibleColumns.map((col, i) => this._renderCell(row, col, i === 0, treeNode))}
      </div>
      ${this._renderDetailPanel(row)}
    `;
  }

  private _renderPaginationFooter() {
    if (!this._usePagination || this.mode === 'scroll') return nothing;

    const currentPageNum = this.currentPage + 1;
    const totalPages = this._totalPageCount;
    const isFirstPage = this.currentPage === 0;
    const isLastPage = this.currentPage === totalPages - 1;

    const total = this.totalRows ?? this._dataRows.length;
    const start = this.currentPage * this.pageSize + 1;
    const end = Math.min((this.currentPage + 1) * this.pageSize, total);

    return html`
      <div class="pagination" role="navigation" aria-label="Table pagination">
        <div class="pagination-info">
          <span>Page ${currentPageNum} of ${totalPages}</span>
          <span>Showing ${start}-${end} of ${total}</span>
        </div>
        <div class="pagination-controls">
          <button
            class="pagination-button"
            aria-label="First page"
            ?disabled="${isFirstPage}"
            @click="${this._goToFirstPage}"
          >
            First
          </button>
          <button
            class="pagination-button"
            aria-label="Previous page"
            ?disabled="${isFirstPage}"
            @click="${this._goToPrevPage}"
          >
            Prev
          </button>
          <button
            class="pagination-button"
            aria-label="Next page"
            ?disabled="${isLastPage}"
            @click="${this._goToNextPage}"
          >
            Next
          </button>
          <button
            class="pagination-button"
            aria-label="Last page"
            ?disabled="${isLastPage}"
            @click="${this._goToLastPage}"
          >
            Last
          </button>
        </div>
      </div>
    `;
  }

  override render() {
    const visibleCols = this._visibleColumns;
    const rowCount = this._dataRows.length + 1;
    const ariaColCount = visibleCols.length;

    if (this.loading) {
      return html`
        <div class="data-table" role="grid" aria-busy="true">
          <div class="loading-state">Loading...</div>
        </div>
      `;
    }

    if (this.error) {
      return html`
        <div class="data-table" role="grid">
          <div class="empty-state" style="color: var(--pages-danger-9, #d32f2f)">${this.error}</div>
        </div>
      `;
    }

    if (this._dataRows.length === 0) {
      return html`
        <div class="data-table" role="grid" aria-rowcount="${rowCount}" aria-colcount="${ariaColCount}">
          <div class="header-container">
            <div
              class="header"
              role="row"
              part="header-row"
              style="grid-template-columns: ${this._gridTemplateColumns}"
            >
              ${this._renderExpandHeader()}
              ${this.selection === 'multi' ? html`<div class="header-cell"></div>` : nothing}
              ${visibleCols.map(col => this._renderHeaderCell(col))}
            </div>
            ${this._renderColumnPicker()}
          </div>
          <div class="empty-state">${this.emptyMessage}</div>
        </div>
      `;
    }

    const window = this._scrollWindow;

    return html`
      <div class="data-table" role="grid" aria-rowcount="${rowCount}" aria-colcount="${ariaColCount}" aria-label="Data table" @keydown="${this._handleKeyDown}">
        <div class="header-container">
          <div
            class="header"
            role="row"
            part="header-row"
            style="grid-template-columns: ${this._gridTemplateColumns}"
          >
            ${this._renderExpandHeader()}
            ${this._renderCheckbox(this._dataRows[0]!, true)}
            ${visibleCols.map(col => this._renderHeaderCell(col))}
          </div>
          ${this._renderColumnPicker()}
        </div>
        <div class="body" @scroll="${this._onScroll}">
          ${this._useVirtualScroll && window
            ? html`
                <div class="body-content" style="height: ${window.totalHeight}px">
                  <div style="transform: translateY(${window.offsetY}px)">
                    ${this._visibleRows.map((row, idx) => {
                      const actualIndex = window.startIndex + idx;
                      return this._renderRow(row, actualIndex, idx);
                    })}
                  </div>
                </div>
              `
            : html`
                <div class="body-content">
                  ${this._visibleRows.map((row, idx) => {
                    const actualIndex = this._usePagination && this.totalRows === undefined
                      ? this.currentPage * this.pageSize + idx
                      : idx;
                    return this._renderRow(row, actualIndex, idx);
                  })}
                </div>
              `}
        </div>
        ${this._renderPaginationFooter()}
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'pages-table': PagesTable;
  }
}
