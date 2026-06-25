import { describe, it, expect } from "vitest";
import type {
  PageProps,
  PageSettings,
  ViewState,
  DeepLink,
  DataComponentDefaults,
  LookupDefaults,
  DataSetDefaults,
  Site,
} from "./page-types.js";
import type { Component } from "./types.js";
import type { DataSetId } from "@casehubio/pages-data/dist/dataset/types.js";
import { columnId } from "@casehubio/pages-data/dist/dataset/types.js";
import { ColumnType } from "@casehubio/pages-data/dist/dataset/types.js";
import type { ExternalDataSetDef } from "@casehubio/pages-data/dist/dataset/external/types.js";
import { HttpMethod } from "@casehubio/pages-data/dist/dataset/external/types.js";
import { filterBy } from "../dsl/lookup-helpers.js";

describe("PageProps", () => {
  it("has name, datasets, settings, properties", () => {
    const datasets: readonly ExternalDataSetDef[] = [
      {
        uuid: "ds1" as DataSetId,
        name: "Sales Data",
        url: "https://api.example.com/sales",
      },
    ];

    const props: PageProps = {
      name: "Dashboard",
      datasets,
      settings: { mode: "dark" },
      properties: { title: "Sales Overview" },
    };

    expect(props.name).toBe("Dashboard");
    expect(props.datasets).toBe(datasets);
    expect(props.settings?.mode).toBe("dark");
    expect(props.properties?.title).toBe("Sales Overview");
  });

  it("all fields are optional", () => {
    const props: PageProps = {};
    expect(props.name).toBeUndefined();
    expect(props.datasets).toBeUndefined();
    expect(props.settings).toBeUndefined();
    expect(props.properties).toBeUndefined();
  });
});

describe("PageSettings", () => {
  it("has mode with light and dark", () => {
    const light: PageSettings = { mode: "light" };
    const dark: PageSettings = { mode: "dark" };

    expect(light.mode).toBe("light");
    expect(dark.mode).toBe("dark");
  });

  it("has allowUrlProperties flag", () => {
    const settings: PageSettings = {
      allowUrlProperties: true,
    };

    expect(settings.allowUrlProperties).toBe(true);
  });

  it("has dataComponentDefaults", () => {
    const settings: PageSettings = {
      dataComponentDefaults: {
        lookup: { dataSetId: "default-ds" as DataSetId, operations: [] },
        chart: { resizable: true, zoom: true },
      },
    };

    expect(settings.dataComponentDefaults?.lookup?.dataSetId).toBe("default-ds");
    expect(settings.dataComponentDefaults?.chart?.resizable).toBe(true);
  });

  it("has datasetDefaults", () => {
    const settings: PageSettings = {
      datasetDefaults: {
        url: "https://api.example.com",
        method: HttpMethod.GET,
        cacheEnabled: true,
        refreshTime: "5m",
      },
    };

    expect(settings.datasetDefaults?.url).toBe("https://api.example.com");
    expect(settings.datasetDefaults?.method).toBe(HttpMethod.GET);
    expect(settings.datasetDefaults?.cacheEnabled).toBe(true);
    expect(settings.datasetDefaults?.refreshTime).toBe("5m");
  });
});

describe("DataComponentDefaults", () => {
  it("has lookup defaults", () => {
    const defaults: DataComponentDefaults = {
      lookup: {
        dataSetId: "global-ds" as DataSetId,
        operations: [],
        rowCount: 100,
        rowOffset: 0,
      },
    };

    expect(defaults.lookup?.dataSetId).toBe("global-ds");
    expect(defaults.lookup?.rowCount).toBe(100);
  });

  it("has chart defaults as partial ChartSettings", () => {
    const defaults: DataComponentDefaults = {
      chart: {
        resizable: true,
        legend: { show: true, position: "bottom" },
      },
    };

    expect(defaults.chart?.resizable).toBe(true);
    expect(defaults.chart?.legend?.position).toBe("bottom");
  });
});

describe("LookupDefaults", () => {
  it("has dataSetId and operations", () => {
    const defaults: LookupDefaults = {
      dataSetId: "default-ds" as DataSetId,
      operations: [filterBy("status", "EQUALS_TO", "active")],
    };

    expect(defaults.dataSetId).toBe("default-ds");
    expect(defaults.operations).toHaveLength(1);
  });

  it("has rowCount and rowOffset", () => {
    const defaults: LookupDefaults = {
      rowCount: 50,
      rowOffset: 10,
    };

    expect(defaults.rowCount).toBe(50);
    expect(defaults.rowOffset).toBe(10);
  });
});

describe("DataSetDefaults", () => {
  it("has url, content, method, headers", () => {
    const defaults: DataSetDefaults = {
      url: "https://api.example.com/data",
      content: "inline content",
      method: HttpMethod.POST,
      headers: { Authorization: "Bearer token" },
    };

    expect(defaults.url).toBe("https://api.example.com/data");
    expect(defaults.content).toBe("inline content");
    expect(defaults.method).toBe(HttpMethod.POST);
    expect(defaults.headers?.Authorization).toBe("Bearer token");
  });

  it("has columns array", () => {
    const defaults: DataSetDefaults = {
      columns: [
        { id: columnId("col1"), name: "Column 1", type: ColumnType.NUMBER },
        { id: columnId("col2"), name: "Column 2", type: ColumnType.LABEL },
      ],
    };

    expect(defaults.columns).toHaveLength(2);
    expect(defaults.columns![0]!.id).toBe("col1");
  });

  it("has cacheEnabled and refreshTime", () => {
    const defaults: DataSetDefaults = {
      cacheEnabled: true,
      refreshTime: "10m",
    };

    expect(defaults.cacheEnabled).toBe(true);
    expect(defaults.refreshTime).toBe("10m");
  });
});

describe("ViewState", () => {
  it("has currentPage, activeFilters, sort, pagination, textFilter", () => {
    const state: ViewState = {
      currentPage: "overview",
      activeFilters: {
        status: ["active", "pending"],
        region: ["NA", "EU"],
      },
      sort: {
        "table-1": { columnId: "revenue", order: "ASCENDING" },
      },
      pagination: { "table-1": 2 },
      textFilter: { "table-1": "search term" },
    };

    expect(state.currentPage).toBe("overview");
    expect(state.activeFilters.status).toEqual(["active", "pending"]);
    expect(state.activeFilters.region).toEqual(["NA", "EU"]);
    expect(state.sort["table-1"]!.columnId).toBe("revenue");
    expect(state.pagination["table-1"]).toBe(2);
    expect(state.textFilter["table-1"]).toBe("search term");
  });
});

describe("DeepLink", () => {
  it("has page and optional filters", () => {
    const link: DeepLink = {
      page: "dashboard",
      filters: { status: ["active"] },
    };

    expect(link.page).toBe("dashboard");
    expect(link.filters?.status).toEqual(["active"]);
  });

  it("has optional filters", () => {
    const link: DeepLink = {
      page: "dashboard",
      filters: {
        status: ["active", "pending"],
        priority: ["high"],
      },
    };

    expect(link.filters?.status).toEqual(["active", "pending"]);
    expect(link.filters?.priority).toEqual(["high"]);
  });

  it("has optional sort configuration", () => {
    const link: DeepLink = {
      page: "dashboard",
      sort: { "table-1": { columnId: "revenue", order: "ASCENDING" } },
    };

    expect(link.sort?.["table-1"]?.columnId).toBe("revenue");
    expect(link.sort?.["table-1"]?.order).toBe("ASCENDING");
  });

  it("has optional pagination configuration", () => {
    const link: DeepLink = {
      page: "dashboard",
      pagination: { "table-1": 3 },
    };

    expect(link.pagination?.["table-1"]).toBe(3);
  });
});

function emptyViewState(overrides?: Partial<ViewState>): ViewState {
  return { currentPage: "", activeFilters: {}, sort: {}, pagination: {}, textFilter: {}, ...overrides };
}

describe("Site", () => {
  it("has root component", () => {
    const root: Component = { type: "page", props: {} };
    const state = emptyViewState();

    const site: Site = {
      root,
      page: () => null,
      dataset: () => null,
      state,
    };

    expect(site.root).toBe(root);
  });

  it("has page method returning Component or null", () => {
    const root: Component = { type: "page", props: {} };
    const state = emptyViewState();

    const site: Site = {
      root,
      page: (path: string) => {
        if (path === "dashboard") {
          return { type: "page", props: { name: "Dashboard" } };
        }
        return null;
      },
      dataset: () => null,
      state,
    };

    const found = site.page("dashboard");
    const notFound = site.page("unknown");

    expect(found).not.toBeNull();
    expect(found?.type).toBe("page");
    expect(notFound).toBeNull();
  });

  it("has dataset method returning ExternalDataSetDef or null", () => {
    const root: Component = { type: "page", props: {} };
    const state = emptyViewState();

    const site: Site = {
      root,
      page: () => null,
      dataset: (id: DataSetId) => {
        if (id === "sales-data" as DataSetId) {
          return {
            uuid: id,
            name: "Sales Data",
            url: "https://api.example.com/sales",
          };
        }
        return null;
      },
      state,
    };

    const found = site.dataset("sales-data" as DataSetId);
    const notFound = site.dataset("unknown" as DataSetId);

    expect(found).not.toBeNull();
    expect(found?.name).toBe("Sales Data");
    expect(notFound).toBeNull();
  });

  it("has state property", () => {
    const root: Component = { type: "page", props: {} };
    const state = emptyViewState({ currentPage: "overview" });

    const site: Site = {
      root,
      page: () => null,
      dataset: () => null,
      state,
    };

    expect(site.state).toBe(state);
    expect(site.state.currentPage).toBe("overview");
  });
});
