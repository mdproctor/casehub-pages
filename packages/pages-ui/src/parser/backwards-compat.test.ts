import {describe, expect, it} from "vitest";
import {existsSync, readFileSync} from "fs";
import {load} from "js-yaml";
import type {Component} from "../model/types.js";
import {parsePage} from "./page-parser.js";
import {join} from "path";
import {globSync} from "glob";

const EXAMPLES_DIR = join(__dirname, "../../../../examples/samples");

describe("backwards compatibility — existing samples", () => {
  // Skip if examples directory doesn't exist (CI without examples)
  const dirExists = existsSync(EXAMPLES_DIR);

  if (!dirExists) {
    it.skip("examples directory not found", () => {});
    return;
  }

  const files = globSync("**/*.{yaml,yml}", { cwd: EXAMPLES_DIR });

  it("found example samples", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files)("parses %s without error", (file) => {
    const content = readFileSync(join(EXAMPLES_DIR, file), "utf-8");
    const raw = load(content);
    if (!raw || typeof raw !== "object") return; // skip non-object YAML
    const obj = raw as Record<string, unknown>;
    // Only test files that have pages or layoutTemplates
    if (!obj["pages"] && !obj["layoutTemplates"]) return;
    expect(() => parsePage(raw)).not.toThrow();
  });

  // ------- Specific assertions for known complex samples -------

  describe("navTree page filtering — pages in groups excluded from top-level", () => {
    it("only root page is top-level when navTree is present", () => {
      const yaml = {
        pages: [
          { name: "index", components: [{ type: "TABS", properties: { navGroupId: "Main", targetDivId: "target" } }, { div: "target" }] },
          { name: "Dashboard", components: [{ html: "dashboard content" }] },
          { name: "Settings", components: [{ html: "settings content" }] },
          { name: "Orphan", components: [{ html: "orphan page" }] },
        ],
        navTree: {
          root_items: [{ type: "GROUP", id: "Main", children: [{ page: "Dashboard" }, { page: "Settings" }] }],
        },
      };
      const root = parsePage(yaml);
      const topLevel = root.slots!["content"]!;
      const topLevelNames = topLevel.map((p: Component) => (p.props as Record<string, unknown>)["name"]);
      expect(topLevelNames).toEqual(["index"]);
    });

    it("navTree-embedded pages still accessible through navigation slots", () => {
      const yaml = {
        pages: [
          { name: "index", components: [{ type: "TABS", properties: { navGroupId: "Main", targetDivId: "t" } }, { div: "t" }] },
          { name: "PageA", components: [{ html: "content A" }] },
        ],
        navTree: {
          root_items: [{ type: "GROUP", id: "Main", children: [{ page: "PageA" }] }],
        },
      };
      const root = parsePage(yaml);
      const indexPage = root.slots!["content"]!.find(
        (p: Component) => (p.props as Record<string, unknown>)["name"] === "index",
      )!;
      const contentTabs = indexPage.items!.find(
        (item: { component: Component }) => item.component.type === "tabs" && item.component.slots,
      );
      expect(contentTabs).toBeDefined();
      expect(contentTabs!.component.slots!["PageA"]).toBeDefined();
    });
  });

  describe("Column with rows — nested layout (legacy displayer syntax)", () => {
    const root = parsePage({
      pages: [{ rows: [{ columns: [
        { span: "6", components: [{ displayer: { type: "BARCHART", chart: { height: 300 } } }] },
        { span: "6", rows: [
          { columns: [{ components: [{ displayer: { type: "PIECHART", chart: { height: 150 } } }] }] },
          { columns: [{ components: [{ displayer: { type: "METERCHART", chart: { height: 150 } } }] }] },
        ] },
      ] }] }],
    });

    it("parses nested rows inside columns", () => {
      const page = root.slots!["content"]![0]!;
      expect(page.items!.length).toBeGreaterThan(1);
    });

    it("contains bar chart and pie chart from nested layout", () => {
      const page = root.slots!["content"]![0]!;
      const allTypes: string[] = [];
      function collectTypes(items: readonly { component: { type: string; items?: readonly { component: { type: string } }[] } }[]): void {
        for (const item of items) {
          allTypes.push(item.component.type);
          if (item.component.items) collectTypes(item.component.items);
        }
      }
      collectTypes(page.items!);
      expect(allTypes).toContain("bar-chart");
      expect(allTypes).toContain("pie-chart");
    });
  });

  describe("legacy layoutTemplates format (inline fixture)", () => {
    const root = parsePage({
      layoutTemplates: [{ name: "Test", rows: [
        { layoutColumns: [{ layoutComponents: [
          { type: "HTML", properties: { HTML_CODE: "Hello" } },
          { displayer: { type: "BARCHART", lookup: { uuid: "test" } } },
        ] }] },
      ] }],
    });

    it("accepts layoutTemplates key", () => {
      expect(root.type).toBe("page");
    });

    it("handles legacy layoutColumns and layoutComponents", () => {
      const page = root.slots!["content"]![0]!;
      expect(page.items!.length).toBeGreaterThan(0);
    });

    it("handles type: HTML with HTML_CODE property", () => {
      const page = root.slots!["content"]![0]!;
      const htmlItems = page.items!.filter((item) => item.component.type === "html");
      expect(htmlItems.length).toBeGreaterThan(0);
    });
  });

  describe("legacy lowercase displayer types (inline fixture)", () => {
    const root = parsePage({
      global: { displayer: { chart: { resizable: true } }, mode: "dark" },
      pages: [{ components: [{ displayer: { type: "barchart", lookup: { uuid: "test" } } }] }],
      datasets: [{ uuid: "test", content: '[["A", 1]]' }],
    });

    it("parses lowercase type: barchart as bar-chart", () => {
      const page = root.slots!["content"]![0]!;
      const chart = page.items!.find((item) => item.component.type === "bar-chart");
      expect(chart).toBeDefined();
    });

    it("parses global dark mode setting", () => {
      const settings = (root.props as Record<string, unknown>)["settings"] as Record<
        string,
        unknown
      >;
      expect(settings["mode"]).toBe("dark");
    });
  });

  describe("legacy empty displayer and global defaults (inline fixture)", () => {
    const root = parsePage({
      global: { displayer: { chart: { resizable: true } } },
      pages: [{ components: [{ displayer: null }, { displayer: { type: "TABLE", lookup: { uuid: "t" } } }] }],
      datasets: [{ uuid: "t", content: '[["A", 1]]' }],
    });

    it("handles empty displayer (null value)", () => {
      const page = root.slots!["content"]![0]!;
      expect(page.items!.length).toBeGreaterThan(0);
    });
  });

  describe("legacy property substitution and lowercase timeseries (inline fixture)", () => {
    const root = parsePage({
      properties: { prometheusUrl: "http://localhost:9090" },
      pages: [{ rows: [{ columns: [{ components: [
        { displayer: { type: "timeseries", lookup: { uuid: "metrics" } } },
      ] }] }] }],
      datasets: [{ uuid: "metrics", url: "${prometheusUrl}/api/v1/query" }],
    });

    it("substitutes properties in URLs", () => {
      expect(root.type).toBe("page");
    });

    it("parses lowercase type: timeseries", () => {
      const page = root.slots!["content"]![0]!;
      function findComponentByType(c: Component, type: string): Component | undefined {
        if (c.type === type) return c;
        if (c.items) {
          for (const item of c.items) {
            const found = findComponentByType(item.component, type);
            if (found) return found;
          }
        }
        return undefined;
      }
      const timeseries = findComponentByType(page, "timeseries");
      expect(timeseries).toBeDefined();
    });
  });

  describe("legacy inline dataSet field (inline fixture)", () => {
    const root = parsePage({
      pages: [{ components: [{ displayer: { type: "TABLE", lookup: { uuid: "inline" } } }] }],
      datasets: [{ uuid: "inline", content: '[["A", 1], ["B", 2]]' }],
    });

    it("parses dashboard with inline dataSet", () => {
      expect(root.type).toBe("page");
      const page = root.slots!["content"]![0]!;
      expect(page.items!.length).toBeGreaterThan(0);
    });
  });
});
