import { LitElement, html, css, type TemplateResult } from "lit";
import { property, state } from "lit/decorators.js";
import { cache } from "lit/directives/cache.js";
import type { DataSetLookup, SortColumn, TypedDataSet } from "@casehubio/pages-data";
import { DataSourceController } from "@casehubio/pages-component";
import type { VizComponentProps } from "./types.js";

export interface PagesDataRequestDetail {
  readonly element: PagesElement<VizComponentProps>;
  readonly lookup: DataSetLookup;
}

export abstract class PagesElement<
  P extends VizComponentProps,
> extends LitElement {
  readonly controller = new DataSourceController({
    onChange: () => { if (!this._batchUpdate) this.requestUpdate(); },
    onRefresh: () => {
      this._dataRequested = false;
      this.requestDataIfNeeded();
    },
  });

  @property({ attribute: false }) props: P | undefined;
  @state() private _theme = "";
  private _batchUpdate = false;
  private _dataRequested = false;
  private _refreshTimer: ReturnType<typeof setInterval> | undefined;
  private _resizeObserver: ResizeObserver | undefined;
  private _prevProps: P | undefined;

  get loading(): boolean { return this.controller.loading; }
  set loading(v: boolean) { this.controller.loading = v; }

  get dataSet(): TypedDataSet | undefined { return this.controller.dataSet as TypedDataSet | undefined; }
  set dataSet(value: TypedDataSet | undefined) { this.controller.dataSet = value; }

  get totalRows(): number { return this.controller.totalRows; }
  set totalRows(value: number) { this.controller.totalRows = value; }

  get theme(): string { return this._theme; }
  set theme(value: string) { this._theme = value; }

  get error(): string { return this.controller.error; }
  set error(value: string) { this.controller.error = value; }

  get activeSort(): SortColumn | undefined { return this.controller.activeSort; }
  set activeSort(value: SortColumn | undefined) { this.controller.activeSort = value; }

  get activePage(): number | undefined { return this.controller.activePage; }
  set activePage(value: number | undefined) { this.controller.activePage = value; }

  // ── Lifecycle ───────────────────────────────────────────────────────

  override connectedCallback(): void {
    super.connectedCallback();
    this._dataRequested = false;
    this.startResizeObserver();
    this.requestDataIfNeeded();
    this.startRefreshTimer();
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this._dataRequested = false;
    this.stopRefreshTimer();
    this.stopResizeObserver();
  }

  override willUpdate(): void {
    const newProps = this.props;
    const oldProps = this._prevProps;
    if (newProps !== oldProps) {
      this._prevProps = newProps;
      const oldLookup = oldProps?.lookup;
      const oldInterval = oldProps?.refresh?.interval;
      this._batchUpdate = true;
      if (oldProps !== undefined && newProps?.lookup !== oldLookup) {
        this._dataRequested = false;
        this.controller.dataSet = undefined;
      }
      this._batchUpdate = false;
      this.requestDataIfNeeded();
      if (newProps?.refresh?.interval !== oldInterval) {
        this.startRefreshTimer();
      }
    }
  }

  // ── Render dispatch with cache() ────────────────────────────────────

  override render(): TemplateResult {
    if (this.controller.error) return this.renderError(this.controller.error);
    const showContent = !!this.props && !this.controller.loading && !!this.controller.dataSet;
    return html`${cache(showContent
      ? this.renderContent(this.props!, this.controller.dataSet as TypedDataSet)
      : this.renderLoading()
    )}`;
  }

  static override styles = css`
    @keyframes pages-pulse { 0%,100% { opacity: 0.4; } 50% { opacity: 1; } }
    [data-pages-loading] { padding: 12px; }
    .pages-skeleton { height: 14px; border-radius: var(--pages-radius-sm, 4px); background: var(--pages-neutral-2, #f0f0f0); margin-bottom: 10px; animation: pages-pulse 1.5s ease-in-out infinite; }
    .pages-skeleton:nth-child(2) { width: 80%; }
    .pages-skeleton:nth-child(3) { width: 60%; }
    [data-pages-error] { padding: 12px; border: 1px solid var(--pages-neutral-6, #e0e0e0); border-radius: var(--pages-radius-sm, 4px); background: var(--pages-neutral-1, #fff); }
    .pages-error-icon { display: inline; margin-right: 6px; }
    .pages-error-msg { color: var(--pages-neutral-12, #333); font-size: var(--pages-font-size-base, 14px); }
    [data-pages-retry] { margin-top: 8px; padding: 4px 12px; border: 1px solid var(--pages-accent-9, #5470c6); background: transparent; color: var(--pages-accent-9, #5470c6); border-radius: var(--pages-radius-sm, 4px); cursor: pointer; font-size: 13px; }
    [data-pages-retry]:hover { background: var(--pages-accent-3, #e8eaf6); }
  `;

  protected renderLoading(): TemplateResult {
    return html`
      <div data-pages-loading>
        <div class="pages-skeleton"></div>
        <div class="pages-skeleton" style="width:80%"></div>
        <div class="pages-skeleton" style="width:60%"></div>
      </div>
    `;
  }

  protected renderError(message: string): TemplateResult {
    return html`
      <div data-pages-error>
        <span class="pages-error-icon">⚠</span>
        <span class="pages-error-msg">${message}</span>
        ${this.props?.lookup ? html`
          <button data-pages-retry @click=${this._handleRetry}>Retry</button>
        ` : ""}
      </div>
    `;
  }

  // ── Data request ────────────────────────────────────────────────────

  private requestDataIfNeeded(): void {
    if (!this.isConnected) return;
    if (this._dataRequested) return;
    const lookup = this.props?.lookup;
    if (!lookup) return;
    this._dataRequested = true;
    this.dispatchEvent(
      new CustomEvent<PagesDataRequestDetail>("pages-data-request", {
        bubbles: true, composed: true,
        detail: { element: this, lookup },
      }),
    );
  }

  // ── Refresh timer ───────────────────────────────────────────────────

  private startRefreshTimer(): void {
    this.stopRefreshTimer();
    const interval = this.props?.refresh?.interval;
    if (!interval || !this.isConnected) return;
    this._refreshTimer = setInterval(() => {
      this._dataRequested = false;
      this.requestDataIfNeeded();
    }, interval);
  }

  private stopRefreshTimer(): void {
    if (this._refreshTimer !== undefined) {
      clearInterval(this._refreshTimer);
      this._refreshTimer = undefined;
    }
  }

  // ── Resize observer ─────────────────────────────────────────────────

  private startResizeObserver(): void {
    this.stopResizeObserver();
    if (typeof ResizeObserver === "undefined") return;
    this._resizeObserver = new ResizeObserver(() => { this.onResize(); });
    this._resizeObserver.observe(this);
  }

  private stopResizeObserver(): void {
    if (this._resizeObserver) {
      this._resizeObserver.disconnect();
      this._resizeObserver = undefined;
    }
  }

  private _handleRetry = (): void => {
    this.controller.error = "";
    this._dataRequested = false;
    this.requestDataIfNeeded();
  };

  protected onResize(): void {}

  protected abstract renderContent(props: P, dataset: TypedDataSet): TemplateResult;
}
