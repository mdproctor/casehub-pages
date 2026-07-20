import { html, type TemplateResult, type PropertyValues } from "lit";
import { createRef, ref } from "lit/directives/ref.js";
import { init, use, type ECharts } from "echarts/core";
import { CanvasRenderer } from "echarts/renderers";
import { TitleComponent } from "echarts/components";
import { PagesElement } from "./PagesElement.js";
import type { VizComponentProps } from "./types.js";
import type { TypedDataSet, Column } from "@casehubio/pages-data";
import type { ChartSettings } from "@casehubio/pages-component";
import type { PagesFilterDetail, PagesFilterApply, PagesFilterReset, ChartClickParams } from "./filter-types.js";
import { cellToRaw } from "./cell-extract.js";

use([CanvasRenderer, TitleComponent]);

export abstract class PagesChartElement<
  P extends VizComponentProps & ChartSettings,
> extends PagesElement<P> {
  private _chartRef = createRef<HTMLDivElement>();
  private _chart: ECharts | undefined;
  private _chartContainer: HTMLDivElement | undefined;
  private _currentTheme = "";
  private _selectedValue: string | undefined;
  private _selectedDataIndex: number | undefined;
  private _renderGen = 0;

  protected override renderContent(_props: P, _dataset: TypedDataSet): TemplateResult {
    return html`<div ${ref(this._chartRef)} style="width:100%;min-height:300px;overflow:hidden"></div>`;
  }

  override render(): TemplateResult {
    if (this.props) this.applySizing(this.props);
    return super.render();
  }

  override updated(changed: PropertyValues): void {
    super.updated(changed);
    const container = this._chartRef.value;
    if (!container || !this.props || !this.dataSet) return;

    ++this._renderGen;
    const gen = this._renderGen;
    const chart = this.ensureChart(container);
    const result = this.buildOption(this.props, this.dataSet);

    const apply = (option: Record<string, unknown>): void => {
      if (this._renderGen !== gen) return;
      chart.setOption(option, true);
      if (this._selectedValue !== undefined && this._selectedDataIndex !== undefined) {
        this.syncHighlight(chart, undefined, this._selectedDataIndex);
      }
    };

    if (result instanceof Promise) {
      void result.then(apply).catch((e: unknown) => {
        if (this._renderGen !== gen) return;
        this.error = e instanceof Error ? e.message : String(e);
      });
    } else {
      apply(result);
    }
  }

  override get dataSet(): TypedDataSet | undefined {
    return super.dataSet;
  }

  override set dataSet(value: TypedDataSet | undefined) {
    super.dataSet = value;
    if (this._selectedValue !== undefined && value) {
      const filterCol = this.resolveFilterColumn();
      if (filterCol) {
        const idx = value.rows.findIndex(r => {
          const cell = r.cell(filterCol.id);
          return cell.type !== "NULL" && String(cellToRaw(cell)) === this._selectedValue;
        });
        if (idx >= 0) {
          this._selectedDataIndex = idx;
        } else {
          this._selectedValue = undefined;
          this._selectedDataIndex = undefined;
        }
      }
    }
  }

  protected resolveFilterColumn(): Column | undefined {
    return this.dataSet?.columns[0];
  }

  private applySizing(props: P): void {
    const raw = props as Readonly<Record<string, unknown>>;
    const h = raw.height;
    if (typeof h === "number") {
      this.style.minHeight = `${String(h)}px`;
      this.style.height = `${String(h)}px`;
    } else if (typeof h === "string") {
      this.style.minHeight = h;
      this.style.height = h;
    } else {
      this.style.minHeight = "300px";
    }
    const w = raw.width;
    if (typeof w === "number") {
      this.style.width = `${String(w)}px`;
    } else if (typeof w === "string") {
      this.style.width = w;
    } else {
      this.style.width = "100%";
    }
  }

  abstract buildOption(
    props: P,
    dataset: TypedDataSet,
  ): Record<string, unknown> | Promise<Record<string, unknown>>;

  private ensureChart(container: HTMLDivElement): ECharts {
    if (this._chart && (this._currentTheme !== this.theme || container !== this._chartContainer)) {
      this._chart.dispose();
      this._chart = undefined;
    }
    if (!this._chart) {
      this._currentTheme = this.theme;
      this._chartContainer = container;
      this._chart = init(container, this.theme || "", undefined);
      this.registerClickHandler(this._chart);
    }
    return this._chart;
  }

  private registerClickHandler(chart: ECharts): void {
    chart.on("click", (params) => {
      const clickParams = params as unknown as ChartClickParams;
      const filter = this.props?.filter;
      if (!filter?.enabled) return;
      const ds = this.dataSet;
      if (!ds) return;
      const filterCol = this.resolveFilterColumn();
      if (!filterCol) return;
      const row = ds.rows[clickParams.dataIndex];
      if (!row) return;
      const cell = row.cell(filterCol.id);
      if (cell.type === "NULL") return;
      const value = String(cellToRaw(cell));

      if (value === this._selectedValue) {
        const prevIndex = this._selectedDataIndex;
        this._selectedValue = undefined;
        this._selectedDataIndex = undefined;
        this.syncHighlight(chart, prevIndex, undefined);
        this.dispatchEvent(
          new CustomEvent<PagesFilterDetail>("pages-filter", {
            bubbles: true, composed: true,
            detail: { columnId: filterCol.id, reset: true, group: filter.group } satisfies PagesFilterReset,
          }),
        );
      } else {
        const prevIndex = this._selectedDataIndex;
        this._selectedValue = value;
        this._selectedDataIndex = clickParams.dataIndex;
        this.syncHighlight(chart, prevIndex, clickParams.dataIndex);
        this.dispatchEvent(
          new CustomEvent<PagesFilterDetail>("pages-filter", {
            bubbles: true, composed: true,
            detail: { columnId: filterCol.id, value, row, reset: false, group: filter.group } satisfies PagesFilterApply,
          }),
        );
      }
    });
  }

  private syncHighlight(chart: ECharts, prevIndex: number | undefined, newIndex: number | undefined): void {
    const seriesCount = (chart.getOption().series as unknown[]).length;
    const seriesIndex = Array.from({ length: seriesCount }, (_, i) => i);
    if (prevIndex !== undefined) {
      chart.dispatchAction({ type: "downplay", seriesIndex, dataIndex: prevIndex });
    }
    if (newIndex !== undefined) {
      chart.dispatchAction({ type: "highlight", seriesIndex, dataIndex: newIndex });
    }
  }

  override onResize(): void {
    this._chart?.resize();
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    if (this._chart) {
      this._chart.dispose();
      this._chart = undefined;
    }
    this._chartContainer = undefined;
    this._selectedValue = undefined;
    this._selectedDataIndex = undefined;
  }
}
