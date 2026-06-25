import type { DataSetLookup } from "@casehubio/pages-data/dist/dataset/lookup.js";
import type { SortColumn } from "@casehubio/pages-data/dist/dataset/sort.js";
import type { TypedDataSet } from "@casehubio/pages-data/dist/dataset/types.js";
import type { VizComponentProps } from "./types.js";

export interface CasehubDataRequestDetail {
  readonly element: CasehubElement<VizComponentProps>;
  readonly lookup: DataSetLookup;
}

export abstract class CasehubElement<
  P extends VizComponentProps,
> extends HTMLElement {
  declare readonly shadowRoot: ShadowRoot;

  private _props: P | undefined;
  private _dataset: TypedDataSet | undefined;
  private _totalRows = -1;
  private _theme = "";
  private _error = "";
  private _dataRequested = false;
  private _refreshTimer: ReturnType<typeof setInterval> | undefined;
  private _resizeObserver: ResizeObserver | undefined;
  private _activeSort: SortColumn | undefined;
  private _activePage: number | undefined;

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

    if (value?.lookup !== oldLookup) {
      this._dataRequested = false;
      this._dataset = undefined;
    }

    this.requestDataIfNeeded();
    if (value?.refresh?.interval !== oldInterval) {
      this.startRefreshTimer();
    }
    this.update();
  }

  get dataSet(): TypedDataSet | undefined {
    return this._dataset;
  }

  set dataSet(value: TypedDataSet | undefined) {
    this._error = "";
    this._dataset = value;
    this.update();
  }

  get totalRows(): number {
    return this._totalRows;
  }

  set totalRows(value: number) {
    this._totalRows = value;
    this.update();
  }

  get theme(): string {
    return this._theme;
  }

  set theme(value: string) {
    this._theme = value;
    this.update();
  }

  get error(): string {
    return this._error;
  }

  set error(value: string) {
    this._dataset = undefined;
    this._error = value;
    this.update();
  }

  get activeSort(): SortColumn | undefined {
    return this._activeSort;
  }

  set activeSort(value: SortColumn | undefined) {
    this._activeSort = value;
  }

  get activePage(): number | undefined {
    return this._activePage;
  }

  set activePage(value: number | undefined) {
    this._activePage = value;
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
      new CustomEvent<CasehubDataRequestDetail>("casehub-data-request", {
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

    if (this._error) {
      this.renderError(this.container, this._error);
      return;
    }

    if (!this._props) {
      this.renderLoading(this.container);
      return;
    }

    if (!this._dataset) {
      this.renderLoading(this.container);
      return;
    }

    this.render(this.container, this._props, this._dataset);
  }

  // ── Default renderers ───────────────────────────────────────────────

  protected renderLoading(container: HTMLDivElement): void {
    container.textContent = "";
    const style = document.createElement("style");
    style.textContent = `
@keyframes casehub-pulse { 0%,100% { opacity: 0.4; } 50% { opacity: 1; } }
[data-casehub-loading] { padding: 12px; }
.casehub-skeleton { height: 14px; border-radius: var(--casehub-radius, 4px); background: var(--casehub-bg-alt, #f0f0f0); margin-bottom: 10px; animation: casehub-pulse 1.5s ease-in-out infinite; }
.casehub-skeleton:nth-child(2) { width: 80%; }
.casehub-skeleton:nth-child(3) { width: 60%; }
`;
    container.appendChild(style);

    const wrapper = document.createElement("div");
    wrapper.setAttribute("data-casehub-loading", "");
    for (let i = 0; i < 3; i++) {
      const bar = document.createElement("div");
      bar.className = "casehub-skeleton";
      wrapper.appendChild(bar);
    }
    container.appendChild(wrapper);
  }

  protected renderError(container: HTMLDivElement, message: string): void {
    container.textContent = "";
    const style = document.createElement("style");
    style.textContent = `
[data-casehub-error] { padding: 12px; border: 1px solid var(--casehub-border, #e0e0e0); border-radius: var(--casehub-radius, 4px); background: var(--casehub-bg, #fff); }
.casehub-error-icon { display: inline; margin-right: 6px; }
.casehub-error-msg { color: var(--casehub-text, #333); font-size: var(--casehub-font-size, 14px); }
[data-casehub-retry] { margin-top: 8px; padding: 4px 12px; border: 1px solid var(--casehub-accent, #5470c6); background: transparent; color: var(--casehub-accent, #5470c6); border-radius: var(--casehub-radius, 4px); cursor: pointer; font-size: 13px; }
[data-casehub-retry]:hover { background: var(--casehub-accent-subtle, #e8eaf6); }
`;
    container.appendChild(style);

    const wrapper = document.createElement("div");
    wrapper.setAttribute("data-casehub-error", "");

    const icon = document.createElement("span");
    icon.className = "casehub-error-icon";
    icon.textContent = "⚠";
    wrapper.appendChild(icon);

    const msg = document.createElement("span");
    msg.className = "casehub-error-msg";
    msg.textContent = message;
    wrapper.appendChild(msg);

    if (this._props?.lookup) {
      const retryBtn = document.createElement("button");
      retryBtn.setAttribute("data-casehub-retry", "");
      retryBtn.textContent = "Retry";
      retryBtn.addEventListener("click", () => {
        this._error = "";
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
