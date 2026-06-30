import { describe, it, expect } from "vitest";
import { applyLayoutCSS, isLayoutType } from "./layout.js";
import type { Component } from "../model/types.js";

describe("isLayoutType", () => {
  it("recognises layout types", () => {
    expect(isLayoutType("grid")).toBe(true);
    expect(isLayoutType("columns")).toBe(true);
    expect(isLayoutType("rows")).toBe(true);
    expect(isLayoutType("stack")).toBe(true);
    expect(isLayoutType("tabs")).toBe(true);
    expect(isLayoutType("pills")).toBe(true);
    expect(isLayoutType("accordion")).toBe(true);
    expect(isLayoutType("carousel")).toBe(true);
    expect(isLayoutType("sidebar")).toBe(true);
    expect(isLayoutType("tree")).toBe(true);
    expect(isLayoutType("panel")).toBe(true);
    expect(isLayoutType("split")).toBe(true);
  });

  it("rejects non-layout types", () => {
    expect(isLayoutType("bar-chart")).toBe(false);
    expect(isLayoutType("html")).toBe(false);
    expect(isLayoutType("page")).toBe(false);
    expect(isLayoutType("menu")).toBe(false);
  });
});

describe("applyLayoutCSS", () => {
  it("applies grid CSS", () => {
    const el = document.createElement("div");
    const component: Component = { type: "grid", props: { columns: 12 } };
    applyLayoutCSS(el, component);
    expect(el.style.display).toBe("grid");
    expect(el.style.gridTemplateColumns).toBe("repeat(12, 1fr)");
  });

  it("applies columns CSS with distribution", () => {
    const el = document.createElement("div");
    const component: Component = { type: "columns", props: { distribution: [2, 1] } };
    applyLayoutCSS(el, component);
    expect(el.style.display).toBe("grid");
    expect(el.style.gridTemplateColumns).toBe("2fr 1fr");
  });

  it("applies rows CSS", () => {
    const el = document.createElement("div");
    const component: Component = { type: "rows" };
    applyLayoutCSS(el, component);
    expect(el.style.display).toBe("flex");
    expect(el.style.flexDirection).toBe("column");
  });

  it("stack does not set display:grid", () => {
    const el = document.createElement("div");
    const component: Component = { type: "stack" };
    applyLayoutCSS(el, component);
    expect(el.style.display).not.toBe("grid");
  });

  it("applies sidebar CSS", () => {
    const el = document.createElement("div");
    const component: Component = { type: "sidebar" };
    applyLayoutCSS(el, component);
    expect(el.style.display).toBe("grid");
    expect(el.style.gridTemplateColumns).toBe("auto 1fr");
  });

  it("applies tree CSS", () => {
    const el = document.createElement("div");
    const component: Component = { type: "tree" };
    applyLayoutCSS(el, component);
    expect(el.style.display).toBe("grid");
    expect(el.style.gridTemplateColumns).toBe("auto 1fr");
  });

  it("accordion applies flex column", () => {
    const el = document.createElement("div");
    const component: Component = { type: "accordion" };
    applyLayoutCSS(el, component);
    expect(el.style.display).toBe("flex");
    expect(el.style.flexDirection).toBe("column");
  });

  it("tabs/pills/carousel do not set layout CSS (handled by interactivity)", () => {
    for (const type of ["tabs", "pills", "carousel"]) {
      const el = document.createElement("div");
      const component: Component = { type };
      applyLayoutCSS(el, component);
      expect(el.style.display).toBe("");
    }
  });

  it("panel does not set layout CSS", () => {
    const el = document.createElement("div");
    const component: Component = { type: "panel" };
    applyLayoutCSS(el, component);
    expect(el.style.display).toBe("");
  });

  it("grid defaults to 12 columns if not specified", () => {
    const el = document.createElement("div");
    const component: Component = { type: "grid" };
    applyLayoutCSS(el, component);
    expect(el.style.gridTemplateColumns).toBe("repeat(12, 1fr)");
  });
});

describe("split layout", () => {
  it("split is a layout type", () => {
    expect(isLayoutType("split")).toBe(true);
  });

  it("app-grid is no longer a layout type", () => {
    expect(isLayoutType("app-grid")).toBe(false);
  });

  it("applies horizontal split CSS — flex row", () => {
    const el = document.createElement("div");
    const component: Component = { type: "split", props: { direction: "horizontal" } };
    applyLayoutCSS(el, component);
    expect(el.style.display).toBe("flex");
    expect(el.style.flexDirection).toBe("row");
  });

  it("applies vertical split CSS — flex column", () => {
    const el = document.createElement("div");
    const component: Component = { type: "split", props: { direction: "vertical" } };
    applyLayoutCSS(el, component);
    expect(el.style.display).toBe("flex");
    expect(el.style.flexDirection).toBe("column");
  });
});
