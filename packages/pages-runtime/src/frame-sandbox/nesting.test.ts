import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createContainer, containerizeEntry } from "./container";
import type { Container } from "./container";
import type { ContentFactory, Entry } from "./types.js";

function groupFactory(childGroup: Container): ContentFactory {
  return (entry) => {
    const el = document.createElement("div");
    el.dataset.testKey = entry.key;
    childGroup.mount(el);
    return {
      element: el,
      dispose: () => childGroup.dispose(),
    };
  };
}

function simpleFactory(): ContentFactory {
  return (entry) => {
    const el = document.createElement("div");
    el.textContent = `Leaf: ${entry.key}`;
    el.dataset.testKey = entry.key;
    return { element: el };
  };
}

describe("Recursive nesting", () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  it("2-level nesting: tab inside tab", () => {
    const innerGroup = createContainer({
      entries: [
        { key: "inner-a", label: "Inner A" },
        { key: "inner-b", label: "Inner B" },
      ],
      layout: "tabbed",
      contentFactory: simpleFactory(),
      depth: 2,
    });

    const outerGroup = createContainer({
      entries: [{ key: "outer", label: "Outer" }],
      layout: "tabbed",
      contentFactory: groupFactory(innerGroup),
      depth: 1,
    });

    outerGroup.mount(container);

    const innerStrips = container.querySelectorAll("[data-tab-strip]");
    expect(innerStrips.length).toBeGreaterThanOrEqual(2);
  });

  it("3-level nesting works", () => {
    const level3 = createContainer({
      entries: [{ key: "leaf", label: "Leaf" }],
      layout: "accordion",
      contentFactory: simpleFactory(),
      depth: 3,
    });

    const level2 = createContainer({
      entries: [{ key: "mid", label: "Mid" }],
      layout: "tabbed",
      contentFactory: groupFactory(level3),
      depth: 2,
    });

    const level1 = createContainer({
      entries: [{ key: "top", label: "Top" }],
      layout: "tabbed",
      contentFactory: groupFactory(level2),
      depth: 1,
    });

    level1.mount(container);

    const leaf = container.querySelector("[data-test-key='leaf']");
    expect(leaf).not.toBeNull();
    expect(leaf!.textContent).toBe("Leaf: leaf");
  });

  it("rejects nesting beyond maxDepth", () => {
    expect(() => {
      createContainer({
        entries: [{ key: "x", label: "X" }],
        layout: "tabbed",
        contentFactory: simpleFactory(),
        depth: 4,
        policy: {
          allowedLayouts: ["tabbed", "accordion"],
          maxDepth: 3,
        },
      });
    }).toThrow(/maximum nesting depth/);
  });

  it("toggle at nested level preserves content", () => {
    const innerGroup = createContainer({
      entries: [
        { key: "inner-a", label: "A" },
        { key: "inner-b", label: "B" },
      ],
      layout: "tabbed",
      contentFactory: simpleFactory(),
      depth: 2,
    });

    const outerGroup = createContainer({
      entries: [{ key: "host", label: "Host" }],
      layout: "tabbed",
      contentFactory: groupFactory(innerGroup),
      depth: 1,
    });

    outerGroup.mount(container);

    const innerContent = container.querySelector(
      "[data-test-key='inner-a']",
    )!;

    innerGroup.setLayout("accordion");

    const afterToggle = container.querySelector(
      "[data-test-key='inner-a']",
    )!;
    expect(afterToggle).toBe(innerContent);
  });

  it("full toggle matrix: free-layout↔tab↔accordion", () => {
    const group = createContainer({
      entries: [
        { key: "a", label: "A" },
        { key: "b", label: "B" },
      ],
      layout: "tabbed",
      contentFactory: simpleFactory(),
    });
    group.mount(container);

    const contentA = container.querySelector("[data-test-key='a']")!;

    // tab → accordion
    group.setLayout("accordion");
    expect(container.querySelector("[data-test-key='a']")).toBe(contentA);

    // accordion → free-layout
    group.setLayout("free");
    expect(container.querySelector("[data-test-key='a']")).toBe(contentA);

    // free-layout → tab
    group.setLayout("tabbed");
    expect(container.querySelector("[data-test-key='a']")).toBe(contentA);

    // tab → free-layout
    group.setLayout("free");
    expect(container.querySelector("[data-test-key='a']")).toBe(contentA);

    // free-layout → accordion
    group.setLayout("accordion");
    expect(container.querySelector("[data-test-key='a']")).toBe(contentA);
  });

  describe("split toolbar isolation", () => {
    it("split child toolbar + adds tab to its own container, not sibling", () => {
      const childLeft = createContainer({
        entries: [
          { key: "a", label: "A" },
          { key: "b", label: "B" },
        ],
        layout: "tabbed",
        contentFactory: simpleFactory(),
        depth: 1,
      });

      const childRight = createContainer({
        entries: [{ key: "c", label: "C" }],
        layout: "tabbed",
        contentFactory: simpleFactory(),
        depth: 1,
      });

      const split = createContainer({
        entries: [
          { key: "pane-1", label: "pane-1", childContainer: childLeft },
          { key: "pane-2", label: "pane-2", childContainer: childRight },
        ],
        layout: "splith",
        contentFactory: (entry: Entry) => {
          if (entry.childContainer) {
            const el = document.createElement("div");
            entry.childContainer.mount(el);
            return { element: el, dispose: () => entry.childContainer!.dispose() };
          }
          return { element: document.createElement("div") };
        },
        depth: 1,
        showToolbar: false,
      });

      split.mount(container);

      const leftCountBefore = childLeft.entries.length;
      const rightCountBefore = childRight.entries.length;

      const rightStrip = container.querySelectorAll("[data-tab-strip]")[1] as HTMLElement;
      const rightToolbar = rightStrip?.querySelector("[data-container-toolbar]") as HTMLElement;
      const addBtn = Array.from(rightToolbar?.children ?? []).find(
        el => el.textContent === "+"
      ) as HTMLElement;

      expect(addBtn).toBeTruthy();
      addBtn.click();

      expect(childRight.entries.length).toBe(rightCountBefore + 1);
      expect(childLeft.entries.length).toBe(leftCountBefore);
    });

    it("split container does not leak its toolbar into child tab strips", () => {
      const childLeft = createContainer({
        entries: [
          { key: "a", label: "A" },
          { key: "b", label: "B" },
        ],
        layout: "tabbed",
        contentFactory: simpleFactory(),
        depth: 1,
      });

      const childRight = createContainer({
        entries: [{ key: "c", label: "C" }],
        layout: "tabbed",
        contentFactory: simpleFactory(),
        depth: 1,
      });

      const split = createContainer({
        entries: [
          { key: "pane-1", label: "pane-1", childContainer: childLeft },
          { key: "pane-2", label: "pane-2", childContainer: childRight },
        ],
        layout: "splith",
        contentFactory: (entry: Entry) => {
          if (entry.childContainer) {
            const el = document.createElement("div");
            entry.childContainer.mount(el);
            return { element: el, dispose: () => entry.childContainer!.dispose() };
          }
          return { element: document.createElement("div") };
        },
        depth: 1,
      });

      split.mount(container);

      const allStrips = container.querySelectorAll("[data-tab-strip]");
      for (const strip of allStrips) {
        const toolbars = strip.querySelectorAll("[data-container-toolbar]");
        expect(toolbars.length).toBeLessThanOrEqual(1);
      }
    });
  });

  describe("toolbar isolation", () => {
    it("parent strip has exactly one toolbar after containerizeEntry", () => {
      const entry: Entry = { key: "tab-a", label: "Tab A" };
      entry.component = { type: "html", props: {} };

      const parent = createContainer({
        entries: [entry, { key: "tab-b", label: "Tab B" }],
        layout: "tabbed",
        contentFactory: simpleFactory(),
        depth: 1,
      });
      parent.mount(container);

      containerizeEntry(entry, parent, simpleFactory());

      const el = document.createElement("div");
      entry.childContainer!.mount(el);
      entry.contentElement = el;

      const parentStrip = container.querySelector("[data-tab-strip]") as HTMLElement;
      const toolbarsInParent = parentStrip.querySelectorAll("[data-container-toolbar]");
      expect(toolbarsInParent.length).toBe(1);
    });

    it("child toolbar + button adds tab to child, not parent", () => {
      const entry: Entry = { key: "tab-a", label: "Tab A" };
      entry.component = { type: "html", props: {} };

      const parent = createContainer({
        entries: [entry, { key: "tab-b", label: "Tab B" }],
        layout: "tabbed",
        contentFactory: simpleFactory(),
        depth: 1,
      });
      parent.mount(container);

      const parentEntryCountBefore = parent.entries.length;

      containerizeEntry(entry, parent, simpleFactory());

      const childHost = document.createElement("div");
      entry.childContainer!.mount(childHost);

      const childStrip = childHost.querySelector("[data-tab-strip]") as HTMLElement;
      const childToolbar = childStrip?.querySelector("[data-container-toolbar]") as HTMLElement;
      const addBtn = childToolbar?.querySelector("[title='Add tab'], [aria-label='Add tab']") as HTMLElement
        ?? Array.from(childToolbar?.children ?? []).find(el => el.textContent === "+") as HTMLElement;

      expect(addBtn).toBeTruthy();
      addBtn.click();

      expect(entry.childContainer!.entries.length).toBe(3);
      expect(parent.entries.length).toBe(parentEntryCountBefore);
    });
  });
});
