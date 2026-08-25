import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { buildContainerTree, simpleTestFactory } from "./test-harness.js";
import { createContainer, containerizeEntry } from "./container.js";
import type { Layout, Entry } from "./types.js";

const LEAF_LAYOUTS: Layout[] = ["tabbed", "accordion", "free"];

describe("2-level layout matrix", () => {
  let host: HTMLElement;

  beforeEach(() => {
    host = document.createElement("div");
    host.style.cssText = "width:800px;height:600px;position:relative;";
    Object.defineProperty(host, "clientWidth", { value: 800, configurable: true });
    Object.defineProperty(host, "clientHeight", { value: 600, configurable: true });
    document.body.appendChild(host);
  });

  afterEach(() => {
    document.body.removeChild(host);
  });

  for (const outer of LEAF_LAYOUTS) {
    for (const inner of LEAF_LAYOUTS) {
      describe(`${outer} > ${inner}`, () => {
        it("renders both levels with correct DOM structure", () => {
          const { root } = buildContainerTree({
            levels: [
              { layout: outer, entryCount: 2, nestedAt: 0 },
              { layout: inner, entryCount: 2 },
            ],
          });
          root.mount(host);

          expect(host.children.length).toBeGreaterThan(0);

          const childHost = host.querySelector("[data-child-host]");
          expect(childHost).not.toBeNull();

          const leaves = host.querySelectorAll("[data-test-leaf]");
          expect(leaves.length).toBeGreaterThan(0);

          root.dispose();
        });

        it("inner layout switch preserves outer structure", () => {
          const { root, containers } = buildContainerTree({
            levels: [
              { layout: outer, entryCount: 2, nestedAt: 0 },
              { layout: inner, entryCount: 2 },
            ],
          });
          root.mount(host);

          const innerContainer = containers.get("L1")!;
          const otherLayout: Layout = inner === "tabbed" ? "accordion" : "tabbed";
          innerContainer.setLayout(otherLayout);

          expect(host.children.length).toBeGreaterThan(0);

          const leaves = host.querySelectorAll("[data-test-leaf]");
          expect(leaves.length).toBeGreaterThan(0);

          root.dispose();
        });

        it("outer layout switch preserves inner content", () => {
          const { root } = buildContainerTree({
            levels: [
              { layout: outer, entryCount: 2, nestedAt: 0 },
              { layout: inner, entryCount: 2 },
            ],
          });
          root.mount(host);

          const otherOuter: Layout = outer === "tabbed" ? "accordion" : "tabbed";
          root.setLayout(otherOuter);

          const leaves = host.querySelectorAll("[data-test-leaf]");
          expect(leaves.length).toBeGreaterThan(0);

          root.dispose();
        });
      });
    }
  }
});

describe("3-level deep nesting", () => {
  let host: HTMLElement;

  beforeEach(() => {
    host = document.createElement("div");
    host.style.cssText = "width:800px;height:600px;position:relative;";
    Object.defineProperty(host, "clientWidth", { value: 800, configurable: true });
    Object.defineProperty(host, "clientHeight", { value: 600, configurable: true });
    document.body.appendChild(host);
  });

  afterEach(() => {
    document.body.removeChild(host);
  });

  for (const l1 of LEAF_LAYOUTS) {
    for (const l2 of LEAF_LAYOUTS) {
      for (const l3 of LEAF_LAYOUTS) {
        it(`${l1} > ${l2} > ${l3} renders all three levels`, () => {
          const { root } = buildContainerTree({
            levels: [
              { layout: l1, entryCount: 2, nestedAt: 0 },
              { layout: l2, entryCount: 2, nestedAt: 0 },
              { layout: l3, entryCount: 2 },
            ],
          });
          root.mount(host);

          const leaves = host.querySelectorAll("[data-test-leaf]");
          expect(leaves.length).toBeGreaterThan(0);

          root.dispose();
        });
      }
    }
  }
});

describe("split containers in nested trees", () => {
  let host: HTMLElement;

  beforeEach(() => {
    host = document.createElement("div");
    host.style.cssText = "width:800px;height:600px;position:relative;";
    Object.defineProperty(host, "clientWidth", { value: 800, configurable: true });
    Object.defineProperty(host, "clientHeight", { value: 600, configurable: true });
    document.body.appendChild(host);
  });

  afterEach(() => {
    document.body.removeChild(host);
  });

  for (const splitDir of ["splith", "splitv"] as const) {
    for (const leafLayout of LEAF_LAYOUTS) {
      it(`${splitDir} at root with ${leafLayout} leaves renders`, () => {
        const { root } = buildContainerTree({
          levels: [
            { layout: splitDir, entryCount: 2, nestedAt: 0 },
            { layout: leafLayout, entryCount: 2 },
          ],
        });
        root.mount(host);

        const splitContainer = host.querySelector("[data-split-container]");
        expect(splitContainer).not.toBeNull();

        const leaves = host.querySelectorAll("[data-test-leaf]");
        expect(leaves.length).toBeGreaterThan(0);

        root.dispose();
      });

      it(`${leafLayout} at root with ${splitDir} nested renders`, () => {
        const { root } = buildContainerTree({
          levels: [
            { layout: leafLayout, entryCount: 2, nestedAt: 0 },
            { layout: splitDir, entryCount: 2 },
          ],
        });
        root.mount(host);

        const leaves = host.querySelectorAll("[data-test-leaf]");
        expect(leaves.length).toBeGreaterThan(0);

        root.dispose();
      });
    }
  }
});

describe("containerize/flatten round-trip across layouts", () => {
  let host: HTMLElement;

  beforeEach(() => {
    host = document.createElement("div");
    document.body.appendChild(host);
  });

  afterEach(() => {
    document.body.removeChild(host);
  });

  const COLLAPSIBLE_LAYOUTS: Layout[] = ["tabbed", "accordion"];
  for (const layout of COLLAPSIBLE_LAYOUTS) {
    it(`containerize + flatten in ${layout} preserves content`, () => {
      const factory = simpleTestFactory();
      const entry: Entry = {
        key: "target",
        label: "Target",
        component: { type: "html", props: { content: "original" } },
      };
      const container = createContainer({
        entries: [entry, { key: "sibling", label: "Sibling" }],
        layout,
        contentFactory: factory,
        depth: 1,
      });
      container.mount(host);

      containerizeEntry(entry, container, factory);
      expect(entry.childContainer).toBeDefined();
      expect(entry.component).toBeUndefined();

      container.refreshEntry("target");

      const child = entry.childContainer!;
      if (child.organiser.type !== layout) {
        child.setLayout(layout);
      }
      const childEntries = [...child.entries];
      child.removeEntry(childEntries[1]!.key);

      expect(entry.childContainer).toBeUndefined();
      expect(entry.component).toEqual({ type: "html", props: { content: "original" } });

      container.dispose();
    });
  }
});
