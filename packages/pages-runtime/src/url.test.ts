import { describe, it, expect } from "vitest";
import type { DeepLink } from "@casehubio/pages-ui/dist/model/page-types.js";
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

describe("serializeToUrl — sort", () => {
  it("single component sort", () => {
    const link: DeepLink = {
      page: "Sales",
      sort: { "t1": { columnId: "Revenue", order: "DESCENDING" } },
    };
    expect(serializeToUrl(link)).toBe("#/page/Sales?sort=t1:Revenue:DESCENDING");
  });

  it("multiple component sorts", () => {
    const link: DeepLink = {
      page: "Sales",
      sort: {
        "t1": { columnId: "Revenue", order: "DESCENDING" },
        "t2": { columnId: "Name", order: "ASCENDING" },
      },
    };
    const url = serializeToUrl(link);
    expect(url).toContain("sort=");
    expect(url).toContain("t1:Revenue:DESCENDING");
    expect(url).toContain("t2:Name:ASCENDING");
  });

  it("sort with special characters in component ID and column", () => {
    const link: DeepLink = {
      page: "Sales",
      sort: { "my:table": { columnId: "R&D", order: "ASCENDING" } },
    };
    const url = serializeToUrl(link);
    expect(url).toContain("sort=");
    expect(url).not.toContain("my:table:");
  });

  it("empty sort object omitted", () => {
    const link: DeepLink = { page: "Sales", sort: {} };
    expect(serializeToUrl(link)).toBe("#/page/Sales");
  });
});

describe("serializeToUrl — pagination", () => {
  it("single component page", () => {
    const link: DeepLink = { page: "Sales", pagination: { "t1": 3 } };
    expect(serializeToUrl(link)).toBe("#/page/Sales?page=t1:3");
  });

  it("page 0 omitted", () => {
    const link: DeepLink = { page: "Sales", pagination: { "t1": 0 } };
    expect(serializeToUrl(link)).toBe("#/page/Sales");
  });

  it("multiple components", () => {
    const link: DeepLink = { page: "Sales", pagination: { "t1": 3, "t2": 7 } };
    const url = serializeToUrl(link);
    expect(url).toContain("page=");
    expect(url).toContain("t1:3");
    expect(url).toContain("t2:7");
  });
});

describe("serializeToUrl — combined", () => {
  it("all four dimensions", () => {
    const link: DeepLink = {
      page: "Sales/Revenue",
      filters: { region: ["North"] },
      sort: { "t1": { columnId: "Revenue", order: "DESCENDING" } },
      pagination: { "t1": 2 },
    };
    const url = serializeToUrl(link);
    expect(url).toContain("#/page/Sales/Revenue?");
    expect(url).toContain("filter=region:North");
    expect(url).toContain("sort=t1:Revenue:DESCENDING");
    expect(url).toContain("page=t1:2");
  });
});

describe("parseFromUrl — sort", () => {
  it("parses single sort", () => {
    const link = parseFromUrl("#/page/Sales?sort=t1:Revenue:DESCENDING");
    expect(link.sort).toEqual({ t1: { columnId: "Revenue", order: "DESCENDING" } });
  });

  it("parses multiple sorts", () => {
    const link = parseFromUrl("#/page/Sales?sort=t1:Revenue:DESCENDING,t2:Name:ASCENDING");
    expect(link.sort?.t1).toEqual({ columnId: "Revenue", order: "DESCENDING" });
    expect(link.sort?.t2).toEqual({ columnId: "Name", order: "ASCENDING" });
  });

  it("no sort param returns undefined sort", () => {
    const link = parseFromUrl("#/page/Sales");
    expect(link.sort).toBeUndefined();
  });

  it("malformed sort entry skipped", () => {
    const link = parseFromUrl("#/page/Sales?sort=bad");
    expect(link.sort).toEqual({});
  });
});

describe("parseFromUrl — pagination", () => {
  it("parses single page", () => {
    const link = parseFromUrl("#/page/Sales?page=t1:3");
    expect(link.pagination).toEqual({ t1: 3 });
  });

  it("parses multiple pages", () => {
    const link = parseFromUrl("#/page/Sales?page=t1:3,t2:7");
    expect(link.pagination?.t1).toBe(3);
    expect(link.pagination?.t2).toBe(7);
  });

  it("no page param returns undefined pagination", () => {
    const link = parseFromUrl("#/page/Sales");
    expect(link.pagination).toBeUndefined();
  });
});

describe("round-trip — sort + pagination", () => {
  it("full round-trip with all dimensions", () => {
    const original: DeepLink = {
      page: "Sales/Revenue",
      filters: { region: ["North", "South"], year: ["2024"] },
      sort: { "t1": { columnId: "Revenue", order: "DESCENDING" } },
      pagination: { "t1": 2 },
    };
    const url = serializeToUrl(original);
    const parsed = parseFromUrl(url);
    expect(parsed.page).toBe(original.page);
    expect(parsed.filters).toEqual(original.filters);
    expect(parsed.sort).toEqual(original.sort);
    expect(parsed.pagination).toEqual(original.pagination);
  });

  it("round-trips special characters in component IDs", () => {
    const original: DeepLink = {
      page: "Sales",
      sort: { "my-table": { columnId: "R&D Cost", order: "ASCENDING" } },
      pagination: { "my-table": 5 },
    };
    const url = serializeToUrl(original);
    const parsed = parseFromUrl(url);
    expect(parsed.sort).toEqual(original.sort);
    expect(parsed.pagination).toEqual(original.pagination);
  });

  it("backwards compatibility — old URL without sort/page", () => {
    const link = parseFromUrl("#/page/Overview?filter=region:North");
    expect(link.page).toBe("Overview");
    expect(link.filters).toEqual({ region: ["North"] });
    expect(link.sort).toBeUndefined();
    expect(link.pagination).toBeUndefined();
  });
});
