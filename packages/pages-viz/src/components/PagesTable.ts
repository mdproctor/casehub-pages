import type { TypedDataSet, TypedRow, ColumnId } from "@casehubio/pages-data/dist/dataset/types.js";
import type { SortOrder } from "@casehubio/pages-data/dist/dataset/sort.js";
import type { TableProps, ExpandableConfig } from "@casehubio/pages-component";
import { evaluateExpression, createRowContext, EMPTY_CONTEXT } from "@casehubio/pages-component";
import { PagesElement } from "../base/PagesElement.js";
import { cellToRaw, resolveColumnName, applyCellExpression, resolveColumnExpression } from "../base/cell-extract.js";
import { tableToCsv, downloadCsv, copyToClipboard } from "./table-export.js";
import type { PagesFilterDetail, PagesFilterApply, PagesFilterReset } from "../base/filter-types.js";

const TREE_INDENT_PX = 20;

const TABLE_CSS = `
:host {
  display: block;
  font-family: var(--pages-font-family, system-ui, sans-serif);
  font-size: var(--pages-font-size-base, 14px);
  color: var(--pages-neutral-12, #333);
}
.toolbar {
  display: flex; justify-content: space-between; align-items: center;
  padding: 6px 4px; gap: 12px;
}
.filter-box {
  display: flex; align-items: center; gap: 4px;
  border: 1px solid var(--pages-neutral-6, #ddd); border-radius: 4px;
  padding: 4px 8px; background: var(--pages-neutral-1, #fff);
}
.filter-box svg { width: 14px; height: 14px; fill: var(--pages-neutral-11, #999); flex-shrink: 0; }
.filter-box input {
  border: none; outline: none; font-size: 13px; background: transparent;
  color: var(--pages-neutral-12, #333); width: 140px;
}
.paging {
  display: flex; align-items: center; gap: 6px;
  font-size: 13px; color: var(--pages-neutral-12, #333); white-space: nowrap;
}
.paging .range { margin-right: 8px; }
.paging button {
  cursor: pointer; padding: 2px 6px; border: 1px solid var(--pages-neutral-6, #ddd);
  background: var(--pages-neutral-1, #fff); border-radius: 3px; font-size: 13px;
  color: var(--pages-neutral-12, #333); line-height: 1;
}
.paging button:disabled { opacity: 0.3; cursor: default; }
.paging button:hover:not(:disabled) { background: var(--pages-neutral-2, #f0f0f0); }
.paging input[type="number"] {
  width: 40px; text-align: center; border: 1px solid var(--pages-neutral-6, #ddd);
  border-radius: 3px; padding: 2px 4px; font-size: 13px;
  color: var(--pages-neutral-12, #333); background: var(--pages-neutral-1, #fff);
}
.paging input[type="number"]::-webkit-inner-spin-button { -webkit-appearance: none; }
.paging input[type="number"] { -moz-appearance: textfield; }
table { width: 100%; border-collapse: collapse; }
th {
  border-bottom: 2px solid var(--pages-neutral-6, #e0e0e0);
  padding: 8px 12px; text-align: left; cursor: pointer; user-select: none;
  font-weight: 600;
}
td {
  border-bottom: 1px solid var(--pages-neutral-6, #e0e0e0);
  padding: 8px 12px;
}
tr:nth-child(even) { background: var(--pages-neutral-2, #fafafa); }
tr.clickable:hover { background: var(--pages-accent-4, #e8f0fe); cursor: pointer; }
tr.selected { background: var(--pages-accent-5, #d3e3fd); }
tr.pages-row-danger { background: var(--pages-danger-3, #ffe6e6); }
tr.pages-row-warning { background: var(--pages-warning-3, #fff4e6); }
tr.pages-row-success { background: var(--pages-success-3, #e6ffe6); }
tr.pages-row-muted { background: var(--pages-neutral-3, #f5f5f5); }
.export-btn {
  cursor: pointer; padding: 4px 8px; border: 1px solid var(--pages-neutral-6, #ddd);
  background: var(--pages-neutral-1, #fff); border-radius: 3px; font-size: 13px;
  color: var(--pages-neutral-12, #333); line-height: 1; display: flex; align-items: center; gap: 4px;
}
.export-btn:hover { background: var(--pages-neutral-2, #f0f0f0); }
.export-btn svg { width: 14px; height: 14px; fill: currentColor; }
.tree-toggle {
  cursor: pointer; background: none; border: none; padding: 0 4px 0 0;
  font-size: 12px; color: var(--pages-neutral-11, #999); line-height: 1;
  vertical-align: middle;
}
.tree-toggle:hover { color: var(--pages-neutral-12, #333); }
`;

const SEARCH_ICON = `<svg viewBox="0 0 24 24"><path d="M15.5 14h-.79l-.28-.27A6.47 6.47 0 0016 9.5 6.5 6.5 0 109.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>`;

/** A node in the tree index built from flat self-referencing rows. */
interface TreeNode {
  readonly row: TypedRow;
  readonly id: string;
  readonly parentId: string | null;
  readonly children: TreeNode[];
  readonly depth: number;
  /** Position among siblings (1-based). */
  siblingIndex: number;
  /** Total number of siblings at this level. */
  siblingCount: number;
}

/**
 * Build tree index from a flat dataset with self-referencing id/parentId columns.
 * Returns root nodes (parentId null or empty) and the full node map.
 */
function buildTreeIndex(
  dataset: TypedDataSet,
  config: ExpandableConfig,
): { roots: TreeNode[]; nodeMap: Map<string, TreeNode> } {
  const nodeMap = new Map<string, TreeNode>();
  const childMap = new Map<string, TreeNode[]>();

  // First pass: create all nodes
  for (const row of dataset.rows) {
    const idCell = row.cell(config.idColumn);
    const parentCell = row.cell(config.parentColumn);
    const id = idCell.type !== "NULL" ? String(idCell.value) : "";
    const rawParent = parentCell.type !== "NULL" ? String(parentCell.value) : null;
    const parentId = rawParent === "" ? null : rawParent;

    const node: TreeNode = {
      row,
      id,
      parentId,
      children: [],
      depth: 0,
      siblingIndex: 0,
      siblingCount: 0,
    };
    nodeMap.set(id, node);

    const parentKey = parentId ?? "__root__";
    let siblings = childMap.get(parentKey);
    if (!siblings) {
      siblings = [];
      childMap.set(parentKey, siblings);
    }
    siblings.push(node);
  }

  // Second pass: link children and compute depths
  const roots: TreeNode[] = [];
  for (const [, node] of nodeMap) {
    const kids = childMap.get(node.id);
    if (kids) {
      (node as { children: TreeNode[] }).children = kids;
    }
    if (node.parentId === null || !nodeMap.has(node.parentId)) {
      roots.push(node);
    }
  }

  // Compute depths via BFS
  function setDepths(nodes: TreeNode[], depth: number): void {
    for (const n of nodes) {
      (n as { depth: number }).depth = depth;
      setDepths(n.children, depth + 1);
    }
  }
  setDepths(roots, 0);

  // Compute sibling metadata
  function setSiblingMeta(siblings: TreeNode[]): void {
    for (let i = 0; i < siblings.length; i++) {
      siblings[i]!.siblingIndex = i + 1;
      siblings[i]!.siblingCount = siblings.length;
      setSiblingMeta(siblings[i]!.children);
    }
  }
  setSiblingMeta(roots);

  return { roots, nodeMap };
}

/**
 * Sort tree nodes at each level by a comparator applied to siblings only.
 * Mutates the children arrays in place.
 */
function sortTreeLevel(
  nodes: TreeNode[],
  dataset: TypedDataSet,
  sortColumnId: ColumnId,
  sortOrder: "ASCENDING" | "DESCENDING",
): void {
  const colIdx = dataset.columns.findIndex(c => c.id === sortColumnId);
  if (colIdx < 0) return;

  const compare = (a: TreeNode, b: TreeNode): number => {
    const aCell = a.row.cells[colIdx];
    const bCell = b.row.cells[colIdx];
    const aVal = aCell && aCell.type !== "NULL" ? cellToRaw(aCell) : null;
    const bVal = bCell && bCell.type !== "NULL" ? cellToRaw(bCell) : null;

    if (aVal === null && bVal === null) return 0;
    if (aVal === null) return 1;
    if (bVal === null) return -1;

    let cmp: number;
    if (typeof aVal === "number" && typeof bVal === "number") {
      cmp = aVal - bVal;
    } else {
      cmp = String(aVal).localeCompare(String(bVal));
    }
    return sortOrder === "DESCENDING" ? -cmp : cmp;
  };

  nodes.sort(compare);
  // Update sibling metadata after sort
  for (let i = 0; i < nodes.length; i++) {
    nodes[i]!.siblingIndex = i + 1;
    nodes[i]!.siblingCount = nodes.length;
  }
  for (const n of nodes) {
    sortTreeLevel(n.children, dataset, sortColumnId, sortOrder);
  }
}

/**
 * Collect visible tree rows given expand state.
 * Returns nodes in depth-first order, respecting expand state.
 */
function collectVisibleNodes(
  nodes: readonly TreeNode[],
  expandState: Map<string, boolean>,
): TreeNode[] {
  const result: TreeNode[] = [];
  for (const node of nodes) {
    result.push(node);
    if (node.children.length > 0 && expandState.get(node.id) === true) {
      result.push(...collectVisibleNodes(node.children, expandState));
    }
  }
  return result;
}

/**
 * Compute initial expand state from defaultExpanded config.
 */
function computeDefaultExpandState(
  roots: readonly TreeNode[],
  defaultExpanded: boolean | number | undefined,
): Map<string, boolean> {
  const state = new Map<string, boolean>();
  if (defaultExpanded === undefined || defaultExpanded === false) {
    return state; // All collapsed
  }

  function walk(nodes: readonly TreeNode[], depth: number): void {
    for (const node of nodes) {
      if (node.children.length === 0) continue;
      if (defaultExpanded === true || (typeof defaultExpanded === "number" && depth < defaultExpanded)) {
        state.set(node.id, true);
        walk(node.children, depth + 1);
      }
    }
  }
  walk(roots, 0);
  return state;
}

/**
 * Check if any descendant of a node matches a text filter.
 * Returns set of node IDs that match or have matching descendants.
 */
function findMatchingNodes(
  nodes: readonly TreeNode[],
  term: string,
): Set<string> {
  const matching = new Set<string>();
  const lower = term.toLowerCase();

  function walk(node: TreeNode): boolean {
    const rowMatches = node.row.cells.some(
      cell => cell.type !== "NULL" && String(cell.value).toLowerCase().includes(lower),
    );
    let childMatches = false;
    for (const child of node.children) {
      if (walk(child)) childMatches = true;
    }
    if (rowMatches || childMatches) {
      matching.add(node.id);
      return true;
    }
    return false;
  }

  for (const root of nodes) {
    walk(root);
  }
  return matching;
}

/**
 * Check if a specific node's own row matches a text filter (not its descendants).
 */
function rowMatchesText(node: TreeNode, term: string): boolean {
  const lower = term.toLowerCase();
  return node.row.cells.some(
    cell => cell.type !== "NULL" && String(cell.value).toLowerCase().includes(lower),
  );
}

export class PagesTable extends PagesElement<TableProps> {
  private _filterText = "";
  private _selectedColumnId: ColumnId | undefined;
  private _selectedValue: string | undefined;
  /** Expand state for tree-table. Persists across data re-pushes. */
  private _expandState = new Map<string, boolean>();
  /** Whether _expandState has been initialized from defaultExpanded. */
  private _expandStateInitialized = false;

  override get dataSet(): TypedDataSet | undefined {
    return super.dataSet;
  }

  override set dataSet(value: TypedDataSet | undefined) {
    if (this._selectedColumnId !== undefined && this._selectedValue !== undefined && value) {
      const colId = this._selectedColumnId;
      const selVal = this._selectedValue;
      const found = value.rows.some(row => {
        try {
          const cell = row.cell(colId);
          return cell.type !== "NULL" && String(cellToRaw(cell)) === selVal;
        } catch { return false; }
      });
      if (!found) {
        this._selectedColumnId = undefined;
        this._selectedValue = undefined;
      }
    }
    super.dataSet = value;
  }

  protected override render(
    container: HTMLDivElement,
    props: TableProps,
    dataset: TypedDataSet,
  ): void {
    if (props.expandable) {
      this.renderTreeTable(container, props, dataset, props.expandable);
    } else {
      this.renderFlatTable(container, props, dataset);
    }
  }

  private renderFlatTable(
    container: HTMLDivElement,
    props: TableProps,
    dataset: TypedDataSet,
  ): void {
    container.textContent = "";

    const style = document.createElement("style");
    style.textContent = TABLE_CSS;
    container.appendChild(style);

    const pageSize = props.pageSize;
    const currentPage = this.activePage ?? 0;

    const displayRows = dataset.rows;
    const totalCount = this.totalRows;
    const totalPages = pageSize ? Math.max(1, Math.ceil(totalCount / pageSize)) : 1;

    // Toolbar: filter (left) + pagination (right)
    const toolbar = document.createElement("div");
    toolbar.className = "toolbar";

    // Filter input
    const filterBox = document.createElement("div");
    filterBox.className = "filter-box";
    filterBox.innerHTML = SEARCH_ICON;
    const filterInput = document.createElement("input");
    filterInput.type = "text";
    filterInput.placeholder = "Filter";
    filterInput.value = this._filterText;
    filterInput.addEventListener("input", () => {
      this._filterText = filterInput.value;
      const cursorPos = filterInput.selectionStart;
      this.dispatchEvent(new CustomEvent("pages-text-filter", {
        bubbles: true,
        composed: true,
        detail: { text: this._filterText },
      }));
      const restored = this.shadowRoot.querySelector<HTMLInputElement>(".filter-box input");
      if (restored) {
        restored.focus();
        restored.setSelectionRange(cursorPos, cursorPos);
      }
    });
    filterBox.appendChild(filterInput);
    toolbar.appendChild(filterBox);

    // Export buttons
    if (props.csvExport) {
      this.renderExportButtons(toolbar, dataset, props);
    }

    // Pagination
    if (pageSize && totalCount > 0) {
      this.renderPaginationControls(toolbar, currentPage, totalPages, totalCount, pageSize);
    }

    container.appendChild(toolbar);

    // Table
    const table = document.createElement("table");

    const thead = this.renderTableHeader(dataset, props);
    table.appendChild(thead);

    const tbody = document.createElement("tbody");
    for (let rowIdx = 0; rowIdx < displayRows.length; rowIdx++) {
      const row = displayRows[rowIdx];
      if (!row) continue;
      const tr = this.renderFlatRow(row, dataset, props);
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    container.appendChild(table);
  }

  private renderTreeTable(
    container: HTMLDivElement,
    props: TableProps,
    dataset: TypedDataSet,
    config: ExpandableConfig,
  ): void {
    container.textContent = "";

    const style = document.createElement("style");
    style.textContent = TABLE_CSS;
    container.appendChild(style);

    // Build tree index
    const { roots } = buildTreeIndex(dataset, config);

    // Apply sorting within levels if activeSort is set
    if (this.activeSort) {
      sortTreeLevel(roots, dataset, this.activeSort.columnId, this.activeSort.order);
    }

    // Initialize expand state from defaultExpanded on first render
    if (!this._expandStateInitialized) {
      this._expandState = computeDefaultExpandState(roots, config.defaultExpanded);
      this._expandStateInitialized = true;
    }

    // Apply text filter if active
    const filterTerm = this._filterText;
    let matchingNodeIds: Set<string> | undefined;
    if (filterTerm) {
      matchingNodeIds = findMatchingNodes(roots, filterTerm);
    }

    // Compute visible roots for filtering
    let visibleRoots = roots;
    if (matchingNodeIds) {
      visibleRoots = roots.filter(r => matchingNodeIds!.has(r.id));
    }

    // Pagination by root count
    const pageSize = props.pageSize;
    const currentPage = this.activePage ?? 0;
    const totalRoots = visibleRoots.length;
    const totalPages = pageSize ? Math.max(1, Math.ceil(totalRoots / pageSize)) : 1;

    let pageRoots: TreeNode[];
    if (pageSize) {
      const start = currentPage * pageSize;
      pageRoots = visibleRoots.slice(start, start + pageSize);
    } else {
      pageRoots = visibleRoots;
    }

    // Collect visible nodes from paged roots
    let visibleNodes: TreeNode[];
    if (matchingNodeIds) {
      // When filtering, expand all matching ancestors and show matching subtrees
      visibleNodes = [];
      const collectFiltered = (nodes: readonly TreeNode[]): void => {
        for (const node of nodes) {
          if (!matchingNodeIds!.has(node.id)) continue;
          visibleNodes.push(node);
          // Show children that match or have matching descendants
          const filteredChildren = node.children.filter(c => matchingNodeIds!.has(c.id));
          collectFiltered(filteredChildren);
        }
      };
      collectFiltered(pageRoots);
    } else {
      visibleNodes = collectVisibleNodes(pageRoots, this._expandState);
    }

    // Toolbar
    const toolbar = document.createElement("div");
    toolbar.className = "toolbar";

    // Filter input (handled internally for tree mode)
    const filterBox = document.createElement("div");
    filterBox.className = "filter-box";
    filterBox.innerHTML = SEARCH_ICON;
    const filterInput = document.createElement("input");
    filterInput.type = "text";
    filterInput.placeholder = "Filter";
    filterInput.value = this._filterText;
    filterInput.addEventListener("input", () => {
      this._filterText = filterInput.value;
      // Re-render internally — no event dispatch needed for tree mode
      // (pipeline delivers all rows, filtering is local)
      this.dataSet = this.dataSet;
    });
    filterBox.appendChild(filterInput);
    toolbar.appendChild(filterBox);

    // Export buttons
    if (props.csvExport) {
      this.renderExportButtons(toolbar, dataset, props);
    }

    // Pagination controls (by root count)
    if (pageSize && totalRoots > 0) {
      this.renderPaginationControls(toolbar, currentPage, totalPages, totalRoots, pageSize);
    }

    container.appendChild(toolbar);

    // Table
    const table = document.createElement("table");

    const thead = this.renderTableHeader(dataset, props);
    table.appendChild(thead);

    const tbody = document.createElement("tbody");
    for (const node of visibleNodes) {
      const tr = this.renderTreeRow(node, dataset, props, config, matchingNodeIds, filterTerm);
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    container.appendChild(table);
  }

  /** Render a table header row. Shared between flat and tree modes. */
  private renderTableHeader(dataset: TypedDataSet, props: TableProps): HTMLTableSectionElement {
    const thead = document.createElement("thead");
    const headerRow = document.createElement("tr");
    for (const col of dataset.columns) {
      const th = document.createElement("th");
      const displayName = resolveColumnName(col, props.columns);
      let sortIndicator = "";
      if (props.sortable && this.activeSort?.columnId === col.id) {
        sortIndicator = this.activeSort.order === "ASCENDING" ? " ▲" : " ▼";
      }
      th.textContent = displayName + sortIndicator;
      if (props.sortable) {
        th.addEventListener("click", () => { this.handleSort(col.id); });
      }
      headerRow.appendChild(th);
    }
    thead.appendChild(headerRow);
    return thead;
  }

  /** Render export buttons. */
  private renderExportButtons(toolbar: HTMLDivElement, dataset: TypedDataSet, props: TableProps): void {
    const exportGroup = document.createElement("div");
    exportGroup.style.cssText = "display:flex;gap:4px;";

    const dlBtn = document.createElement("button");
    dlBtn.className = "export-btn";
    dlBtn.title = "Download CSV";
    dlBtn.innerHTML = `<svg viewBox="0 0 24 24"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>`;
    dlBtn.addEventListener("click", () => {
      const csv = tableToCsv(dataset, props.columns);
      downloadCsv(csv);
    });
    exportGroup.appendChild(dlBtn);

    const copyBtn = document.createElement("button");
    copyBtn.className = "export-btn";
    copyBtn.title = "Copy to clipboard";
    copyBtn.innerHTML = `<svg viewBox="0 0 24 24"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>`;
    copyBtn.addEventListener("click", () => {
      const csv = tableToCsv(dataset, props.columns);
      void copyToClipboard(csv).then(ok => {
        copyBtn.textContent = ok ? "✓" : "✗";
        setTimeout(() => {
          copyBtn.innerHTML = `<svg viewBox="0 0 24 24"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>`;
        }, 1500);
      });
    });
    exportGroup.appendChild(copyBtn);

    toolbar.appendChild(exportGroup);
  }

  /** Render pagination controls. */
  private renderPaginationControls(
    toolbar: HTMLDivElement,
    currentPage: number,
    totalPages: number,
    totalCount: number,
    pageSize: number,
  ): void {
    const paging = document.createElement("div");
    paging.className = "paging";

    const startRow = currentPage * pageSize + 1;
    const endRow = Math.min(startRow + pageSize - 1, totalCount);

    const range = document.createElement("span");
    range.className = "range";
    range.textContent = `${String(startRow)} – ${String(endRow)} of ${String(totalCount)}`;
    paging.appendChild(range);

    const firstBtn = document.createElement("button");
    firstBtn.innerHTML = "&#171;";
    firstBtn.title = "First page";
    firstBtn.disabled = currentPage === 0;
    firstBtn.addEventListener("click", () => { this.goToPage(0, pageSize); });

    const prevBtn = document.createElement("button");
    prevBtn.innerHTML = "&#8249;";
    prevBtn.title = "Previous page";
    prevBtn.disabled = currentPage === 0;
    prevBtn.addEventListener("click", () => { this.goToPage(currentPage - 1, pageSize); });

    const pageInput = document.createElement("input");
    pageInput.type = "number";
    pageInput.min = "1";
    pageInput.max = String(totalPages);
    pageInput.value = String(currentPage + 1);
    pageInput.addEventListener("change", () => {
      const val = parseInt(pageInput.value, 10);
      if (!isNaN(val) && val >= 1 && val <= totalPages) {
        this.goToPage(val - 1, pageSize);
      } else {
        pageInput.value = String(currentPage + 1);
      }
    });
    pageInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") pageInput.blur();
    });

    const ofLabel = document.createElement("span");
    ofLabel.textContent = `of ${String(totalPages)}`;

    const nextBtn = document.createElement("button");
    nextBtn.innerHTML = "&#8250;";
    nextBtn.title = "Next page";
    nextBtn.disabled = currentPage >= totalPages - 1;
    nextBtn.addEventListener("click", () => { this.goToPage(currentPage + 1, pageSize); });

    const lastBtn = document.createElement("button");
    lastBtn.innerHTML = "&#187;";
    lastBtn.title = "Last page";
    lastBtn.disabled = currentPage >= totalPages - 1;
    lastBtn.addEventListener("click", () => { this.goToPage(totalPages - 1, pageSize); });

    paging.append(firstBtn, prevBtn, pageInput, ofLabel, nextBtn, lastBtn);
    toolbar.appendChild(paging);
  }

  /** Render a single row in flat (non-tree) mode. */
  private renderFlatRow(
    row: TypedRow,
    dataset: TypedDataSet,
    props: TableProps,
  ): HTMLTableRowElement {
    const tr = document.createElement("tr");
    if (props.filter?.enabled) tr.className = "clickable";
    if (this._selectedColumnId !== undefined && this._selectedValue !== undefined) {
      try {
        const selCell = row.cell(this._selectedColumnId);
        if (selCell.type !== "NULL" && String(cellToRaw(selCell)) === this._selectedValue) {
          tr.classList.add("selected");
        }
      } catch { /* column not present in this row — skip */ }
    }

    // Apply row styling if configured
    this.applyRowStyling(tr, row, dataset, props);

    for (let colIdx = 0; colIdx < dataset.columns.length; colIdx++) {
      const td = document.createElement("td");
      const cell = row.cells[colIdx];
      if (!cell) continue;
      const raw = cellToRaw(cell);
      const col = dataset.columns[colIdx];
      if (!col) continue;
      const expr = resolveColumnExpression(col.id, props.columns);
      if (expr) {
        td.textContent = raw === null ? "" : String(raw);
        void applyCellExpression(raw, expr).then(result => {
          td.textContent = result === null ? "" : String(result);
        });
      } else {
        td.textContent = raw === null ? "" : String(raw);
      }

      if (props.filter?.enabled) {
        const columnId = col.id;
        const clickedRow = row;
        td.addEventListener("click", () => {
          const cellVal = row.cell(columnId);
          if (cellVal.type === "NULL") return;
          const value = String(cellToRaw(cellVal));

          if (columnId === this._selectedColumnId && value === this._selectedValue) {
            // Toggle off
            this._selectedColumnId = undefined;
            this._selectedValue = undefined;
            this.dispatchEvent(new CustomEvent<PagesFilterDetail>("pages-filter", {
              bubbles: true, composed: true,
              detail: { columnId, reset: true, group: props.filter?.group } satisfies PagesFilterReset,
            }));
          } else if (this._selectedColumnId !== undefined && this._selectedColumnId !== columnId) {
            // Column switch — reset old, apply new
            const oldColumnId = this._selectedColumnId;
            this._selectedColumnId = columnId;
            this._selectedValue = value;
            this.dispatchEvent(new CustomEvent<PagesFilterDetail>("pages-filter", {
              bubbles: true, composed: true,
              detail: { columnId: oldColumnId, reset: true, group: props.filter?.group } satisfies PagesFilterReset,
            }));
            this.dispatchEvent(new CustomEvent<PagesFilterDetail>("pages-filter", {
              bubbles: true, composed: true,
              detail: { columnId, value, row: clickedRow, reset: false, group: props.filter?.group } satisfies PagesFilterApply,
            }));
          } else {
            // Same column new value, or first selection
            this._selectedColumnId = columnId;
            this._selectedValue = value;
            this.dispatchEvent(new CustomEvent<PagesFilterDetail>("pages-filter", {
              bubbles: true, composed: true,
              detail: { columnId, value, row: clickedRow, reset: false, group: props.filter?.group } satisfies PagesFilterApply,
            }));
          }
          // Re-set dataSet to trigger render with current data + updated selection
          this.dataSet = this.dataSet;
        });
      }

      tr.appendChild(td);
    }
    return tr;
  }

  /** Render a single row in tree mode with indentation and toggle. */
  private renderTreeRow(
    node: TreeNode,
    dataset: TypedDataSet,
    props: TableProps,
    config: ExpandableConfig,
    matchingNodeIds: Set<string> | undefined,
    filterTerm: string,
  ): HTMLTableRowElement {
    const row = node.row;
    const tr = document.createElement("tr");
    const hasChildren = node.children.length > 0;
    const isExpanded = this._expandState.get(node.id) === true;

    // ARIA attributes
    tr.setAttribute("aria-level", String(node.depth + 1));
    tr.setAttribute("aria-setsize", String(node.siblingCount));
    tr.setAttribute("aria-posinset", String(node.siblingIndex));
    if (hasChildren) {
      tr.setAttribute("aria-expanded", String(isExpanded));
    }

    // If filtering and this row is a context row (doesn't match but descendant does), dim it
    if (matchingNodeIds && filterTerm && !rowMatchesText(node, filterTerm)) {
      tr.classList.add("pages-row-muted");
    }

    // Apply row styling
    this.applyRowStyling(tr, row, dataset, props);

    for (let colIdx = 0; colIdx < dataset.columns.length; colIdx++) {
      const td = document.createElement("td");
      const cell = row.cells[colIdx];
      if (!cell) continue;
      const raw = cellToRaw(cell);
      const col = dataset.columns[colIdx];
      if (!col) continue;
      const expr = resolveColumnExpression(col.id, props.columns);

      // First column gets indentation and toggle
      if (colIdx === 0) {
        const indent = node.depth * TREE_INDENT_PX;
        td.style.paddingLeft = `${String(indent + 12)}px`;

        if (hasChildren) {
          const toggleBtn = document.createElement("button");
          toggleBtn.className = "tree-toggle";
          toggleBtn.textContent = isExpanded ? "▼" : "▶";
          toggleBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            this._expandState.set(node.id, !isExpanded);
            this.dataSet = this.dataSet; // Trigger re-render
          });
          td.insertBefore(toggleBtn, td.firstChild);
        }

        // Add text after toggle
        const textSpan = document.createElement("span");
        textSpan.textContent = raw === null ? "" : String(raw);
        if (expr) {
          void applyCellExpression(raw, expr).then(result => {
            textSpan.textContent = result === null ? "" : String(result);
          });
        }
        td.appendChild(textSpan);
      } else {
        td.textContent = raw === null ? "" : String(raw);
        if (expr) {
          void applyCellExpression(raw, expr).then(result => {
            td.textContent = result === null ? "" : String(result);
          });
        }
      }

      tr.appendChild(td);
    }
    return tr;
  }

  /** Apply row styling rules (shared between flat and tree modes). */
  private applyRowStyling(
    tr: HTMLTableRowElement,
    row: TypedRow,
    dataset: TypedDataSet,
    props: TableProps,
  ): void {
    if (!props.rowStyle || props.rowStyle.length === 0) return;

    const rowCells: Record<string, unknown> = {};
    for (let colIdx = 0; colIdx < dataset.columns.length; colIdx++) {
      const col = dataset.columns[colIdx];
      const cell = row.cells[colIdx];
      if (col && cell) {
        const cellValue = cellToRaw(cell);
        rowCells[col.id] = cellValue;
      }
    }

    const rowContext = createRowContext(EMPTY_CONTEXT, rowCells);
    for (const rule of props.rowStyle) {
      try {
        const matches = evaluateExpression(rule.condition, rowContext);
        if (matches) {
          if (rule.className) {
            tr.classList.add(rule.className);
          }
          if (rule.style) {
            for (const [prop, value] of Object.entries(rule.style)) {
              const cssProp = prop.replace(/([A-Z])/g, "-$1").toLowerCase();
              tr.style.setProperty(cssProp, value);
            }
          }
          break;
        }
      } catch (error) {
        console.warn(`Row style condition evaluation failed: ${rule.condition}`, error);
      }
    }
  }

  private goToPage(page: number, pageSize: number): void {
    this.dispatchEvent(
      new CustomEvent("pages-page", {
        bubbles: true,
        composed: true,
        detail: { offset: page * pageSize, count: pageSize },
      }),
    );
  }

  private handleSort(columnId: ColumnId): void {
    const currentOrder = this.activeSort?.columnId === columnId ? this.activeSort.order : undefined;
    const newOrder: SortOrder = currentOrder === "ASCENDING" ? "DESCENDING" : "ASCENDING";

    this.dispatchEvent(
      new CustomEvent("pages-sort", {
        bubbles: true,
        composed: true,
        detail: { columnId, order: newOrder },
      }),
    );
  }

}

customElements.define("pages-table", PagesTable);
