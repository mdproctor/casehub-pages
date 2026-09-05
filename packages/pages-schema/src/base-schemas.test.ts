import { describe, it, expect } from "vitest";
import { z } from "zod";
import {
  filterSettingsSchema,
  refreshSettingsSchema,
  chartSettingsSchema,
  dataComponentCommonSchema,
} from "./base-schemas.js";
import type { FilterSettings, RefreshSettings } from "@casehubio/pages-component";

describe("base schemas", () => {
  describe("filterSettingsSchema", () => {
    it("parses valid filter settings", () => {
      const input = {
        enabled: true,
        notification: false,
        listening: true,
        selfApply: false,
        drillDown: { target: "Detail", parameters: { region: "region" } },
      };
      const result = filterSettingsSchema.parse(input);
      expect(result.enabled).toBe(true);
      expect(result.drillDown?.target).toBe("Detail");
    });

    it("accepts empty object", () => {
      expect(() => filterSettingsSchema.parse({})).not.toThrow();
    });

    it("type-checks against FilterSettings", () => {
      const _check: FilterSettings = {} as z.output<typeof filterSettingsSchema>;
      expect(_check).toBeDefined();
    });
  });

  describe("refreshSettingsSchema", () => {
    it("parses interval and showStaleIndicator", () => {
      const result = refreshSettingsSchema.parse({ interval: 30, showStaleIndicator: true });
      expect(result.interval).toBe(30);
      expect(result.showStaleIndicator).toBe(true);
    });

    it("type-checks against RefreshSettings", () => {
      const _check: RefreshSettings = {} as z.output<typeof refreshSettingsSchema>;
      expect(_check).toBeDefined();
    });
  });

  describe("chartSettingsSchema", () => {
    it("parses nested chart settings", () => {
      const input = {
        resizable: true,
        zoom: false,
        legend: { show: true, position: "bottom" as const },
        margin: { top: 10, right: 20 },
        xAxis: { title: "Date", showLabels: true },
        grid: { x: true, y: false },
      };
      const result = chartSettingsSchema.parse(input);
      expect(result.legend?.position).toBe("bottom");
      expect(result.margin?.top).toBe(10);
    });

    it("rejects invalid legend position", () => {
      expect(() => chartSettingsSchema.parse({
        legend: { position: "center" },
      })).toThrow();
    });
  });

  describe("dataComponentCommonSchema", () => {
    it("parses lookup with uuid", () => {
      const input = {
        title: "Sales",
        visible: true,
        lookup: { uuid: "ds-1" },
      };
      const result = dataComponentCommonSchema.parse(input);
      expect(result.title).toBe("Sales");
    });

    it("parses lookup with filter and sort", () => {
      const input = {
        lookup: {
          uuid: "ds-1",
          filter: [{ column: "age", function: "GREATER_THAN", args: ["18"] }],
          sort: [{ column: "name", order: "ASCENDING" }],
        },
      };
      const result = dataComponentCommonSchema.parse(input);
      expect(result.lookup.uuid).toBe("ds-1");
    });

    it("requires lookup", () => {
      expect(() => dataComponentCommonSchema.parse({ title: "X" })).toThrow();
    });
  });
});
