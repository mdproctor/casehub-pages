import type { DataSetLookup } from "@casehubio/pages-data/dist/dataset/lookup.js";
import type { SortColumn } from "@casehubio/pages-data/dist/dataset/sort.js";
import type { TypedDataSet } from "@casehubio/pages-data/dist/dataset/types.js";
import { DataSourceController } from "@casehubio/pages-component/dist/controller/data-source-controller.js";
import type { VizComponentProps } from "./types.js";

export interface PagesDataRequestDetail {
  readonly element: PagesElement<VizComponentProps>;
  readonly lookup: DataSetLookup;
}

export abstract class PagesElement<
  P extends VizComponentProps,
> extends HTMLElement {
  declare readonly shadowRoot: ShadowRoot;

  readonly controller = new DataSourceController({
    onChange: () => { if (!this._batchUpdate) this.update(); },
  });

  private _props: P | undefined;
  private _theme = "";
  private _renderGen = 0;
  private _batchUpdate = false;
  private _dataRequested = false;
  private _refreshTimer: ReturnType<typeof setInterval> | undefined;
  private _resizeObserver: ResizeObserver | undefined;

  protected readonly container: HTMLDivElement;

  constructor() {
    super();
    const shadow = this.attachShadow({ mode: "open" });
    this.container = document.createElement("div");
    this.container.style.width = "100%";
    shadow.appendChild(this.container);
  }

  // ── Properties ──────────────────────────────────────────────────────

  get props(): P | undefined {
    return this._props;
  }

  set props(value: P | undefined) {
    const oldLookup = this._props?.lookup;
    const oldInterval = this._props?.refresh?.interval;
    this._props = value;

    this._batchUpdate = true;
    if (value?.lookup !== oldLookup) {
      this._dataRequested = false;
      this.controller.dataSet = undefined;
    }
    this._batchUpdate = false;

    this.requestDataIfNeeded();
    if (value?.refresh?.interval !== oldInterval) {
      this.startRefreshTimer();
    }
    this.update();
  }

  get loading(): boolean {
    return this.controller.loading;
  }

  set loading(v: boolean) {
    this.controller.loading = v;
  }

  get dataSet(): TypedDataSet | undefined {
    return this.controller.dataSet as TypedDataSet | undefined;
  }

  set dataSet(value: TypedDataSet | undefined) {
    this.controller.dataSet = value;
  }

  get totalRows(): number {
    return this.controller.totalRows;
  }

  set totalRows(value: number) {
    this.controller.totalRows = value;
  }

  get theme(): string {
    return this._theme;
  }

  set theme(value: string) {
    this._theme = value;
    this.update();
  }

  get error(): string {
    return this.controller.error;
  }

  set error(value: string) {
    this.controller.error = value;
  }

  get activeSort(): SortColumn | undefined {
    return this.controller.activeSort;
  }

  set activeSort(value: SortColumn | undefined) {
    this.controller.activeSort = value;
  }

  get activePage(): number | undefined {
    return this.controller.activePage;
  }

  set activePage(value: number | undefined) {
    this.controller.activePage = value;
  }

  protected get renderGen(): number {
    return this._renderGen;
  }

  // ── Lifecycle ───────────────────────────────────────────────────────

  connectedCallback(): void {
    this.requestDataIfNeeded();
    this.startRefreshTimer();
    this.startResizeObserver();
    this.update();
  }

  disconnectedCallback(): void {
    this._dataRequested = false;
    this.stopRefreshTimer();
    this.stopResizeObserver();
  }

  // ── Data request ────────────────────────────────────────────────────

  private requestDataIfNeeded(): void {
    if (!this.isConnected) return;
    if (this._dataRequested) return;

    const lookup = this._props?.lookup;
    if (!lookup) return;

    this._dataRequested = true;
    this.dispatchEvent(
      new CustomEvent<PagesDataRequestDetail>("pages-data-request", {
        bubbles: true,
        composed: true,
        detail: { element: this, lookup },
      }),
    );
  }

  // ── Refresh timer ───────────────────────────────────────────────────

  private startRefreshTimer(): void {
    this.stopRefreshTimer();

    const interval = this._props?.refresh?.interval;
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

    this._resizeObserver = new ResizeObserver(() => {
      this.onResize();
    });
    this._resizeObserver.observe(this.container);
  }

  private stopResizeObserver(): void {
    if (this._resizeObserver) {
      this._resizeObserver.disconnect();
      this._resizeObserver = undefined;
    }
  }

  // ── Update / render pipeline ────────────────────────────────────────

  private update(): void {
    if (!this.isConnected) return;

    ++this._renderGen;

    if (this.controller.error) {
      this.renderError(this.container, this.controller.error);
      return;
    }

    if (!this._props) {
      this.renderLoading(this.container);
      return;
    }

    if (this.controller.loading || !this.controller.dataSet) {
      this.renderLoading(this.container);
      return;
    }

    this.render(this.container, this._props, this.controller.dataSet as TypedDataSet);
  }

  // ── Default renderers ───────────────────────────────────────────────

  protected renderLoading(container: HTMLDivElement): void {
    container.textContent = "";
    const style = document.createElement("style");
    style.textContent = `
@keyframes pages-pulse { 0%,100% { opacity: 0.4; } 50% { opacity: 1; } }
[data-pages-loading] { padding: 12px; }
.pages-skeleton { height: 14px; border-radius: var(--pages-radius-sm, 4px); background: var(--pages-neutral-2, #f0f0f0); margin-bottom: 10px; animation: pages-pulse 1.5s ease-in-out infinite; }
.pages-skeleton:nth-child(2) { width: 80%; }
.pages-skeleton:nth-child(3) { width: 60%; }
`;
    container.appendChild(style);

    const wrapper = document.createElement("div");
    wrapper.setAttribute("data-pages-loading", "");
    for (let i = 0; i < 3; i++) {
      const bar = document.createElement("div");
      bar.className = "pages-skeleton";
      wrapper.appendChild(bar);
    }
    container.appendChild(wrapper);
  }

  protected renderError(container: HTMLDivElement, message: string): void {
    container.textContent = "";
    const style = document.createElement("style");
    style.textContent = `
[data-pages-error] { padding: 12px; border: 1px solid var(--pages-neutral-6, #e0e0e0); border-radius: var(--pages-radius-sm, 4px); background: var(--pages-neutral-1, #fff); }
.pages-error-icon { display: inline; margin-right: 6px; }
.pages-error-msg { color: var(--pages-neutral-12, #333); font-size: var(--pages-font-size-base, 14px); }
[data-pages-retry] { margin-top: 8px; padding: 4px 12px; border: 1px solid var(--pages-accent-9, #5470c6); background: transparent; color: var(--pages-accent-9, #5470c6); border-radius: var(--pages-radius-sm, 4px); cursor: pointer; font-size: 13px; }
[data-pages-retry]:hover { background: var(--pages-accent-3, #e8eaf6); }
`;
    container.appendChild(style);

    const wrapper = document.createElement("div");
    wrapper.setAttribute("data-pages-error", "");

    const icon = document.createElement("span");
    icon.className = "pages-error-icon";
    icon.textContent = "⚠";
    wrapper.appendChild(icon);

    const msg = document.createElement("span");
    msg.className = "pages-error-msg";
    msg.textContent = message;
    wrapper.appendChild(msg);

    if (this._props?.lookup) {
      const retryBtn = document.createElement("button");
      retryBtn.setAttribute("data-pages-retry", "");
      retryBtn.textContent = "Retry";
      retryBtn.addEventListener("click", () => {
        this.controller.error = "";
        this._dataRequested = false;
        this.requestDataIfNeeded();
        this.update();
      });
      wrapper.appendChild(retryBtn);
    }

    container.appendChild(wrapper);
  }

  // ── Resize hook ─────────────────────────────────────────────────────

  protected onResize(): void {
    // Default no-op — subclasses override
  }

  // ── Abstract ────────────────────────────────────────────────────────

  protected abstract render(
    container: HTMLDivElement,
    props: P,
    dataset: TypedDataSet,
  ): void;
}
