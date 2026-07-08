import type { TypedDataSet, ColumnId, CellValue } from "@casehubio/pages-data/dist/dataset/types.js";
import type { GroupedViewProps } from "@casehubio/pages-component";
import { PagesElement } from "../../base/PagesElement.js";
import { resolvePreset } from "./presets.js";
import { extractGroupBoundaries } from "./group-extraction.js";
import type { GroupBoundary } from "./group-extraction.js";
import { computeColumnWidths } from "./column-widths.js";
import { renderGroupTableRowHeader } from "./render-group-table-row.js";
import { renderGroupSectionHeader } from "./render-group-section.js";
import { renderContentTable } from "./render-content-table.js";
import { renderContentList } from "./render-content-list.js";
import { GROUPED_VIEW_CSS } from "./group-view-styles.js";

function cellToDisplay(cell: CellValue): string {
  if (cell.type === "NULL") return "";
  const s = String(cell.value);
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export class PagesGroupedView extends PagesElement<GroupedViewProps> {
  private _expandState = new Map<string, boolean>();
  private _instanceId = "";
  private _styleEl: HTMLStyleElement;

  constructor() {
    super();
    this._styleEl = document.createElement("style");
    this._styleEl.textContent = GROUPED_VIEW_CSS;
    this.shadowRoot.insertBefore(this._styleEl, this.container);
  }

  override connectedCallback(): void {
    this._instanceId = typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
    super.connectedCallback();
  }

  protected override render(
    container: HTMLDivElement,
    props: GroupedViewProps,
    dataset: TypedDataSet,
  ): void {
    const mode = resolvePreset(props);
    const keyColumnId = props.groupBy.columnId;
    const aggColumnIds = (props.aggregations ?? []).map((a) => a.column);
    const boundaries = extractGroupBoundaries(dataset, keyColumnId, aggColumnIds);

    const contentColumnIds = dataset.columns
      .filter((c) => c.id !== keyColumnId && !aggColumnIds.includes(c.id))
      .map((c) => c.id);

    const defaultExpanded = props.defaultExpanded ?? true;
    for (const b of boundaries) {
      if (!this._expandState.has(b.name)) {
        this._expandState.set(b.name, b.rowCount === 0 ? false : defaultExpanded);
      }
    }

    const colWidths = mode.groupDisplay === "section-heading"
      ? computeColumnWidths(dataset, contentColumnIds, "14px sans-serif")
      : [];
    const colWidthsCss = colWidths.map((w) => `${w}px`).join(" ");
    const showSummary = props.showGroupSummary ?? false;

    if (mode.groupDisplay === "table-row" && mode.contentDisplay === "table") {
      this.renderSpreadsheet(container, dataset, boundaries, contentColumnIds, keyColumnId, showSummary);
    } else {
      this.renderSectioned(container, dataset, boundaries, contentColumnIds, mode.contentDisplay, colWidths, colWidthsCss, showSummary);
    }

    this.attachToggleListeners(container, dataset);
  }

  private renderSpreadsheet(
    container: HTMLDivElement,
    dataset: TypedDataSet,
    boundaries: readonly GroupBoundary[],
    contentColumns: readonly ColumnId[],
    keyColumnId: ColumnId,
    showSummary: boolean,
  ): void {
    const allCols = [keyColumnId, ...contentColumns];
    const headerCells = allCols.map((id) => {
      const col = dataset.columns.find((c) => c.id === id);
      return `<th>${col?.name ?? String(id)}</th>`;
    }).join("");

    let bodyHtml = "";
    for (let gi = 0; gi < boundaries.length; gi++) {
      const b = boundaries[gi]!;
      const expanded = this._expandState.get(b.name) ?? true;
      bodyHtml += renderGroupTableRowHeader(b, allCols.length, expanded, this._instanceId, gi, showSummary);

      if (expanded) {
        for (let r = b.startRow; r < b.startRow + b.rowCount; r++) {
          const row = dataset.rows[r]!;
          const cells = [`<td></td>`, ...contentColumns.map((id) => `<td>${cellToDisplay(row.cell(id))}</td>`)].join("");
          bodyHtml += `<tr>${cells}</tr>`;
        }
      }
    }

    container.innerHTML = `<div class="pages-grouped-view">
      <table><thead><tr>${headerCells}</tr></thead><tbody>${bodyHtml}</tbody></table>
    </div>`;
  }

  private renderSectioned(
    container: HTMLDivElement,
    dataset: TypedDataSet,
    boundaries: readonly GroupBoundary[],
    contentColumns: readonly ColumnId[],
    contentDisplay: "table" | "list",
    colWidths: readonly number[],
    colWidthsCss: string,
    showSummary: boolean,
  ): void {
    const isListMode = contentDisplay === "list";
    const headerBarItems = contentColumns.map((id) => {
      const col = dataset.columns.find((c) => c.id === id);
      const label = col?.name ?? String(id);
      if (isListMode) {
        return `<span class="col-label">${label}</span>`;
      }
      return `<button class="col-header" data-column="${String(id)}">${label}</button>`;
    }).join("");

    let sectionsHtml = "";
    for (let gi = 0; gi < boundaries.length; gi++) {
      const b = boundaries[gi]!;
      const expanded = this._expandState.get(b.name) ?? true;
      sectionsHtml += renderGroupSectionHeader(b, expanded, this._instanceId, gi, showSummary);

      if (isListMode) {
        sectionsHtml += renderContentList(dataset, b, contentColumns, colWidthsCss, this._instanceId, gi, expanded);
      } else {
        sectionsHtml += renderContentTable(dataset, b, contentColumns, colWidths, this._instanceId, gi, expanded);
      }
    }

    const modeClass = isListMode ? "list-mode" : "sectioned";
    container.innerHTML = `<div class="pages-grouped-view ${modeClass}">
      <div class="column-header-bar" style="grid-template-columns: ${colWidthsCss}">${headerBarItems}</div>
      ${sectionsHtml}
    </div>`;
  }

  private attachToggleListeners(container: HTMLDivElement, dataset: TypedDataSet): void {
    const buttons = container.querySelectorAll("[data-group]");
    for (const btn of buttons) {
      btn.addEventListener("click", (e) => {
        const groupName = (e.currentTarget as HTMLElement).getAttribute("data-group")!;
        const wasExpanded = this._expandState.get(groupName) ?? true;
        this._expandState.set(groupName, !wasExpanded);

        this.dispatchEvent(new CustomEvent("pages-event", {
          bubbles: true,
          composed: true,
          detail: {
            topic: "group-toggle",
            payload: { group: groupName, expanded: !wasExpanded },
          },
        }));

        if (wasExpanded) {
          const controlsId = (e.currentTarget as HTMLElement).getAttribute("aria-controls");
          if (controlsId) {
            const content = this.shadowRoot.getElementById(controlsId);
            if (content?.contains(document.activeElement)) {
              (e.currentTarget as HTMLElement).focus();
            }
          }
        }

        this.render(container, this.props!, dataset);
      });
    }
  }
}

customElements.define("pages-grouped-view", PagesGroupedView);
