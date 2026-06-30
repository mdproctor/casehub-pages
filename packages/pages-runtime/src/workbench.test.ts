import { loadSite } from "./site.js";
import { registerPanel, clearPanelRegistry } from "./panel-registry.js";
import type { Component } from "@casehubio/pages-component/dist/model/types.js";

describe("workbench integration", () => {
  afterEach(() => {
    clearPanelRegistry();
    history.replaceState(null, "", location.pathname);
  });

  it("renders a full workbench with split, dockBar, and hostPanel", async () => {
    // Register a test Web Component
    customElements.define("test-panel", class extends HTMLElement {
      configure(props: Record<string, unknown>) {
        this.textContent = `Panel: ${String(props.name ?? "")}`;
      }
    });
    registerPanel("test", "test-panel");

    const target = document.createElement("div");
    document.body.appendChild(target);

    const workbench: Component = {
      type: "rows",
      slots: {
        default: [
          // Topbar
          { type: "html", props: { content: "<h1>App</h1>" } },
          // Main content with dock bar and split
          {
            type: "split",
            props: { direction: "horizontal", ratio: [70, 30] },
            slots: {
              "0": [{ type: "host-panel", id: "main", props: { typeName: "test", panelProps: { name: "Main" } } }],
              "1": [{ type: "host-panel", id: "side", props: { typeName: "test", panelProps: { name: "Side" } } }],
            },
          },
        ],
      },
    };

    const site = await loadSite(target, workbench);

    // Verify split rendered with flex
    const splitEl = target.querySelector('[data-component-type="split"]') as HTMLElement;
    expect(splitEl).toBeTruthy();
    expect(splitEl.style.display).toBe("flex");

    // Verify hosted panels mounted
    const panels = target.querySelectorAll("test-panel");
    expect(panels).toHaveLength(2);
    expect(panels[0]!.textContent).toBe("Panel: Main");
    expect(panels[1]!.textContent).toBe("Panel: Side");

    // Verify drag handle
    const handle = target.querySelector("[data-split-handle]");
    expect(handle).toBeTruthy();

    site.dispose();
    document.body.removeChild(target);
  });

  it("dock toggle hides panel and redistributes space", async () => {
    customElements.define("test-panel-2", class extends HTMLElement {});
    registerPanel("p2", "test-panel-2");

    const target = document.createElement("div");
    document.body.appendChild(target);

    const workbench: Component = {
      type: "split",
      props: { direction: "horizontal", ratio: [70, 30] },
      slots: {
        "0": [{ type: "host-panel", props: { typeName: "p2" } }],
        "1": [{ type: "host-panel", id: "toggled", props: { typeName: "p2" } }],
      },
    };

    const site = await loadSite(target, workbench);

    // Toggle panel hidden
    target.dispatchEvent(new CustomEvent("pages-dock-toggle", {
      bubbles: true,
      composed: true,
      detail: { panelId: "toggled", visible: false },
    }));

    const toggledSlot = target.querySelector('[data-component-id="toggled"]')!
      .closest("[data-slot]") as HTMLElement;
    expect(toggledSlot.style.display).toBe("none");

    // Toggle back visible
    target.dispatchEvent(new CustomEvent("pages-dock-toggle", {
      bubbles: true,
      composed: true,
      detail: { panelId: "toggled", visible: true },
    }));
    expect(toggledSlot.style.display).not.toBe("none");

    site.dispose();
    document.body.removeChild(target);
  });
});
