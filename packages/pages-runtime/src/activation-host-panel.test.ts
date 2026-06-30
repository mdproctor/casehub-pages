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
});
