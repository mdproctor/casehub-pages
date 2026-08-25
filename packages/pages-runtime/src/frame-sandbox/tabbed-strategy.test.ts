import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createTabbedStrategy } from "./tabbed-strategy";
import type { Entry, ContentFactory, TabState } from "./types.js";

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

function simulateClick(el: HTMLElement): void {
  el.dispatchEvent(
    new PointerEvent("pointerdown", {
      clientX: 0,
      clientY: 0,
      bubbles: true,
    }),
  );
  document.dispatchEvent(new PointerEvent("pointerup"));
}

function mockTabBounds(ctr: HTMLElement): void {
  const buttons = [
    ...ctr.querySelectorAll("[data-tab-key]"),
  ] as HTMLElement[];
  let left = 0;
  for (const btn of buttons) {
    const l = left;
    vi.spyOn(btn, "getBoundingClientRect").mockReturnValue({
      left: l,
      right: l + 80,
      top: 0,
      bottom: 30,
      width: 80,
      height: 30,
      x: l,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect);
    left += 80;
  }
  const strip = ctr.querySelector("[data-tab-strip]") as HTMLElement;
  vi.spyOn(strip, "getBoundingClientRect").mockReturnValue({
    left: 0,
    right: left,
    top: 0,
    bottom: 30,
    width: left,
    height: 30,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  } as DOMRect);
}

describe("TabOrganiser", () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  it("mounts tab strip with buttons for each entry", () => {
    const org = createTabbedStrategy();
    org.mount(container, makeEntries("a", "b", "c"), testFactory());

    const buttons = container.querySelectorAll("[data-tab-key]");
    expect(buttons).toHaveLength(3);
    expect(buttons[0]!.textContent).toContain("A");
    expect(buttons[1]!.textContent).toContain("B");
    expect(buttons[2]!.textContent).toContain("C");
  });

  it("shows first tab content by default", () => {
    const org = createTabbedStrategy();
    org.mount(container, makeEntries("a", "b"), testFactory());

    const content = container.querySelector("[data-test-key='a']");
    expect(content).not.toBeNull();
    expect(content!.textContent).toBe("Content: a");

    const hiddenContent = container.querySelector("[data-test-key='b']");
    expect(hiddenContent).toBeNull();
  });

  it("switches active tab on click", () => {
    const org = createTabbedStrategy();
    org.mount(container, makeEntries("a", "b"), testFactory());

    const tabB = container.querySelector(
      "[data-tab-key='b']",
    ) as HTMLElement;
    simulateClick(tabB);

    const contentB = container.querySelector("[data-test-key='b']");
    expect(contentB).not.toBeNull();
    expect(contentB!.textContent).toBe("Content: b");

    const contentA = container.querySelector("[data-test-key='a']");
    expect(contentA).toBeNull();
  });

  it("caches content elements — same element after switching back", () => {
    const org = createTabbedStrategy();
    org.mount(container, makeEntries("a", "b"), testFactory());

    const contentA1 = container.querySelector("[data-test-key='a']")!;

    const tabB = container.querySelector(
      "[data-tab-key='b']",
    ) as HTMLElement;
    simulateClick(tabB);
    const tabA = container.querySelector(
      "[data-tab-key='a']",
    ) as HTMLElement;
    simulateClick(tabA);

    const contentA2 = container.querySelector("[data-test-key='a']")!;
    expect(contentA2).toBe(contentA1);
  });

  it("unmount detaches content but does not dispose", () => {
    const org = createTabbedStrategy();
    const entries = makeEntries("a", "b");
    org.mount(container, entries, testFactory());

    const contentA = container.querySelector("[data-test-key='a']")!;
    org.unmount();

    expect(container.children).toHaveLength(0);
    expect(entries[0]!.contentElement).toBe(contentA);
    expect(entries[0]!.contentDispose).toBeDefined();
  });

  it("returns correct state", () => {
    const org = createTabbedStrategy();
    org.mount(container, makeEntries("a", "b", "c"), testFactory());

    const state = org.getState() as TabState;
    expect(state.activeKey).toBe("a");
    expect(state.order).toEqual(["a", "b", "c"]);
  });

  it("addEntry appends a new tab", () => {
    const org = createTabbedStrategy();
    org.mount(container, makeEntries("a"), testFactory());

    org.addEntry({ key: "b", label: "B" });

    const buttons = container.querySelectorAll("[data-tab-key]");
    expect(buttons).toHaveLength(2);
  });

  it("removeEntry removes tab and content", () => {
    const org = createTabbedStrategy();
    org.mount(container, makeEntries("a", "b"), testFactory());

    org.removeEntry("a");

    const buttons = container.querySelectorAll("[data-tab-key]");
    expect(buttons).toHaveLength(1);
    expect(buttons[0]!.getAttribute("data-tab-key")).toBe("b");

    const contentB = container.querySelector("[data-test-key='b']");
    expect(contentB).not.toBeNull();
  });

  it("reorders tabs via drag", () => {
    const onEntryReorder = vi.fn();
    const org = createTabbedStrategy({ onEntryReorder });
    org.mount(container, makeEntries("a", "b", "c"), testFactory());
    mockTabBounds(container);

    const tabA = container.querySelector("[data-tab-key='a']") as HTMLElement;

    tabA.dispatchEvent(
      new PointerEvent("pointerdown", {
        clientX: 40,
        clientY: 15,
        bubbles: true,
      }),
    );
    document.dispatchEvent(
      new PointerEvent("pointermove", {
        clientX: 200,
        clientY: 15,
      }),
    );
    document.dispatchEvent(new PointerEvent("pointerup"));

    expect(onEntryReorder).toHaveBeenCalled();
    const state = org.getState() as TabState;
    expect(state.order[0]).not.toBe("a");
  });

  it("each tab button has a close button that fires onEntryClose", () => {
    const onEntryClose = vi.fn();
    const org = createTabbedStrategy({ onEntryClose });
    org.mount(container, makeEntries("a", "b", "c"), testFactory());

    const closeBtn = container.querySelector('[data-tab-key="b"] [data-tab-close]') as HTMLElement;
    expect(closeBtn).not.toBeNull();
    closeBtn.click();

    expect(onEntryClose).toHaveBeenCalledWith("b");
  });

  it("close button removes the tab from the strip", () => {
    const org = createTabbedStrategy({ onEntryClose: () => {} });
    org.mount(container, makeEntries("a", "b"), testFactory());

    const closeBtn = container.querySelector('[data-tab-key="b"] [data-tab-close]') as HTMLElement;
    closeBtn.click();

    const buttons = container.querySelectorAll("[data-tab-key]");
    expect(buttons).toHaveLength(1);
    expect(buttons[0]!.getAttribute("data-tab-key")).toBe("a");
  });

  it("close button is hidden by default, visible on tab hover", () => {
    const org = createTabbedStrategy({ onEntryClose: () => {} });
    org.mount(container, makeEntries("a", "b"), testFactory());

    const closeBtn = container.querySelector('[data-tab-key="b"] [data-tab-close]') as HTMLElement;
    expect(closeBtn.style.opacity).toBe("0");

    const tabBtn = container.querySelector('[data-tab-key="b"]') as HTMLElement;
    tabBtn.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }));
    expect(closeBtn.style.opacity).toBe("0.7");

    tabBtn.dispatchEvent(new MouseEvent("mouseleave", { bubbles: true }));
    expect(closeBtn.style.opacity).toBe("0");
  });

  it("close button does not activate the tab", () => {
    const org = createTabbedStrategy({ onEntryClose: () => {} });
    org.mount(container, makeEntries("a", "b"), testFactory());

    const contentA = container.querySelector("[data-test-key='a']");
    expect(contentA).not.toBeNull();

    const closeBtn = container.querySelector('[data-tab-key="b"] [data-tab-close]') as HTMLElement;
    closeBtn.click();

    const contentStillA = container.querySelector("[data-test-key='a']");
    expect(contentStillA).not.toBeNull();
    expect(container.querySelector("[data-test-key='b']")).toBeNull();
  });

  it("fires onTabDragOut when tab dragged outside strip", () => {
    const onTabDragOut = vi.fn();
    const org = createTabbedStrategy({ onTabDragOut });
    org.mount(container, makeEntries("a", "b"), testFactory());

    const tabA = container.querySelector("[data-tab-key='a']") as HTMLElement;

    tabA.dispatchEvent(
      new PointerEvent("pointerdown", {
        clientX: 10,
        clientY: 10,
        bubbles: true,
      }),
    );
    document.dispatchEvent(
      new PointerEvent("pointermove", {
        clientX: 10,
        clientY: 200,
      }),
    );
    document.dispatchEvent(new PointerEvent("pointerup"));

    expect(onTabDragOut).toHaveBeenCalledWith("a", 10, 200);
  });

  describe("onCollapse", () => {
    it("fires onCollapse when last sibling is removed and one entry remains", () => {
      const onCollapse = vi.fn();
      const strategy = createTabbedStrategy({ onCollapse });
      const host = document.createElement("div");
      document.body.appendChild(host);
      strategy.mount(host, makeEntries("a", "b"), testFactory());

      strategy.removeEntry("a");

      expect(onCollapse).toHaveBeenCalledOnce();
      expect(onCollapse).toHaveBeenCalledWith(expect.objectContaining({ key: "b" }));

      strategy.dispose();
      document.body.removeChild(host);
    });

    it("does not fire onCollapse when 2+ entries remain", () => {
      const onCollapse = vi.fn();
      const strategy = createTabbedStrategy({ onCollapse });
      const host = document.createElement("div");
      document.body.appendChild(host);
      strategy.mount(host, makeEntries("a", "b", "c"), testFactory());

      strategy.removeEntry("a");

      expect(onCollapse).not.toHaveBeenCalled();

      strategy.dispose();
      document.body.removeChild(host);
    });
  });
});
