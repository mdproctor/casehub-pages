import { createActivationCallback } from "./activation.js";
import { registerPanel, clearPanelRegistry } from "./panel-registry.js";
import type { Component } from "@casehubio/pages-component/dist/model/types.js";

describe("host-panel activation", () => {
  afterEach(() => { clearPanelRegistry(); });

  function activate(component: Component): HTMLElement {
    const el = document.createElement("div");
    el.dataset.componentId = "test-panel";
    el.dataset.componentType = "host-panel";
    const registry = new Map();
    const pagePathMap = new Map();
    const callback = createActivationCallback(registry, pagePathMap);
    callback(el, component);
    return el;
  }

  it("mounts registered Web Component into container", () => {
    customElements.define("test-wc-1", class extends HTMLElement {});
    registerPanel("test-type", "test-wc-1");
    const el = activate({ type: "host-panel", props: { typeName: "test-type" } });
    expect(el.querySelector("test-wc-1")).toBeTruthy();
  });

  it("calls configure(props) before appendChild", () => {
    const configureOrder: string[] = [];
    customElements.define("test-cfg-2", class extends HTMLElement {
      configure(props: Record<string, unknown>) {
        configureOrder.push("configure");
      }
      connectedCallback() {
        configureOrder.push("connected");
      }
    });
    registerPanel("cfg-type", "test-cfg-2");
    const el = activate({
      type: "host-panel",
      props: { typeName: "cfg-type", panelProps: { doc: "abc" } },
    });
    document.body.appendChild(el);
    expect(configureOrder).toEqual(["configure", "connected"]);
    document.body.removeChild(el);
  });

  it("renders error placeholder for unregistered type", () => {
    const el = activate({ type: "host-panel", props: { typeName: "missing" } });
    expect(el.textContent).toContain("Unknown panel type");
    expect(el.querySelector("*[data-component-type]")).toBeNull();
  });

  it("uses ConfigurablePanel interface for configure() call", () => {
    const configured: Record<string, unknown>[] = [];
    customElements.define("test-cfg-iface", class extends HTMLElement {
      configure(props: Record<string, unknown>) {
        configured.push(props);
      }
    });
    registerPanel("cfg-iface", "test-cfg-iface");
    activate({
      type: "host-panel",
      props: { typeName: "cfg-iface", panelProps: { endpoint: "/api" } },
    });
    expect(configured).toEqual([{ endpoint: "/api" }]);
  });

  it("dispatches pages-data-request when lookup is present", () => {
    const received: Array<{ element: unknown; lookup: unknown }> = [];
    customElements.define("test-data-panel", class extends HTMLElement {
      private _data: unknown;
      private _error = "";
      get dataSet() { return this._data; }
      set dataSet(v: unknown) { this._data = v; this._error = ""; }
      get error() { return this._error; }
      set error(v: string) { this._error = v; this._data = undefined; }
      configure(props: Record<string, unknown>) { void props; }
    });
    registerPanel("data-panel", "test-data-panel");

    const container = document.createElement("div");
    container.addEventListener("pages-data-request", ((e: Event) => {
      const detail = (e as CustomEvent).detail;
      received.push({ element: detail.element, lookup: detail.lookup });
    }));
    document.body.appendChild(container);

    const el = document.createElement("div");
    el.dataset.componentId = "data-test";
    el.dataset.componentType = "host-panel";
    container.appendChild(el);

    const registry = new Map();
    const pagePathMap = new Map();
    const callback = createActivationCallback(registry, pagePathMap);
    callback(el, {
      type: "host-panel",
      props: {
        typeName: "data-panel",
        lookup: { dataSetId: "items", operations: [] },
        panelProps: { mode: "list" },
      },
    });

    expect(received).toHaveLength(1);
    expect(received[0]!.lookup).toEqual({ dataSetId: "items", operations: [] });
    expect(registry.get("data-test")?.vizElement).toBeDefined();
    expect(registry.get("data-test")?.originalLookup).toEqual({ dataSetId: "items", operations: [] });

    document.body.removeChild(container);
  });

  it("warns and skips data binding when panel lacks DataReceiver properties", () => {
    const warns: string[] = [];
    const origWarn = console.warn;
    console.warn = (...args: unknown[]) => { warns.push(String(args[0])); };

    customElements.define("test-no-data", class extends HTMLElement {
      configure(props: Record<string, unknown>) { void props; }
    });
    registerPanel("no-data", "test-no-data");
    const el = activate({
      type: "host-panel",
      props: {
        typeName: "no-data",
        lookup: { dataSetId: "items", operations: [] },
        panelProps: {},
      },
    });
    expect(warns.some(w => w.includes("lacks DataReceiver"))).toBe(true);

    // verify panel IS appended to DOM
    expect(el.querySelector("test-no-data")).toBeTruthy();

    // verify registry entry has no data binding
    const registry = new Map();
    const pagePathMap = new Map();
    const callback = createActivationCallback(registry, pagePathMap);
    const testEl = document.createElement("div");
    testEl.dataset.componentId = "verify-test";
    callback(testEl, {
      type: "host-panel",
      props: {
        typeName: "no-data",
        lookup: { dataSetId: "items", operations: [] },
        panelProps: {},
      },
    });
    const entry = registry.get("verify-test");
    expect(entry?.vizElement).toBeUndefined();

    console.warn = origWarn;
  });

  it("proxy forwards dataSet and error to panel", () => {
    customElements.define("test-proxy-fwd", class extends HTMLElement {
      private _data: unknown;
      private _error = "";
      get dataSet() { return this._data; }
      set dataSet(v: unknown) { this._data = v; this._error = ""; }
      get error() { return this._error; }
      set error(v: string) { this._error = v; this._data = undefined; }
      configure(props: Record<string, unknown>) { void props; }
    });
    registerPanel("proxy-fwd", "test-proxy-fwd");

    const el = document.createElement("div");
    el.dataset.componentId = "proxy-test";
    el.dataset.componentType = "host-panel";
    const registry = new Map();
    const pagePathMap = new Map();

    const container = document.createElement("div");
    container.appendChild(el);
    document.body.appendChild(container);

    const callback = createActivationCallback(registry, pagePathMap);
    callback(el, {
      type: "host-panel",
      props: {
        typeName: "proxy-fwd",
        lookup: { dataSetId: "test", operations: [] },
      },
    });

    const entry = registry.get("proxy-test");
    expect(entry?.vizElement).toBeDefined();

    entry!.vizElement!.dataSet = { columns: [], rows: [] };
    const panel = el.querySelector("test-proxy-fwd");
    expect(panel.dataSet).toEqual({ columns: [], rows: [] });

    entry!.vizElement!.error = "something broke";
    expect(panel.error).toBe("something broke");
    expect(panel.dataSet).toBeUndefined();

    document.body.removeChild(container);
  });
});
