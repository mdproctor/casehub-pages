import { html, css, type TemplateResult } from "lit";
import { customElement } from "lit/decorators.js";
import type { TypedDataSet } from "@casehubio/pages-data";
import type { IframePluginProps } from "@casehubio/pages-component";
import { toWireDataSet } from "@casehubio/pages-data";
import { PagesElement } from "../base/PagesElement.js";
import type { PagesFilterDetail, PagesFilterApply, PagesFilterReset } from "../base/filter-types.js";
import { cellToRaw } from "../base/cell-extract.js";

@customElement("pages-iframe-plugin")
export class PagesIframePlugin extends PagesElement<IframePluginProps> {
  private _iframe: HTMLIFrameElement | undefined;
  private _messageHandler: ((e: MessageEvent) => void) | undefined;
  private _loaded = false;
  private _pendingProps: IframePluginProps | undefined;
  private _pendingDataset: TypedDataSet | undefined;
  private _currentSrc: string | undefined;

  static override styles = css`
      :host {
        display: block;
      }
      iframe {
        border: none;
        width: 100%;
        height: 100%;
      }
    `;

  override connectedCallback(): void {
    super.connectedCallback();
    this._messageHandler = (e: MessageEvent) => {
      this.handleMessage(e);
    };
    window.addEventListener("message", this._messageHandler);
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    if (this._messageHandler) {
      window.removeEventListener("message", this._messageHandler);
      this._messageHandler = undefined;
    }
  }

  protected override renderContent(
    props: IframePluginProps,
    dataset: TypedDataSet,
  ): TemplateResult {
    const expectedSrc = `/pages/component/${props.componentId}/index.html`;

    // Track if src changed (componentId changed)
    if (this._currentSrc !== expectedSrc) {
      this._currentSrc = expectedSrc;
      this._iframe = undefined;
      this._loaded = false;
    }

    // Store latest data for sending after iframe is ready
    this._pendingProps = props;
    this._pendingDataset = dataset;

    return html`<div id="iframe-host"></div>`;
  }

  override updated(): void {
    const host = this.renderRoot.querySelector("#iframe-host");
    if (!host || !this.props) return;

    const props = this.props;
    const expectedSrc = `/pages/component/${props.componentId}/index.html`;

    // Check if iframe exists with wrong src (componentId changed)
    if (this._iframe && this._iframe.src && !this._iframe.src.endsWith(expectedSrc)) {
      this._iframe.remove();
      this._iframe = undefined;
      this._loaded = false;
    }

    if (!this._iframe) {
      this.createIframe(host as HTMLElement, props);
    }

    // If loaded, send pending messages
    if (this._loaded && this._pendingProps && this._pendingDataset) {
      this.sendMessages(this._pendingProps, this._pendingDataset);
      this._pendingProps = undefined;
      this._pendingDataset = undefined;
    }
  }

  private createIframe(host: HTMLElement, props: IframePluginProps): void {
    host.textContent = "";

    this._iframe = document.createElement("iframe");
    this._iframe.src = `/pages/component/${props.componentId}/index.html`;
    this._iframe.style.width = props.width ?? "100%";
    this._iframe.style.height = props.height ?? "100%";

    this._iframe.addEventListener("load", () => {
      this._loaded = true;
      if (this._pendingProps && this._pendingDataset) {
        this.sendMessages(this._pendingProps, this._pendingDataset);
        this._pendingProps = undefined;
        this._pendingDataset = undefined;
      }
    });

    host.appendChild(this._iframe);
  }

  private sendMessages(props: IframePluginProps, dataset: TypedDataSet): void {
    if (!this._iframe?.contentWindow) return;

    // INIT message
    this._iframe.contentWindow.postMessage(
      {
        type: "INIT",
        properties: {
          COMPONENT_ID: props.componentId,
          MODE: this.theme || "light",
        },
      },
      "*",
    );

    // DATASET message
    const wireDataSet = toWireDataSet(dataset);
    const properties: Record<string, unknown> = {
      COMPONENT_ID: props.componentId,
      DATASET: wireDataSet,
      ...Object.fromEntries(Object.entries(props.settings ?? {})),
    };

    this._iframe.contentWindow.postMessage(
      {
        type: "DATASET",
        properties,
      },
      "*",
    );
  }

  private handleMessage(e: MessageEvent): void {
    const msg = e.data as Record<string, unknown> | null | undefined;
    if (!msg || msg.type !== "FILTER") return;

    const msgProps = msg.properties as Record<string, unknown> | undefined;
    const props = this.props;
    const dataset = this.dataSet;

    if (!props || !dataset) return;
    if (!msgProps || msgProps.COMPONENT_ID !== props.componentId) return;

    const filter = msgProps.FILTER as Record<string, unknown> | undefined;
    if (!filter) return;

    const columnIndex = filter.column;
    if (typeof columnIndex !== "number") return;
    const columnId = dataset.columns[columnIndex]?.id;
    if (!columnId) return;

    const reset = filter.reset;

    // Handle reset before row resolution — reset doesn't need row data
    if (typeof reset === "boolean" && reset) {
      this.dispatchEvent(
        new CustomEvent<PagesFilterDetail>("pages-filter", {
          bubbles: true,
          composed: true,
          detail: {
            columnId,
            reset: true,
            group: props.filter?.group,
          } satisfies PagesFilterReset,
        }),
      );
      return;
    }

    // Apply path — resolve row and value
    const rowIndex = filter.row;
    if (typeof rowIndex !== "number") return;

    const rowObj = dataset.rows[rowIndex];
    if (!rowObj) return;

    const cell = rowObj.cell(columnId);
    if (cell.type === "NULL") return;
    const value = String(cellToRaw(cell));

    this.dispatchEvent(
      new CustomEvent<PagesFilterDetail>("pages-filter", {
        bubbles: true,
        composed: true,
        detail: {
          columnId,
          value,
          row: rowObj,
          reset: false,
          group: props.filter?.group,
        } satisfies PagesFilterApply,
      }),
    );
  }
}
