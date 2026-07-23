import { html, nothing, unsafeCSS, type TemplateResult } from "lit";
import { customElement, state } from "lit/decorators.js";
import { repeat } from "lit/directives/repeat.js";
import { ifDefined } from "lit/directives/if-defined.js";
import type { TypedDataSet, TypedRow, ColumnId, SortColumn, GroupingKey } from "@casehubio/pages-data";
import type {
  GroupedViewProps,
  TableColumnConfig,
  ColumnRenderer,
  RowStyleRule,
  SelectionMode,
  AggregationBinding,
  GroupNode,
} from "@casehubio/pages-component";
import { PagesElement } from "../../base/PagesElement.js";
import { resolvePreset } from "./presets.js";
import { extractGroupBoundaries, extractGroupTree } from "./group-extraction.js";
import type { GroupBoundary } from "./group-extraction.js";
import { computeColumnWidths } from "./column-widths.js";
import { GROUPED_VIEW_CSS } from "./group-view-styles.js";

interface PagesTableHost extends HTMLElement {
  dataSet?: TypedDataSet | undefined;
  columnConfig?: readonly TableColumnConfig[] | undefined;
  columnRenderers?: ReadonlyMap<ColumnId, ColumnRenderer> | undefined;
  rowStyle?: readonly RowStyleRule[] | undefined;
  selection?: SelectionMode | undefined;
  getRowKey?: ((row: TypedRow) => string) | undefined;
  getRowDetail?: ((row: TypedRow) => unknown) | undefined;
  getRowClass?: ((row: TypedRow) => string) | undefined;
  mode?: string | undefined;
  loading?: boolean | undefined;
  error?: string | undefined;
  sortable?: boolean | undefined;
  clientSort?: boolean | undefined;
  embedded?: boolean | undefined;
  headerVisible?: boolean | undefined;
  activeSort?: SortColumn | undefined;
  hiddenColumns?: string[] | undefined;
  selectedKeys?: string[] | undefined;
  getRowAccent?: ((row: TypedRow) => string | undefined) | undefined;
}

@customElement("pages-grouped-view")
export class PagesGroupedView extends PagesElement<GroupedViewProps> {
  static override styles = unsafeCSS(GROUPED_VIEW_CSS);

  // ── Reactive state ────────────────────────────────────────────────

  @state() private _expandState = new Map<string, boolean>();
  @state() private _selectedKeys = new Set<string>();
  @state() private _hiddenColumnIds = new Set<string>();
  @state() private _pickerOpen = false;

  @state() private _columnRenderers: ReadonlyMap<ColumnId, ColumnRenderer> | undefined = undefined;
  @state() private _getRowKey: ((row: TypedRow) => string) | undefined = undefined;
  @state() private _getRowDetail: ((row: TypedRow) => unknown) | undefined = undefined;
  @state() private _getRowClass: ((row: TypedRow) => string) | undefined = undefined;

  // ── Non-reactive private fields ───────────────────────────────────

  private _instanceId = "";
  private _getRowAccent: ((row: TypedRow) => string | undefined) | undefined = undefined;

  // ── Public setters ────────────────────────────────────────────────

  setColumnRenderers(value: ReadonlyMap<ColumnId, ColumnRenderer> | undefined): void {
    this._columnRenderers = value;
  }

  setGetRowKey(value: ((row: TypedRow) => string) | undefined): void {
    this._getRowKey = value;
  }

  setGetRowDetail(value: ((row: TypedRow) => unknown) | undefined): void {
    this._getRowDetail = value;
  }

  setGetRowClass(value: ((row: TypedRow) => string) | undefined): void {
    this._getRowClass = value;
  }

  // ── Lifecycle ─────────────────────────────────────────────────────

  override connectedCallback(): void {
    this._instanceId = typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
    super.connectedCallback();
  }

  // ── Main render ───────────────────────────────────────────────────

  protected override renderContent(
    props: GroupedViewProps,
    dataset: TypedDataSet,
  ): TemplateResult {
    // Lazy-init rowAccent function from props (one-time derivation)
    if (props.rowAccent && !this._getRowAccent) {
      const ra = props.rowAccent as { column: string; colorMap: Record<string, string>; default?: string };
      const accentColId = ra.column as ColumnId;
      const colorLookup = new Map<string, string>(Object.entries(ra.colorMap));
      const defaultColor: string | undefined = ra.default;
      this._getRowAccent = (row: TypedRow): string | undefined => {
        const cell = row.cell(accentColId);
        if (cell.type === "NULL") return defaultColor;
        return colorLookup.get(String(cell.value)) ?? defaultColor;
      };
    }

    const mode = resolvePreset(props);
    const groupByKeys: readonly GroupingKey[] = Array.isArray(props.groupBy)
      ? props.groupBy as readonly GroupingKey[]
      : [props.groupBy as GroupingKey];
    const isMultiLevel = groupByKeys.length > 1;
    const primaryKey = groupByKeys[0]!;
    const keyColumnId = primaryKey.columnId;
    const aggColumnIds = (props.aggregations ?? []).map((a) => a.column);
    const aggBindings = (props.aggregations ?? []) as readonly AggregationBinding[];
    const allGroupColumnIds = groupByKeys.map((k) => k.columnId);
    const contentColumnIds = dataset.columns
      .filter((c) => !allGroupColumnIds.includes(c.id))
      .map((c) => c.id);
    const isListMode = mode.contentDisplay === "list";
    const isSpreadsheet = mode.groupDisplay === "table-row";
    const showSummary = props.showGroupSummary ?? false;
    const defaultExpanded = props.defaultExpanded ?? true;

    if (isMultiLevel && !isListMode) {
      const tree = extractGroupTree(
        dataset,
        groupByKeys,
        aggBindings.map((a) => ({ column: a.column, fn: a.fn as { fn: string } })),
      );
      const columnConfig = this._buildColumnConfig(dataset, contentColumnIds, props);
      return html`
        <div class="pages-grouped-view sectioned">
          ${this._renderHeaderBar(dataset, contentColumnIds, props, columnConfig)}
          ${tree.map((node) =>
            this._renderTreeNode(node, columnConfig, props, dataset, contentColumnIds, "", showSummary, defaultExpanded)
          )}
        </div>
      `;
    }

    const boundaries = extractGroupBoundaries(dataset, keyColumnId, aggColumnIds);
    const columnConfig = isListMode ? undefined : this._buildColumnConfig(dataset, contentColumnIds, props);
    const wrapperClass = isSpreadsheet ? "spreadsheet" : isListMode ? "list-mode" : "sectioned";

    return html`
      <div class="pages-grouped-view ${wrapperClass}">
        ${isListMode
          ? this._renderListHeader(dataset, contentColumnIds)
          : this._renderHeaderBar(dataset, contentColumnIds, props, columnConfig!)}
        ${repeat(boundaries, (b) => b.name, (b, gi) =>
          this._renderBoundarySection(
            b, gi, props, dataset, contentColumnIds, columnConfig,
            isSpreadsheet, isListMode, showSummary, defaultExpanded,
          )
        )}
      </div>
    `;
  }

  // ── Template helpers ──────────────────────────────────────────────

  private _renderHeaderBar(
    dataset: TypedDataSet,
    contentColumnIds: readonly ColumnId[],
    props: GroupedViewProps,
    columnConfig: readonly TableColumnConfig[],
  ): TemplateResult {
    const visibleColumnIds = contentColumnIds.filter(
      (id) => !this._hiddenColumnIds.has(String(id)),
    );
    const contentWidths = columnConfig
      .filter((c) => c.visible !== false && !this._hiddenColumnIds.has(String(c.id)))
      .map((c) => c.width ?? "1fr");

    const prefix: string[] = [];
    if (this._getRowDetail) prefix.push("40px");
    if (props.selection === "multi") prefix.push("40px");

    const gridCols = [...prefix, ...contentWidths, "auto"].join(" ");
    const sortable = props.sortable === true;

    return html`
      <div class="column-header-bar" style="grid-template-columns: ${gridCols}">
        ${this._getRowDetail ? html`<div></div>` : nothing}
        ${props.selection === "multi" ? html`
          <div class="select-all-wrapper">
            <input type="checkbox" class="select-all-checkbox"
              aria-label="Select all rows"
              .checked=${this._selectAllChecked(dataset)}
              .indeterminate=${this._selectAllIndeterminate(dataset)}
              @click=${() => this._handleSelectAll(dataset)}
            >
          </div>
        ` : nothing}
        ${visibleColumnIds.map((id) => {
          const col = dataset.columns.find((c) => c.id === id);
          const colConfig = props.columnConfig?.find((c) => c.id === id);
          const colSortable = sortable && colConfig?.sortable !== false;
          const label = colConfig?.label ?? col?.name ?? String(id);
          if (colSortable) {
            return html`
              <button class="${this._sortClass(id)}"
                data-column="${String(id)}"
                aria-sort="${ifDefined(this._ariaSort(id))}"
                @click=${() => this._handleHeaderSort(id)}
              >${label}</button>
            `;
          }
          return html`
            <span class="col-label" data-column="${String(id)}">${label}</span>
          `;
        })}
        ${this._renderColumnPicker(dataset, contentColumnIds)}
      </div>
    `;
  }

  private _renderListHeader(
    dataset: TypedDataSet,
    contentColumnIds: readonly ColumnId[],
  ): TemplateResult {
    const colWidths = computeColumnWidths(dataset, contentColumnIds, "14px sans-serif");
    const colWidthsCss = colWidths.map((w) => `${w}px`).join(" ");
    return html`
      <div class="column-header-bar" style="grid-template-columns: ${colWidthsCss}">
        ${contentColumnIds.map((id) => {
          const col = dataset.columns.find((c) => c.id === id);
          return html`<span class="col-label">${col?.name ?? String(id)}</span>`;
        })}
      </div>
    `;
  }

  private _renderColumnPicker(
    dataset: TypedDataSet,
    contentColumnIds: readonly ColumnId[],
  ): TemplateResult {
    const visibleCount = contentColumnIds.filter(
      (id) => !this._hiddenColumnIds.has(String(id)),
    ).length;

    return html`
      <div class="column-picker-wrapper">
        <button class="column-picker-trigger"
          aria-label="Column options"
          @click=${this._togglePicker}
        >${"⋮"}</button>
        ${this._pickerOpen ? html`
          <div class="column-picker-dropdown">
            <div class="picker-section-label">Columns</div>
            ${contentColumnIds.map((id) => {
              const col = dataset.columns.find((c) => c.id === id);
              const isHidden = this._hiddenColumnIds.has(String(id));
              const isLastVisible = !isHidden && visibleCount === 1;
              return html`
                <label class="column-picker-item">
                  <input type="checkbox"
                    .checked=${!isHidden}
                    .disabled=${isLastVisible}
                    @change=${() => this._toggleColumnVisibility(String(id), contentColumnIds)}
                  >
                  <span>${col?.name ?? String(id)}</span>
                </label>
              `;
            })}
          </div>
        ` : nothing}
      </div>
    `;
  }

  private _renderBoundarySection(
    boundary: GroupBoundary,
    gi: number,
    props: GroupedViewProps,
    dataset: TypedDataSet,
    contentColumnIds: readonly ColumnId[],
    columnConfig: readonly TableColumnConfig[] | undefined,
    isSpreadsheet: boolean,
    isListMode: boolean,
    showSummary: boolean,
    defaultExpanded: boolean,
  ): TemplateResult {
    const expanded = this._isExpanded(boundary.name, defaultExpanded, boundary.rowCount);

    const afterHeader = props.renderAfterHeader?.({
      name: boundary.name,
      depth: 0,
      startRow: boundary.startRow,
      rowCount: boundary.rowCount,
      children: [],
      aggregates: boundary.aggregates,
    });

    const sectionClass = isSpreadsheet ? "group-section spreadsheet-group" : "group-section";
    const toggleClass = isSpreadsheet ? "group-toggle" : "section-toggle";

    return html`
      <div class="${sectionClass}">
        <button class="${toggleClass}"
          aria-expanded="${String(expanded)}"
          aria-controls="${this._instanceId}-group-${gi}"
          data-group="${boundary.name}"
          @click=${() => this._handleToggle(boundary.name, expanded)}
        >
          ${isSpreadsheet ? html`
            <span class="group-chevron">${expanded ? "▼" : "▶"}</span>
            <span>${this._spreadsheetLabel(boundary, showSummary)}</span>
          ` : html`
            <span class="${expanded ? "section-chevron expanded" : "section-chevron"}">${"▶"}</span>
            <span class="section-title">${boundary.name}</span>
            <span class="section-summary">${this._summaryText(boundary, showSummary)}</span>
          `}
        </button>
        ${afterHeader}
        <div class="section-content"
          id="${this._instanceId}-group-${gi}"
          ?hidden=${!expanded}
        >
          ${isListMode
            ? this._renderContentList(dataset, boundary, contentColumnIds)
            : this._renderGroupTable(dataset, boundary, columnConfig!, props)}
        </div>
      </div>
    `;
  }

  private _renderTreeNode(
    node: GroupNode,
    columnConfig: readonly TableColumnConfig[],
    props: GroupedViewProps,
    dataset: TypedDataSet,
    contentColumnIds: readonly ColumnId[],
    parentPath: string,
    showSummary: boolean,
    defaultExpanded: boolean,
  ): TemplateResult {
    const path = this._nodeKey(parentPath, node.name);
    const expanded = this._isExpanded(path, defaultExpanded, node.rowCount);
    const isSubLevel = node.depth > 0;

    let summaryText = `${node.rowCount} items`;
    if (showSummary && node.aggregates && node.aggregates.size > 0) {
      summaryText += " · " + Array.from(node.aggregates.values())
        .map((v) => String(v))
        .join(", ");
    }

    return html`
      <div class="group-section">
        <button class="${isSubLevel ? "sub-section-toggle" : "section-toggle"}"
          aria-expanded="${String(expanded)}"
          data-group="${path}"
          style="${ifDefined(isSubLevel ? `padding-left: ${node.depth * 16}px` : undefined)}"
          @click=${() => this._handleToggle(path, expanded)}
        >
          <span class="${expanded ? "section-chevron expanded" : "section-chevron"}">${"▶"}</span>
          <span class="section-title">${node.name}</span>
          <span class="section-summary">${summaryText}</span>
        </button>
        ${props.renderAfterHeader?.(node)}
        <div class="section-content" ?hidden=${!expanded}>
          ${node.children.length > 0
            ? node.children.map((child) =>
                this._renderTreeNode(child, columnConfig, props, dataset, contentColumnIds, path, showSummary, defaultExpanded)
              )
            : this._renderGroupTable(dataset, node, columnConfig, props)}
        </div>
      </div>
    `;
  }

  private _renderGroupTable(
    dataset: TypedDataSet,
    slice: { startRow: number; rowCount: number },
    columnConfig: readonly TableColumnConfig[],
    props: GroupedViewProps,
  ): TemplateResult {
    return html`
      <pages-data-table
        .embedded=${true}
        .headerVisible=${false}
        .dataSet=${this._sliceDataset(dataset, slice)}
        .columnConfig=${columnConfig}
        .columnRenderers=${this._columnRenderers}
        .rowStyle=${props.rowStyle}
        .getRowAccent=${this._getRowAccent}
        .selection=${props.selection}
        .getRowKey=${this._getRowKey}
        .getRowDetail=${this._getRowDetail}
        .getRowClass=${this._getRowClass}
        .sortable=${props.sortable ?? false}
        .clientSort=${props.clientSort ?? false}
        .activeSort=${this.activeSort}
        .hiddenColumns=${this._hiddenColumnIds.size > 0 ? Array.from(this._hiddenColumnIds) : undefined}
        .selectedKeys=${this._selectedKeys.size > 0 ? Array.from(this._selectedKeys) : undefined}
        @selection-change=${this._handleChildSelectionChange}
      ></pages-data-table>
    `;
  }

  private _renderContentList(
    dataset: TypedDataSet,
    boundary: GroupBoundary,
    contentColumnIds: readonly ColumnId[],
  ): TemplateResult {
    const colWidths = computeColumnWidths(dataset, contentColumnIds, "14px sans-serif");
    const colWidthsCss = colWidths.map((w) => `${w}px`).join(" ");
    const rows = dataset.rows.slice(boundary.startRow, boundary.startRow + boundary.rowCount);

    return html`
      <dl class="aligned-list" style="grid-template-columns: ${colWidthsCss}">
        ${rows.map((row) => html`
          <div class="list-item">
            ${contentColumnIds.map((id) => {
              const col = dataset.columns.find((c) => c.id === id);
              const renderer = this._columnRenderers?.get(id);
              if (renderer && col) {
                const result = renderer(row.cell(id), row, col);
                return html`
                  <dt class="visually-hidden">${col.name ?? String(id)}</dt>
                  <dd>${result instanceof HTMLElement ? result : String(result)}</dd>
                `;
              }
              const cell = row.cell(id);
              return html`
                <dt class="visually-hidden">${col?.name ?? String(id)}</dt>
                <dd>${cell.type === "NULL" ? "" : String(cell.value)}</dd>
              `;
            })}
          </div>
        `)}
      </dl>
    `;
  }

  // ── Event handlers ────────────────────────────────────────────────

  private _handleToggle(groupKey: string, wasExpanded: boolean): void {
    this._expandState = new Map([...this._expandState, [groupKey, !wasExpanded]]);
    this.dispatchEvent(new CustomEvent("pages-event", {
      bubbles: true,
      composed: true,
      detail: {
        topic: "group-toggle",
        payload: { group: groupKey, expanded: !wasExpanded },
      },
    }));
  }

  private _handleHeaderSort(columnId: ColumnId): void {
    const current = this.activeSort;
    let order: "ASCENDING" | "DESCENDING";
    if (current && String(current.columnId) === String(columnId)) {
      order = current.order === "ASCENDING" ? "DESCENDING" : "ASCENDING";
    } else {
      order = "ASCENDING";
    }
    this.dispatchEvent(new CustomEvent("pages-sort", {
      detail: { columnId, order },
      bubbles: true,
      composed: true,
    }));
  }

  private _handleChildSelectionChange = (e: Event): void => {
    const ce = e as CustomEvent;
    ce.stopPropagation();
    const childKeys: readonly string[] = ce.detail.selectedKeys ?? [];
    const table = ce.target as PagesTableHost;
    const tableRows = table.dataSet?.rows ?? [];
    const getRowKey = this._getRowKey;
    if (!getRowKey) return;

    const tableKeys = new Set(tableRows.map((row) => getRowKey(row)));
    const newSelected = new Set(this._selectedKeys);
    for (const key of tableKeys) {
      newSelected.delete(key);
    }
    for (const key of childKeys) {
      newSelected.add(key);
    }
    this._selectedKeys = newSelected;

    this.dispatchEvent(new CustomEvent("selection-change", {
      detail: { selectedKeys: Array.from(newSelected), selectedRows: [] },
      bubbles: true,
      composed: true,
    }));
  };

  private _handleSelectAll(dataset: TypedDataSet): void {
    const getRowKey = this._getRowKey;
    if (!getRowKey) return;

    const allKeys = dataset.rows.map((row) => getRowKey(row));
    const allSelected = allKeys.length > 0 && allKeys.every((k) => this._selectedKeys.has(k));

    this._selectedKeys = allSelected ? new Set() : new Set(allKeys);

    this.dispatchEvent(new CustomEvent("selection-change", {
      detail: { selectedKeys: Array.from(this._selectedKeys), selectedRows: [] },
      bubbles: true,
      composed: true,
    }));
  }

  private _togglePicker = (): void => {
    this._pickerOpen = !this._pickerOpen;
  };

  private _toggleColumnVisibility(columnId: string, contentColumnIds: readonly ColumnId[]): void {
    const visibleCount = contentColumnIds.filter((id) => !this._hiddenColumnIds.has(String(id))).length;
    const isHidden = this._hiddenColumnIds.has(columnId);

    if (!isHidden && visibleCount <= 1) return;

    const newHidden = new Set(this._hiddenColumnIds);
    if (isHidden) {
      newHidden.delete(columnId);
    } else {
      newHidden.add(columnId);
    }
    this._hiddenColumnIds = newHidden;

    const visibleColumns = contentColumnIds
      .filter((id) => !newHidden.has(String(id)))
      .map(String);

    this.dispatchEvent(new CustomEvent("column-change", {
      detail: { visibleColumns },
      bubbles: true,
      composed: true,
    }));
  }

  // ── Pure computation helpers ──────────────────────────────────────

  private _isExpanded(key: string, defaultExpanded: boolean, rowCount: number): boolean {
    if (this._expandState.has(key)) return this._expandState.get(key)!;
    return rowCount === 0 ? false : defaultExpanded;
  }

  private _summaryText(boundary: GroupBoundary, showSummary: boolean): string {
    let text = `${boundary.rowCount} items`;
    if (showSummary && boundary.aggregates.size > 0) {
      text += " · " + Array.from(boundary.aggregates.values())
        .map((v) => String(v))
        .join(", ");
    }
    return text;
  }

  private _spreadsheetLabel(boundary: GroupBoundary, showSummary: boolean): string {
    let text = `${boundary.name} (${boundary.rowCount})`;
    if (showSummary && boundary.aggregates.size > 0) {
      text += " · " + Array.from(boundary.aggregates.values())
        .map((v) => String(v))
        .join(", ");
    }
    return text;
  }

  private _sortClass(columnId: ColumnId): string {
    if (!this.activeSort || String(this.activeSort.columnId) !== String(columnId)) {
      return "col-header";
    }
    return this.activeSort.order === "ASCENDING" ? "col-header sort-asc" : "col-header sort-desc";
  }

  private _ariaSort(columnId: ColumnId): string | undefined {
    if (!this.activeSort || String(this.activeSort.columnId) !== String(columnId)) {
      return undefined;
    }
    return this.activeSort.order === "ASCENDING" ? "ascending" : "descending";
  }

  private _selectAllChecked(dataset: TypedDataSet): boolean {
    const total = dataset.rows.length;
    return this._selectedKeys.size > 0 && this._selectedKeys.size >= total;
  }

  private _selectAllIndeterminate(dataset: TypedDataSet): boolean {
    const total = dataset.rows.length;
    return this._selectedKeys.size > 0 && this._selectedKeys.size < total;
  }

  private _buildColumnConfig(
    dataset: TypedDataSet,
    contentColumnIds: readonly ColumnId[],
    props: GroupedViewProps,
  ): readonly TableColumnConfig[] {
    const rawWidths = computeColumnWidths(dataset, contentColumnIds, "14px sans-serif");
    const minWidth = Math.min(...rawWidths);
    const frWidths = rawWidths.map((w) => `${(w / minWidth).toFixed(2)}fr`);

    return dataset.columns.map((col) => {
      const contentIndex = contentColumnIds.indexOf(col.id);
      if (contentIndex === -1) {
        return { id: col.id, visible: false } as TableColumnConfig;
      }
      const userConfig = props.columnConfig?.find((c) => c.id === col.id);
      return {
        id: col.id,
        width: userConfig?.width ?? frWidths[contentIndex]!,
        ...userConfig,
      } as TableColumnConfig;
    });
  }

  private _sliceDataset(dataset: TypedDataSet, slice: { startRow: number; rowCount: number }): TypedDataSet {
    return {
      columns: dataset.columns,
      rows: dataset.rows.slice(slice.startRow, slice.startRow + slice.rowCount),
    };
  }

  private _nodeKey(parentPath: string, name: string): string {
    return parentPath ? `${parentPath}\x1F${name}` : name;
  }
}
