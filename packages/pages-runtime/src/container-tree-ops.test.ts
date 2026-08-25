import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { findLeafContainer, findContainerWithTab, findParentOf, forEachLeafContainer, isSplitLayout, captureContainerState, restoreContainerFromState } from "./container-tree-ops.js";
import { createContainer } from "./frame-sandbox/index.js";
import { buildContainerTree, simpleTestFactory } from "./frame-sandbox/test-harness.js";
import type { Entry, Layout, ContentFactory, Container } from "./frame-sandbox/types.js";

function simpleFactory(): ContentFactory {
  return (entry) => {
    const el = document.createElement("div");
    el.textContent = entry.key;
    return { element: el };
  };
}

describe("container-tree-ops", () => {
  let host: HTMLElement;

  beforeEach(() => {
    host = document.createElement("div");
    document.body.appendChild(host);
  });

  afterEach(() => {
    document.body.removeChild(host);
  });

  describe("isSplitLayout", () => {
    it("returns true for splith and splitv", () => {
      expect(isSplitLayout("splith")).toBe(true);
      expect(isSplitLayout("splitv")).toBe(true);
    });

    it("returns false for non-split layouts", () => {
      expect(isSplitLayout("tabbed")).toBe(false);
      expect(isSplitLayout("accordion")).toBe(false);
      expect(isSplitLayout("free")).toBe(false);
    });
  });

  describe("findContainerWithTab", () => {
    it("finds tab in a flat container", () => {
      const c = createContainer({
        entries: [{ key: "a", label: "A" }, { key: "b", label: "B" }],
        layout: "tabbed",
        contentFactory: simpleFactory(),
      });
      expect(findContainerWithTab(c, "a")).toBe(c);
      expect(findContainerWithTab(c, "z")).toBeNull();
    });

    it("finds tab in a nested container via childContainer", () => {
      const inner = createContainer({
        entries: [{ key: "deep", label: "Deep" }],
        layout: "tabbed",
        contentFactory: simpleFactory(),
        depth: 2,
      });
      const entry: Entry = { key: "host", label: "Host", childContainer: inner };
      const outer = createContainer({
        entries: [entry],
        layout: "tabbed",
        contentFactory: simpleFactory(),
        depth: 1,
      });
      expect(findContainerWithTab(outer, "deep")).toBe(inner);
    });
  });

  describe("findLeafContainer", () => {
    it("returns the container itself when it has leaf entries", () => {
      const c = createContainer({
        entries: [{ key: "a", label: "A" }],
        layout: "tabbed",
        contentFactory: simpleFactory(),
      });
      expect(findLeafContainer(c)).toBe(c);
    });

    it("traverses to nested leaf via childContainer", () => {
      const inner = createContainer({
        entries: [{ key: "leaf", label: "Leaf" }],
        layout: "tabbed",
        contentFactory: simpleFactory(),
        depth: 2,
      });
      const entry: Entry = { key: "host", label: "Host", childContainer: inner };
      const outer = createContainer({
        entries: [entry],
        layout: "tabbed",
        contentFactory: simpleFactory(),
        depth: 1,
      });
      expect(findLeafContainer(outer)).toBe(inner);
    });

    it("respects predicate", () => {
      const c = createContainer({
        entries: [{ key: "a", label: "A" }],
        layout: "tabbed",
        contentFactory: simpleFactory(),
      });
      expect(findLeafContainer(c, () => false)).toBeNull();
      expect(findLeafContainer(c, () => true)).toBe(c);
    });
  });

  describe("findParentOf", () => {
    it("returns parent container and entry for a nested child", () => {
      const inner = createContainer({
        entries: [{ key: "leaf", label: "Leaf" }],
        layout: "tabbed",
        contentFactory: simpleFactory(),
        depth: 2,
      });
      const entry: Entry = { key: "host", label: "Host", childContainer: inner };
      const outer = createContainer({
        entries: [entry],
        layout: "tabbed",
        contentFactory: simpleFactory(),
        depth: 1,
      });

      const result = findParentOf(outer, inner);
      expect(result).not.toBeNull();
      expect(result!.container).toBe(outer);
      expect(result!.entry).toBe(entry);
    });

    it("returns null for root container", () => {
      const c = createContainer({
        entries: [{ key: "a", label: "A" }],
        layout: "tabbed",
        contentFactory: simpleFactory(),
      });
      expect(findParentOf(c, c)).toBeNull();
    });
  });

  describe("forEachLeafContainer", () => {
    it("visits leaf containers with their pane key", () => {
      const inner = createContainer({
        entries: [{ key: "leaf", label: "Leaf" }],
        layout: "tabbed",
        contentFactory: simpleFactory(),
        depth: 2,
      });
      const entry: Entry = { key: "host", label: "Host", childContainer: inner };
      const outer = createContainer({
        entries: [entry, { key: "sibling", label: "Sibling" }],
        layout: "tabbed",
        contentFactory: simpleFactory(),
        depth: 1,
      });

      const visited: Array<{ paneKey: string | undefined }> = [];
      forEachLeafContainer(outer, (c, paneKey) => {
        visited.push({ paneKey });
      });

      expect(visited).toHaveLength(2);
      expect(visited[0]!.paneKey).toBe("host");
      expect(visited[1]!.paneKey).toBeUndefined();
    });
  });

  describe("captureContainerState", () => {
    it("serializes a flat container", () => {
      const c = createContainer({
        entries: [
          { key: "a", label: "A", component: { type: "html", props: {} } },
          { key: "b", label: "B", component: { type: "chart", props: {} } },
        ],
        layout: "tabbed",
        contentFactory: simpleFactory(),
      });
      c.mount(host);

      const state = captureContainerState(c);
      expect(state.layout).toBe("tabbed");
      expect(state.tabs).toHaveLength(2);
      expect(state.tabs[0]!.key).toBe("a");
      expect(state.tabs[0]!.content).toEqual({ type: "html", props: {} });
    });

    it("serializes nested containers recursively", () => {
      const inner = createContainer({
        entries: [{ key: "deep", label: "D", component: { type: "html", props: {} } }],
        layout: "accordion",
        contentFactory: simpleFactory(),
        depth: 2,
      });
      const entry: Entry = { key: "host", label: "Host", childContainer: inner };
      const outer = createContainer({
        entries: [entry],
        layout: "tabbed",
        contentFactory: simpleFactory(),
        depth: 1,
      });
      outer.mount(host);

      const state = captureContainerState(outer);
      expect(state.tabs[0]!.children).toBeDefined();
      expect(state.tabs[0]!.children!.layout).toBe("accordion");
      expect(state.tabs[0]!.children!.tabs[0]!.key).toBe("deep");
    });
  });

  describe("persistence round-trip", () => {
    const FULL_POLICY = { allowedLayouts: ["tabbed", "accordion", "free", "splith", "splitv"] as Layout[], maxDepth: 10 };

    const splitFactory: ContentFactory = (e: Entry) => {
      if (e.childContainer) {
        const el = document.createElement("div");
        el.dataset.splitChild = e.key;
        e.childContainer.mount(el);
        return { element: el, dispose: () => e.childContainer?.unmount() };
      }
      const el = document.createElement("div");
      el.textContent = e.key;
      return { element: el };
    };

    function testCreateLeaf(_fk: string, entries: Entry[]): Container {
      return createContainer({
        entries,
        layout: "tabbed",
        contentFactory: simpleTestFactory(),
        policy: FULL_POLICY,
      });
    }

    function testCreateSplit(_fk: string, dir: "splith" | "splitv", children: Array<{ key: string; child: Container }>): Container {
      const entries: Entry[] = children.map(c => ({
        key: c.key,
        label: c.key,
        childContainer: c.child,
      }));
      return createContainer({
        entries,
        layout: dir,
        contentFactory: splitFactory,
        policy: FULL_POLICY,
      });
    }

    const LEAF_LAYOUTS: Layout[] = ["tabbed", "accordion", "free"];

    for (const l1 of LEAF_LAYOUTS) {
      for (const l2 of LEAF_LAYOUTS) {
        it(`${l1} > ${l2} survives capture → restore`, () => {
          const { root } = buildContainerTree({
            levels: [
              { layout: l1, entryCount: 2, nestedAt: 0 },
              { layout: l2, entryCount: 2 },
            ],
          });
          root.mount(host);

          const state = captureContainerState(root);
          root.dispose();

          expect(state.layout).toBe(l1);
          expect(state.tabs).toHaveLength(2);
          expect(state.tabs[0]!.children).toBeDefined();
          expect(state.tabs[0]!.children!.layout).toBe(l2);
          expect(state.tabs[0]!.children!.tabs).toHaveLength(2);

          const restored = restoreContainerFromState(
            state, "test", simpleTestFactory(), {}, 1,
            testCreateLeaf, testCreateSplit,
          );
          restored.mount(host);

          const leaves = host.querySelectorAll("[data-test-leaf]");
          expect(leaves.length).toBeGreaterThan(0);

          restored.dispose();
        });
      }
    }
  });
});
