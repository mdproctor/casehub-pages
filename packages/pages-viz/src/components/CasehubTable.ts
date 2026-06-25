import type { TypedDataSet, ColumnId } from "@casehubio/pages-data/dist/dataset/types.js";
import type { SortOrder } from "@casehubio/pages-data/dist/dataset/sort.js";
import type { TableProps } from "@casehubio/pages-component";
import { CasehubElement } from "../base/CasehubElement.js";
import { cellToRaw, resolveColumnName, applyCellExpression, resolveColumnExpression } from "../base/cell-extract.js";
import { tableToCsv, downloadCsv, copyToClipboard } from "./table-export.js";
import type { CasehubFilterDetail, CasehubFilterApply, CasehubFilterReset } from "../base/filter-types.js";

const TABLE_CSS = `
:host {
  display: block;
  font-family: var(--casehub-font, system-ui, sans-serif);
  font-size: var(--casehub-font-size, 14px);
  color: var(--casehub-text, #333);
}
.toolbar {
  display: flex; justify-content: space-between; align-items: center;
  padding: 6px 4px; gap: 12px;
}
.filter-box {
  display: flex; align-items: center; gap: 4px;
  border: 1px solid var(--casehub-border, #ddd); border-radius: 4px;
  padding: 4px 8px; background: var(--casehub-bg, #fff);
}
.filter-box svg { width: 14px; height: 14px; fill: var(--casehub-text-muted, #999); flex-shrink: 0; }
.filter-box input {
  border: none; outline: none; font-size: 13px; background: transparent;
  color: var(--casehub-text, #333); width: 140px;
}
.paging {
  display: flex; align-items: center; gap: 6px;
  font-size: 13px; color: var(--casehub-text, #333); white-space: nowrap;
}
.paging .range { margin-right: 8px; }
.paging button {
  cursor: pointer; padding: 2px 6px; border: 1px solid var(--casehub-border, #ddd);
  background: var(--casehub-bg, #fff); border-radius: 3px; font-size: 13px;
  color: var(--casehub-text, #333); line-height: 1;
}
.paging button:disabled { opacity: 0.3; cursor: default; }
.paging button:hover:not(:disabled) { background: var(--casehub-bg-alt, #f0f0f0); }
.paging input[type="number"] {
  width: 40px; text-align: center; border: 1px solid var(--casehub-border, #ddd);
  border-radius: 3px; padding: 2px 4px; font-size: 13px;
  color: var(--casehub-text, #333); background: var(--casehub-bg, #fff);
}
.paging input[type="number"]::-webkit-inner-spin-button { -webkit-appearance: none; }
.paging input[type="number"] { -moz-appearance: textfield; }
table { width: 100%; border-collapse: collapse; }
th {
  border-bottom: 2px solid var(--casehub-border, #e0e0e0);
  padding: 8px 12px; text-align: left; cursor: pointer; user-select: none;
  font-weight: 600;
}
td {
  border-bottom: 1px solid var(--casehub-border, #e0e0e0);
  padding: 8px 12px;
}
tr:nth-child(even) { background: var(--casehub-bg-alt, #fafafa); }
tr.clickable:hover { background: var(--casehub-bg-hover, #e8f0fe); cursor: pointer; }
tr.selected { background: var(--casehub-bg-selected, #d3e3fd); }
.export-btn {
  cursor: pointer; padding: 4px 8px; border: 1px solid var(--casehub-border, #ddd);
  background: var(--casehub-bg, #fff); border-radius: 3px; font-size: 13px;
  color: var(--casehub-text, #333); line-height: 1; display: flex; align-items: center; gap: 4px;
}
.export-btn:hover { background: var(--casehub-bg-alt, #f0f0f0); }
.export-btn svg { width: 14px; height: 14px; fill: currentColor; }
`;

const SEARCH_ICON = `<svg viewBox="0 0 24 24"><path d="M15.5 14h-.79l-.28-.27A6.47 6.47 0 0016 9.5 6.5 6.5 0 109.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>`;

export class CasehubTable extends CasehubElement<TableProps> {
  private _filterText = "";
  private _selectedColumnId: ColumnId | undefined;
  private _selectedValue: string | undefined;

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
    container.textContent = "";

    const style = document.createElement("style");
    style.textContent = TABLE_CSS;
    container.appendChild(style);

    const pageSize = props.pageSize;
    const currentPage = this.activePage ?? 0;

    // Apply text filter only (pipeline already sorted and paginated)
    const filteredRows = this.getFilteredRows(dataset);
    const displayRows = filteredRows;
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
      this.rerender(props, dataset);
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

    // Pagination
    if (pageSize && totalCount > 0) {
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

    container.appendChild(toolbar);

    // Table
    const table = document.createElement("table");

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
    table.appendChild(thead);

    const tbody = document.createElement("tbody");
    for (let rowIdx = 0; rowIdx < displayRows.length; rowIdx++) {
      const row = displayRows[rowIdx];
      if (!row) continue;
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

      for (let colIdx = 0; colIdx < dataset.columns.length; colIdx++) {
        const td = document.createElement("td");
        const cell = row.cells[colIdx];
        if (!cell) continue;
        let raw = cellToRaw(cell);
        const col = dataset.columns[colIdx];
        if (!col) continue;
        const expr = resolveColumnExpression(col.id, props.columns);
        if (expr) raw = applyCellExpression(raw, expr);
        td.textContent = raw === null ? "" : String(raw);

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
              this.dispatchEvent(new CustomEvent<CasehubFilterDetail>("casehub-filter", {
                bubbles: true, composed: true,
                detail: { columnId, reset: true, group: props.filter?.group } satisfies CasehubFilterReset,
              }));
            } else if (this._selectedColumnId !== undefined && this._selectedColumnId !== columnId) {
              // Column switch — reset old, apply new
              const oldColumnId = this._selectedColumnId;
              this._selectedColumnId = columnId;
              this._selectedValue = value;
              this.dispatchEvent(new CustomEvent<CasehubFilterDetail>("casehub-filter", {
                bubbles: true, composed: true,
                detail: { columnId: oldColumnId, reset: true, group: props.filter?.group } satisfies CasehubFilterReset,
              }));
              this.dispatchEvent(new CustomEvent<CasehubFilterDetail>("casehub-filter", {
                bubbles: true, composed: true,
                detail: { columnId, value, row: clickedRow, reset: false, group: props.filter?.group } satisfies CasehubFilterApply,
              }));
            } else {
              // Same column new value, or first selection
              this._selectedColumnId = columnId;
              this._selectedValue = value;
              this.dispatchEvent(new CustomEvent<CasehubFilterDetail>("casehub-filter", {
                bubbles: true, composed: true,
                detail: { columnId, value, row: clickedRow, reset: false, group: props.filter?.group } satisfies CasehubFilterApply,
              }));
            }
            this.rerender(props, dataset);
          });
        }

        tr.appendChild(td);
      }
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    container.appendChild(table);
  }

  private goToPage(page: number, pageSize: number): void {
    this.dispatchEvent(
      new CustomEvent("casehub-page", {
        bubbles: true,
        composed: true,
        detail: { offset: page * pageSize, count: pageSize },
      }),
    );
  }

  private getFilteredRows(dataset: TypedDataSet): readonly import("@casehubio/pages-data/dist/dataset/types.js").TypedRow[] {
    if (!this._filterText) return dataset.rows;
    const term = this._filterText.toLowerCase();
    return dataset.rows.filter((row) =>
      row.cells.some((cell) => {
        const raw = cellToRaw(cell);
        return raw !== null && String(raw).toLowerCase().includes(term);
      }),
    );
  }

  private handleSort(columnId: ColumnId): void {
    const currentOrder = this.activeSort?.columnId === columnId ? this.activeSort.order : undefined;
    const newOrder: SortOrder = currentOrder === "ASCENDING" ? "DESCENDING" : "ASCENDING";

    this.dispatchEvent(
      new CustomEvent("casehub-sort", {
        bubbles: true,
        composed: true,
        detail: { columnId, order: newOrder },
      }),
    );
  }

  private rerender(props: TableProps, dataset: TypedDataSet): void {
    this.render(this.container, props, dataset);
  }
}

customElements.define("casehub-table", CasehubTable);
