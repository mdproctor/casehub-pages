import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createContainer, containerizeEntry, flattenEntry } from "./container";
import type { Entry, ContentFactory } from "./types.js";
import { DEFAULT_POLICY, SPLIT_POLICY } from "./types.js";

function testFactory(): ContentFactory {
  return (entry) => {
    const el = document.createElement("div");
    el.textContent = `Content: ${entry.key}`;
    el.dataset.testKey = entry.key;
    return { element: el, dispose: () => el.remove() };
  };
}

function makeEntries(...keys: string[]): Entry[] {
  return keys.map((key) => ({ key, label: key.toUpperCase() }));
}

describe("Group", () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  it("mounts with tab organiser", () => {
    const group = createContainer({
      entries: makeEntries("a", "b"),
      layout: "tabbed",
      contentFactory: testFactory(),
    });
    group.mount(container);

    expect(group.organiser.type).toBe("tabbed");
    const strip = container.querySelector("[data-tab-strip]");
    expect(strip).not.toBeNull();
  });

  it("mounts with accordion organiser", () => {
    const group = createContainer({
      entries: makeEntries("a", "b"),
      layout: "accordion",
      contentFactory: testFactory(),
    });
    group.mount(container);

    expect(group.organiser.type).toBe("accordion");
    const sections = container.querySelectorAll("[data-section-key]");
    expect(sections).toHaveLength(2);
  });

  it("toggle tab→accordion preserves content elements", () => {
    const group = createContainer({
      entries: makeEntries("a", "b"),
      layout: "tabbed",
      contentFactory: testFactory(),
    });
    group.mount(container);

    // Activate both tabs to create both content elements
    const tabB = container.querySelector(
      "[data-tab-key='b']",
    ) as HTMLElement;
    tabB.dispatchEvent(
      new PointerEvent("pointerdown", { bubbles: true }),
    );
    document.dispatchEvent(new PointerEvent("pointerup"));
    const contentB = container.querySelector("[data-test-key='b']")!;
    const tabA = container.querySelector(
      "[data-tab-key='a']",
    ) as HTMLElement;
    tabA.dispatchEvent(
      new PointerEvent("pointerdown", { bubbles: true }),
    );
    document.dispatchEvent(new PointerEvent("pointerup"));
    const contentA = container.querySelector("[data-test-key='a']")!;

    // Toggle to accordion
    group.setLayout("accordion");

    // Same DOM elements should be reused
    const accordionA = container.querySelector("[data-test-key='a']")!;
    const accordionB = container.querySelector("[data-test-key='b']")!;
    expect(accordionA).toBe(contentA);
    expect(accordionB).toBe(contentB);
  });

  it("toggle accordion→tab preserves content elements", () => {
    const group = createContainer({
      entries: makeEntries("a", "b"),
      layout: "accordion",
      contentFactory: testFactory(),
    });
    group.mount(container);

    const contentA = container.querySelector("[data-test-key='a']")!;

    group.setLayout("tabbed");

    const tabContentA = container.querySelector("[data-test-key='a']")!;
    expect(tabContentA).toBe(contentA);
  });

  it("toggle roundtrip: tab→accordion→tab preserves elements", () => {
    const group = createContainer({
      entries: makeEntries("a"),
      layout: "tabbed",
      contentFactory: testFactory(),
    });
    group.mount(container);

    const original = container.querySelector("[data-test-key='a']")!;

    group.setLayout("accordion");
    group.setLayout("tabbed");

    const afterRoundtrip = container.querySelector("[data-test-key='a']")!;
    expect(afterRoundtrip).toBe(original);
  });

  it("respects policy — rejects disallowed organiser", () => {
    const group = createContainer({
      entries: makeEntries("a"),
      layout: "tabbed",
      policy: { allowedLayouts: ["tabbed"], maxDepth: 3 },
      contentFactory: testFactory(),
    });
    group.mount(container);

    expect(() => group.setLayout("accordion")).toThrow(
      /not allowed by policy/,
    );
  });

  it("addEntry adds to current organiser", () => {
    const group = createContainer({
      entries: makeEntries("a"),
      layout: "tabbed",
      contentFactory: testFactory(),
    });
    group.mount(container);

    group.addEntry({ key: "b", label: "B" });

    expect(group.entries).toHaveLength(2);
    const buttons = container.querySelectorAll("[data-tab-key]");
    expect(buttons).toHaveLength(2);
  });

  it("removeEntry removes from current organiser", () => {
    const group = createContainer({
      entries: makeEntries("a", "b"),
      layout: "tabbed",
      contentFactory: testFactory(),
    });
    group.mount(container);

    group.removeEntry("a");

    expect(group.entries).toHaveLength(1);
    expect(group.entries[0]!.key).toBe("b");
  });

  it("dispose cleans up everything", () => {
    const group = createContainer({
      entries: makeEntries("a", "b"),
      layout: "tabbed",
      contentFactory: testFactory(),
    });
    group.mount(container);
    group.dispose();

    expect(container.children).toHaveLength(0);
  });

  it("always mounts toolbar for container types", () => {
    const group = createContainer({
      entries: makeEntries("a", "b"),
      layout: "tabbed",
      policy: { allowedLayouts: ["tabbed", "accordion"], maxDepth: 3 },
      contentFactory: testFactory(),
    });
    group.mount(container);
    expect(container.querySelector("[data-container-toolbar]")).not.toBeNull();
    group.dispose();
  });

  it("hides toolbar for content type", () => {
    const group = createContainer({
      entries: makeEntries("a"),
      layout: "content",
      policy: { allowedLayouts: ["content"], maxDepth: 3 },
      contentFactory: testFactory(),
    });
    group.mount(container);
    const toolbar = container.querySelector("[data-container-toolbar]") as HTMLElement;
    expect(toolbar?.style.display).toBe("none");
    group.dispose();
  });

  it("content organiser renders entry content directly", () => {
    const group = createContainer({
      entries: makeEntries("a"),
      layout: "content",
      policy: { allowedLayouts: ["content"], maxDepth: 3 },
      contentFactory: testFactory(),
    });
    group.mount(container);
    expect(container.querySelector("[data-test-key='a']")).not.toBeNull();
    group.dispose();
  });

  it("mounts toolbar even with single allowed organiser", () => {
    const group = createContainer({
      entries: makeEntries("a"),
      layout: "tabbed",
      policy: { allowedLayouts: ["tabbed"], maxDepth: 3 },
      contentFactory: testFactory(),
    });
    group.mount(container);
    expect(container.querySelector("[data-container-toolbar]")).not.toBeNull();
    group.dispose();
  });

  describe("tree mutations", () => {
    it("addEntry with index inserts at position", () => {
      const group = createContainer({
        entries: makeEntries("a", "c"),
        layout: "tabbed",
        contentFactory: testFactory(),
      });
      group.mount(container);

      group.addEntry({ key: "b", label: "B" }, 1);

      expect(group.entries).toHaveLength(3);
      expect(group.entries[1]!.key).toBe("b");
    });

    it("replaceChild swaps a child in place", () => {
      const group = createContainer({
        entries: makeEntries("a", "b"),
        layout: "tabbed",
        contentFactory: testFactory(),
      });
      group.mount(container);

      group.replaceChild("a", { key: "x", label: "X" });

      expect(group.entries).toHaveLength(2);
      expect(group.entries[0]!.key).toBe("x");
      expect(group.entries[1]!.key).toBe("b");
    });

    it("replaceChild throws for unknown key", () => {
      const group = createContainer({
        entries: makeEntries("a"),
        layout: "tabbed",
        contentFactory: testFactory(),
      });
      group.mount(container);

      expect(() => group.replaceChild("z", { key: "x", label: "X" })).toThrow(/not found/);
    });
  });

  describe("state preservation across layout switches", () => {
    it("preserves free-layout positions through tabbed round trip", () => {
      const group = createContainer({
        entries: [
          { key: "a", label: "A", meta: { free: { x: 10, y: 20, width: 200, height: 150 } } },
          { key: "b", label: "B", meta: { free: { x: 300, y: 50, width: 250, height: 180 } } },
        ],
        layout: "free",
        contentFactory: testFactory(),
      });
      group.mount(container);

      group.setLayout("tabbed");
      group.setLayout("free");

      expect(group.entries[0]!.meta?.free).toEqual({ x: 10, y: 20, width: 200, height: 150 });
      expect(group.entries[1]!.meta?.free).toEqual({ x: 300, y: 50, width: 250, height: 180 });
    });

    it("preserves tabbed active key through accordion round trip", () => {
      const group = createContainer({
        entries: makeEntries("a", "b", "c"),
        layout: "tabbed",
        contentFactory: testFactory(),
      });
      group.mount(container);

      // Activate tab B
      const tabB = container.querySelector("[data-tab-key='b']") as HTMLElement;
      tabB.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
      document.dispatchEvent(new PointerEvent("pointerup"));

      group.setLayout("accordion");
      group.setLayout("tabbed");

      // Tab B should still be active
      const state = group.organiser.getState() as import("./types.js").TabState;
      expect(state.activeKey).toBe("b");
    });

    it("preserves accordion collapsed state through tabbed round trip", () => {
      const group = createContainer({
        entries: [
          { key: "a", label: "A", meta: { accordion: { height: 100, collapsed: true } } },
          { key: "b", label: "B", meta: { accordion: { height: 200, collapsed: false } } },
        ],
        layout: "accordion",
        contentFactory: testFactory(),
      });
      group.mount(container);

      group.setLayout("tabbed");
      group.setLayout("accordion");

      expect(group.entries[0]!.meta?.accordion?.collapsed).toBe(true);
    });

    it("defaults free-layout positions when no saved state exists", () => {
      const group = createContainer({
        entries: makeEntries("a", "b"),
        layout: "tabbed",
        contentFactory: testFactory(),
      });
      group.mount(container);

      group.setLayout("free");

      // Should have assigned some position (not undefined)
      expect(group.entries[0]!.meta?.free).toBeDefined();
    });
  });

  describe("split layout via Container", () => {
    it("creates a splith Container", () => {
      const group = createContainer({
        entries: makeEntries("a", "b"),
        layout: "splith",
        policy: { allowedLayouts: ["splith"], maxDepth: 3 },
        contentFactory: testFactory(),
      });
      group.mount(container);

      expect(group.organiser.type).toBe("splith");
      const panes = container.querySelectorAll("[data-split-pane]");
      expect(panes).toHaveLength(2);
    });

    it("creates a splitv Container", () => {
      const group = createContainer({
        entries: makeEntries("a", "b"),
        layout: "splitv",
        policy: { allowedLayouts: ["splitv"], maxDepth: 3 },
        contentFactory: testFactory(),
      });
      group.mount(container);

      expect(group.organiser.type).toBe("splitv");
      const splitContainer = container.querySelector("[data-split-container]") as HTMLElement;
      expect(splitContainer.style.flexDirection).toBe("column");
    });

    it("fires onCollapse when split reduces to 1 child", () => {
      let collapsedKey: string | undefined;
      const group = createContainer({
        entries: makeEntries("a", "b"),
        layout: "splith",
        policy: { allowedLayouts: ["splith"], maxDepth: 3 },
        contentFactory: testFactory(),
        onCollapse: (remaining) => { collapsedKey = remaining.key; },
      });
      group.mount(container);

      group.removeEntry("a");
      expect(collapsedKey).toBe("b");
    });
  });

  describe("Entry.childContainer", () => {
    it("entry can hold a childContainer", () => {
      const child = createContainer({
        entries: [{ key: "inner", label: "Inner" }],
        layout: "tabbed",
        contentFactory: testFactory(),
        depth: 2,
      });
      const entry: Entry = { key: "outer", label: "Outer", childContainer: child };
      expect(entry.childContainer).toBe(child);
      expect(entry.childContainer!.depth).toBe(2);
      child.dispose();
    });

    it("entry without childContainer is a leaf", () => {
      const entry: Entry = { key: "leaf", label: "Leaf" };
      expect(entry.childContainer).toBeUndefined();
    });
  });

  describe("policies", () => {
    it("DEFAULT_POLICY allows depth 5", () => {
      expect(DEFAULT_POLICY.maxDepth).toBe(5);
    });

    it("SPLIT_POLICY includes split layouts", () => {
      expect(SPLIT_POLICY.allowedLayouts).toContain("splith");
      expect(SPLIT_POLICY.allowedLayouts).toContain("splitv");
      expect(SPLIT_POLICY.maxDepth).toBe(5);
    });
  });

  describe("containerizeEntry", () => {
    it("converts leaf entry to non-leaf with childContainer", () => {
      const factory = testFactory();
      const entry: Entry = { key: "tab1", label: "Tab 1" };
      entry.component = { type: "html", props: { content: "<p>Hello</p>" } };

      const parent = createContainer({
        entries: [entry],
        layout: "tabbed",
        contentFactory: factory,
      });
      parent.mount(container);

      containerizeEntry(entry, parent, factory);

      expect(entry.childContainer).toBeDefined();
      expect(entry.contentElement).toBeUndefined();
      expect(entry.childContainer!.entries.length).toBe(2);
      expect(entry.childContainer!.entries[0]!.component).toEqual(
        { type: "html", props: { content: "<p>Hello</p>" } }
      );

      parent.dispose();
    });

    it("throws at maxDepth", () => {
      const factory = testFactory();
      const entry: Entry = { key: "tab1", label: "Tab 1" };

      const parent = createContainer({
        entries: [entry],
        layout: "tabbed",
        contentFactory: factory,
        depth: 5,
        policy: { allowedLayouts: ["tabbed"], maxDepth: 5 },
      });
      parent.mount(container);

      expect(() => containerizeEntry(entry, parent, factory)).toThrow(/maximum nesting depth/);
      parent.dispose();
    });

    it("is a no-op on already-nested entry", () => {
      const factory = testFactory();
      const entry: Entry = { key: "tab1", label: "Tab 1" };
      entry.component = { type: "html", props: {} };

      const parent = createContainer({
        entries: [entry],
        layout: "tabbed",
        contentFactory: factory,
      });
      parent.mount(container);

      containerizeEntry(entry, parent, factory);
      const child = entry.childContainer;
      containerizeEntry(entry, parent, factory);
      expect(entry.childContainer).toBe(child);

      parent.dispose();
    });
  });

  describe("flattenEntry", () => {
    it("restores leaf state from remaining child", () => {
      const factory = testFactory();
      const entry: Entry = { key: "tab1", label: "Tab 1" };
      entry.component = { type: "html", props: { content: "<p>Hello</p>" } };

      const parent = createContainer({
        entries: [entry],
        layout: "tabbed",
        contentFactory: factory,
      });
      parent.mount(container);

      containerizeEntry(entry, parent, factory);
      expect(entry.childContainer).toBeDefined();

      const remaining = entry.childContainer!.entries[0]!;
      flattenEntry(entry, remaining, factory);

      expect(entry.childContainer).toBeUndefined();
      expect(entry.component).toEqual(
        { type: "html", props: { content: "<p>Hello</p>" } }
      );

      parent.dispose();
    });

    it("is a no-op on leaf entry", () => {
      const factory = testFactory();
      const entry: Entry = { key: "tab1", label: "Tab 1" };
      const remaining: Entry = { key: "other", label: "Other" };

      flattenEntry(entry, remaining, factory);
      expect(entry.childContainer).toBeUndefined();
    });
  });

  describe("layout-aware flatten", () => {
    function nestingFactory(): ContentFactory {
      return (entry) => {
        if (entry.childContainer) {
          const el = document.createElement("div");
          el.dataset.childHost = entry.key;
          entry.childContainer.mount(el);
          return { element: el, dispose: () => entry.childContainer?.unmount() };
        }
        const el = document.createElement("div");
        el.textContent = `Content: ${entry.key}`;
        el.dataset.testKey = entry.key;
        return { element: el, dispose: () => el.remove() };
      };
    }

    it("auto-flattens when child layout matches parent (tabbed in tabbed)", () => {
      const factory = nestingFactory();
      const entry: Entry = { key: "a", label: "A" };
      entry.component = { type: "html", props: { content: "original" } };
      const parent = createContainer({
        entries: [entry, { key: "b", label: "B" }],
        layout: "tabbed",
        contentFactory: factory,
        depth: 1,
      });
      parent.mount(container);

      containerizeEntry(entry, parent, factory);
      expect(entry.childContainer).toBeDefined();
      parent.refreshEntry("a");

      const child = entry.childContainer!;
      const childEntries = [...child.entries];
      child.removeEntry(childEntries[1]!.key);

      expect(entry.childContainer).toBeUndefined();
      expect(entry.component).toEqual({ type: "html", props: { content: "original" } });
    });

    it("preserves nesting when child layout differs from parent (accordion in tabbed)", () => {
      const factory = nestingFactory();
      const entry: Entry = { key: "a", label: "A" };
      entry.component = { type: "html", props: { content: "original" } };
      const parent = createContainer({
        entries: [entry, { key: "b", label: "B" }],
        layout: "tabbed",
        contentFactory: factory,
        depth: 1,
      });
      parent.mount(container);

      containerizeEntry(entry, parent, factory);
      parent.refreshEntry("a");
      const child = entry.childContainer!;
      child.setLayout("accordion");

      const childEntries = [...child.entries];
      child.removeEntry(childEntries[1]!.key);

      expect(entry.childContainer).toBeDefined();
    });
  });

  describe("refreshEntry", () => {
    it("re-renders a tabbed entry content after childContainer mutation", () => {
      const inner1 = createContainer({
        entries: [{ key: "leaf1", label: "L1" }],
        layout: "tabbed",
        contentFactory: testFactory(),
        depth: 2,
      });

      const childFactory = (e: Entry) => {
        if (e.childContainer) {
          const el = document.createElement("div");
          el.dataset.childHost = "true";
          e.childContainer.mount(el);
          return { element: el, dispose: () => e.childContainer!.unmount() };
        }
        const el = document.createElement("div");
        el.textContent = `Content: ${e.key}`;
        return { element: el };
      };

      const entry: Entry = { key: "host", label: "Host", childContainer: inner1 };
      const outer = createContainer({
        entries: [entry],
        layout: "tabbed",
        contentFactory: childFactory,
        depth: 1,
      });
      outer.mount(container);

      expect(container.querySelector("[data-child-host]")).not.toBeNull();

      const inner2 = createContainer({
        entries: [{ key: "leaf2", label: "L2" }],
        layout: "accordion",
        contentFactory: testFactory(),
        depth: 2,
      });
      inner1.unmount();
      entry.childContainer = inner2;

      outer.refreshEntry("host");

      const newHost = container.querySelector("[data-child-host]");
      expect(newHost).not.toBeNull();
      expect(newHost!.querySelector("[data-accordion-section]")).not.toBeNull();
    });

    it("refreshEntry on inactive tab is safe (no-op until activated)", () => {
      const group = createContainer({
        entries: makeEntries("a", "b"),
        layout: "tabbed",
        contentFactory: testFactory(),
        depth: 1,
      });
      group.mount(container);

      expect(() => group.refreshEntry("b")).not.toThrow();
    });

    it("refreshEntry works on split strategy", () => {
      const inner = createContainer({
        entries: [{ key: "leaf", label: "Leaf" }],
        layout: "tabbed",
        contentFactory: testFactory(),
        depth: 3,
      });

      const splitFactory = (e: Entry) => {
        if (e.childContainer) {
          const el = document.createElement("div");
          el.dataset.splitChild = e.key;
          e.childContainer.mount(el);
          return { element: el, dispose: () => e.childContainer!.unmount() };
        }
        const el = document.createElement("div");
        el.textContent = e.key;
        return { element: el };
      };

      const entryA: Entry = { key: "pane-a", label: "A", childContainer: inner };
      const entryB: Entry = { key: "pane-b", label: "B" };

      const split = createContainer({
        entries: [entryA, entryB],
        layout: "splith",
        contentFactory: splitFactory,
        depth: 2,
        policy: { allowedLayouts: ["tabbed", "accordion", "free", "splith", "splitv"], maxDepth: 5 },
      });
      split.mount(container);

      expect(container.querySelector("[data-split-child='pane-a']")).not.toBeNull();

      const inner2 = createContainer({
        entries: [{ key: "new-leaf", label: "NL" }],
        layout: "accordion",
        contentFactory: testFactory(),
        depth: 3,
      });
      inner.unmount();
      entryA.childContainer = inner2;

      split.refreshEntry("pane-a");

      const refreshed = container.querySelector("[data-split-child='pane-a']");
      expect(refreshed).not.toBeNull();
      expect(refreshed!.querySelector("[data-accordion-section]")).not.toBeNull();
    });

    it("refreshEntry on split preserves sibling pane DOM identity", () => {
      const splitFactory = (e: Entry) => {
        if (e.childContainer) {
          const el = document.createElement("div");
          el.dataset.splitChild = e.key;
          e.childContainer.mount(el);
          return { element: el, dispose: () => e.childContainer!.unmount() };
        }
        const el = document.createElement("div");
        el.textContent = e.key;
        return { element: el };
      };

      const innerA = createContainer({
        entries: [{ key: "a1", label: "A1" }],
        layout: "tabbed",
        contentFactory: testFactory(),
        depth: 3,
      });
      const innerB = createContainer({
        entries: [{ key: "b1", label: "B1" }],
        layout: "tabbed",
        contentFactory: testFactory(),
        depth: 3,
      });

      const entryA: Entry = { key: "pane-a", label: "A", childContainer: innerA };
      const entryB: Entry = { key: "pane-b", label: "B", childContainer: innerB };

      const split = createContainer({
        entries: [entryA, entryB],
        layout: "splith",
        contentFactory: splitFactory,
        depth: 2,
        policy: { allowedLayouts: ["tabbed", "accordion", "free", "splith", "splitv"], maxDepth: 5 },
      });
      split.mount(container);

      const siblingEl = container.querySelector("[data-split-child='pane-b']");
      expect(siblingEl).not.toBeNull();

      const innerA2 = createContainer({
        entries: [{ key: "a2", label: "A2" }],
        layout: "accordion",
        contentFactory: testFactory(),
        depth: 3,
      });
      innerA.unmount();
      entryA.childContainer = innerA2;
      entryA.contentDispose = undefined;

      split.refreshEntry("pane-a");

      const siblingElAfter = container.querySelector("[data-split-child='pane-b']");
      expect(siblingElAfter).toBe(siblingEl);
    });
  });
});
