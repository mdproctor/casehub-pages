import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { renderComponent } from "./render.js";
import type { Component } from "../model/types.js";

describe("split resize event", () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.remove();
  });

  function buildSplit(id?: string): Component {
    return {
      type: "split",
      ...(id ? { id } : {}),
      props: { direction: "horizontal", ratio: [60, 40] },
      slots: {
        "0": [{ type: "html", props: { content: "A" } }],
        "1": [{ type: "html", props: { content: "B" } }],
      },
    };
  }

  it("fires pages-split-resize with componentId and proportional ratios on mouseup", () => {
    renderComponent(container, buildSplit("main-split"));

    const handle = container.querySelector("[data-split-handle]") as HTMLElement;
    expect(handle).toBeTruthy();

    const events: Array<{ componentId: string; ratios: number[] }> = [];
    container.addEventListener("pages-split-resize", ((e: Event) => {
      events.push((e as CustomEvent).detail);
    }));

    // Simulate drag: mousedown on handle, mousemove, mouseup
    handle.dispatchEvent(new MouseEvent("mousedown", { clientX: 100, bubbles: true }));
    document.dispatchEvent(new MouseEvent("mousemove", { clientX: 120 }));
    document.dispatchEvent(new MouseEvent("mouseup"));

    expect(events).toHaveLength(1);
    expect(events[0]!.componentId).toBe("main-split");
    expect(events[0]!.ratios).toHaveLength(2);
    expect(events[0]!.ratios.every(r => typeof r === "number")).toBe(true);
  });

  it("uses auto-generated id when no explicit id provided", () => {
    renderComponent(container, buildSplit());

    const splitEl = container.querySelector("[data-component-type='split']") as HTMLElement;
    const autoId = splitEl.dataset.componentId!;

    const handle = container.querySelector("[data-split-handle]") as HTMLElement;
    const events: Array<{ componentId: string; ratios: number[] }> = [];
    container.addEventListener("pages-split-resize", ((e: Event) => {
      events.push((e as CustomEvent).detail);
    }));

    handle.dispatchEvent(new MouseEvent("mousedown", { clientX: 100, bubbles: true }));
    document.dispatchEvent(new MouseEvent("mouseup"));

    expect(events[0]!.componentId).toBe(autoId);
  });

  it("computes proportional ratios normalized to percentages", () => {
    renderComponent(container, buildSplit("test-split"));

    // Mock offsetWidth on slot containers
    const slots = container.querySelectorAll("[data-slot]");
    Object.defineProperty(slots[0], "offsetWidth", { value: 600, configurable: true });
    Object.defineProperty(slots[1], "offsetWidth", { value: 400, configurable: true });

    const handle = container.querySelector("[data-split-handle]") as HTMLElement;
    const events: Array<{ componentId: string; ratios: number[] }> = [];
    container.addEventListener("pages-split-resize", ((e: Event) => {
      events.push((e as CustomEvent).detail);
    }));

    handle.dispatchEvent(new MouseEvent("mousedown", { clientX: 100, bubbles: true }));
    document.dispatchEvent(new MouseEvent("mouseup"));

    expect(events[0]!.ratios).toEqual([60, 40]);
  });
});
