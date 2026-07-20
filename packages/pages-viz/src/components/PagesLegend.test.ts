import { describe, it, expect, afterEach } from "vitest";
import type { LegendProps } from "./PagesLegend.js";
import type { PagesLegend } from "./PagesLegend.js";
import "./PagesLegend.js";

async function createLegend(props: LegendProps): Promise<PagesLegend> {
  const el = document.createElement("pages-legend") as PagesLegend;
  el.props = props;
  document.body.appendChild(el);
  await el.updateComplete;
  return el;
}

describe("PagesLegend", () => {
  let el: PagesLegend | undefined;

  afterEach(() => {
    if (el) {
      document.body.removeChild(el);
      el = undefined;
    }
  });

  it("renders entries as list items with swatches", async () => {
    el = await createLegend({
      entries: [
        { label: "Alpha", color: "#ff0000" },
        { label: "Beta", color: "#00ff00" },
      ],
    });

    const items = el.shadowRoot!.querySelectorAll(".legend-entry");
    expect(items.length).toBe(2);

    const firstSwatch = items[0]!.querySelector(".legend-swatch") as HTMLElement;
    expect(firstSwatch.getAttribute("aria-hidden")).toBe("true");

    const firstLabel = items[0]!.querySelector("span:not(.legend-swatch)");
    expect(firstLabel!.textContent).toBe("Alpha");

    const secondLabel = items[1]!.querySelector("span:not(.legend-swatch)");
    expect(secondLabel!.textContent).toBe("Beta");
  });

  it("uses semantic ul/li structure", async () => {
    el = await createLegend({ entries: [{ label: "A", color: "#000" }] });

    expect(el.shadowRoot!.querySelector("ul")).toBeTruthy();
    expect(el.shadowRoot!.querySelector("li")).toBeTruthy();
  });

  it("defaults to linear layout (no extra class)", async () => {
    el = await createLegend({ entries: [{ label: "A", color: "#000" }] });

    const ul = el.shadowRoot!.querySelector("ul")!;
    expect(ul.classList.contains("pages-legend")).toBe(true);
    expect(ul.classList.contains("horizontal")).toBe(false);
    expect(ul.classList.contains("grid")).toBe(false);
  });

  it("applies horizontal layout class", async () => {
    el = await createLegend({
      entries: [{ label: "A", color: "#000" }],
      layout: "horizontal",
    });

    const ul = el.shadowRoot!.querySelector("ul")!;
    expect(ul.classList.contains("horizontal")).toBe(true);
  });

  it("applies grid layout class", async () => {
    el = await createLegend({
      entries: [{ label: "A", color: "#000" }],
      layout: "grid",
    });

    const ul = el.shadowRoot!.querySelector("ul")!;
    expect(ul.classList.contains("grid")).toBe(true);
  });

  it("applies circle swatch shape", async () => {
    el = await createLegend({
      entries: [{ label: "A", color: "#000" }],
      swatchShape: "circle",
    });

    const swatch = el.shadowRoot!.querySelector(".legend-swatch")!;
    expect(swatch.classList.contains("circle")).toBe(true);
  });

  it("defaults to square swatch shape (no circle class)", async () => {
    el = await createLegend({
      entries: [{ label: "A", color: "#000" }],
    });

    const swatch = el.shadowRoot!.querySelector(".legend-swatch")!;
    expect(swatch.classList.contains("circle")).toBe(false);
  });

  it("renders empty entries array without error", async () => {
    el = await createLegend({ entries: [] });
    const items = el.shadowRoot!.querySelectorAll(".legend-entry");
    expect(items.length).toBe(0);
  });
});
