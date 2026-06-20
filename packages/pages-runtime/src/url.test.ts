import { describe, it, expect } from "vitest";
import type { DeepLink } from "@casehub/pages-ui/dist/model/page-types.js";
import { serializeToUrl, parseFromUrl } from "./url.js";

describe("serializeToUrl", () => {
  it("page path only", () => {
    const link: DeepLink = { page: "Sales/Revenue" };
    expect(serializeToUrl(link)).toBe("#/page/Sales/Revenue");
  });

  it("page path with single filter", () => {
    const link: DeepLink = { page: "Overview", filters: { region: ["North"] } };
    expect(serializeToUrl(link)).toBe("#/page/Overview?filter=region:North");
  });

  it("multi-value filter uses pipe separator", () => {
    const link: DeepLink = { page: "Overview", filters: { region: ["North", "South"] } };
    expect(serializeToUrl(link)).toBe("#/page/Overview?filter=region:North|South");
  });

  it("multiple filter columns separated by comma", () => {
    const link: DeepLink = {
      page: "Overview",
      filters: { region: ["North"], year: ["2024"] },
    };
    const url = serializeToUrl(link);
    expect(url).toContain("#/page/Overview?filter=");
    expect(url).toContain("region:North");
    expect(url).toContain("year:2024");
  });

  it("empty filters omitted", () => {
    const link: DeepLink = { page: "Home", filters: {} };
    expect(serializeToUrl(link)).toBe("#/page/Home");
  });

  it("root page (empty path)", () => {
    const link: DeepLink = { page: "" };
    expect(serializeToUrl(link)).toBe("#/page/");
  });
});

describe("parseFromUrl", () => {
  it("parses page path", () => {
    const link = parseFromUrl("#/page/Sales/Revenue");
    expect(link.page).toBe("Sales/Revenue");
    expect(link.filters).toBeUndefined();
  });

  it("parses single filter", () => {
    const link = parseFromUrl("#/page/Overview?filter=region:North");
    expect(link.page).toBe("Overview");
    expect(link.filters).toEqual({ region: ["North"] });
  });

  it("parses multi-value filter", () => {
    const link = parseFromUrl("#/page/Overview?filter=region:North|South");
    expect(link.filters).toEqual({ region: ["North", "South"] });
  });

  it("parses multiple filter columns", () => {
    const link = parseFromUrl("#/page/Overview?filter=region:North,year:2024");
    expect(link.filters).toEqual({ region: ["North"], year: ["2024"] });
  });

  it("empty hash returns root page", () => {
    const link = parseFromUrl("");
    expect(link.page).toBe("");
  });

  it("hash without /page/ prefix returns root", () => {
    const link = parseFromUrl("#/something");
    expect(link.page).toBe("");
  });
});

describe("serializeToUrl — encoding", () => {
  it("encodes spaces in page name", () => {
    const link: DeepLink = { page: "Q1 Report" };
    expect(serializeToUrl(link)).toBe("#/page/Q1%20Report");
  });

  it("encodes special characters in nested page path", () => {
    const link: DeepLink = { page: "R&D/Q1 Report" };
    expect(serializeToUrl(link)).toBe("#/page/R%26D/Q1%20Report");
  });

  it("encodes hash in page name", () => {
    const link: DeepLink = { page: "Section#2" };
    expect(serializeToUrl(link)).toBe("#/page/Section%232");
  });

  it("encodes question mark in page name", () => {
    const link: DeepLink = { page: "FAQ?" };
    expect(serializeToUrl(link)).toBe("#/page/FAQ%3F");
  });
});

describe("parseFromUrl — decoding", () => {
  it("decodes encoded page segments", () => {
    const link = parseFromUrl("#/page/Q1%20Report");
    expect(link.page).toBe("Q1 Report");
  });

  it("decodes nested encoded page path", () => {
    const link = parseFromUrl("#/page/R%26D/Q1%20Report");
    expect(link.page).toBe("R&D/Q1 Report");
  });
});

describe("round-trip", () => {
  it("serialize then parse produces same DeepLink", () => {
    const original: DeepLink = {
      page: "Sales/Revenue",
      filters: { region: ["North", "South"], year: ["2024"] },
    };
    const url = serializeToUrl(original);
    const parsed = parseFromUrl(url);
    expect(parsed.page).toBe(original.page);
    expect(parsed.filters).toEqual(original.filters);
  });

  it("round-trips page names with special characters", () => {
    const original: DeepLink = {
      page: "R&D/Q1 Report",
      filters: { "col name": ["val?1", "val#2"] },
    };
    const url = serializeToUrl(original);
    const parsed = parseFromUrl(url);
    expect(parsed.page).toBe(original.page);
    expect(parsed.filters).toEqual(original.filters);
  });
});
