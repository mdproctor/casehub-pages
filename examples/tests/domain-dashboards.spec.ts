import { test, expect } from "@playwright/test";

async function openDashboard(page: import("@playwright/test").Page, name: string) {
  await page.goto("/");
  await page.locator("#dashboard-count").waitFor();
  await page.locator(`.dashboard-item:has-text("${name}")`).first().click();
  await page.locator("#dashboard-container").waitFor({ state: "visible" });
  await page.waitForFunction(() => {
    const target = document.getElementById("dashboard-target");
    if (!target) return false;
    const skip = new Set(["page", "panel", "tabs", "sidebar", "accordion", "carousel", "stack", "pills", "html", "title", "markdown", "selector"]);
    for (const c of target.querySelectorAll("[data-component-type]")) {
      const type = (c as HTMLElement).dataset.componentType!;
      if (skip.has(type)) continue;
      const vizEl = c.querySelector(`casehub-${type}`) as HTMLElement & { dataSet?: unknown };
      if (vizEl?.dataSet) return true;
    }
    return false;
  }, { timeout: 10000 });
}

async function getComponentStatuses(page: import("@playwright/test").Page) {
  return page.evaluate(() => {
    const target = document.getElementById("dashboard-target")!;
    const results: Array<{ type: string; id: string; status: string; detail: string }> = [];

    const containers = target.querySelectorAll("[data-component-type]");
    for (const container of containers) {
      const type = (container as HTMLElement).dataset.componentType!;
      const id = (container as HTMLElement).dataset.componentId!;

      if (
        ["page", "panel", "tabs", "sidebar", "accordion", "carousel", "stack", "pills"].includes(type)
      )
        continue;

      if (type === "html" || type === "title" || type === "markdown") {
        const hasContent = container.textContent!.trim().length > 0;
        results.push({
          type,
          id,
          status: hasContent ? "OK" : "EMPTY",
          detail: container.textContent!.trim().substring(0, 50),
        });
        continue;
      }

      const tagName = `casehub-${type}`;
      const vizEl = container.querySelector(tagName) as HTMLElement & {
        error?: string;
        dataSet?: unknown;
      };
      if (!vizEl) {
        results.push({ type, id, status: "NO_ELEMENT", detail: `<${tagName}> not found` });
        continue;
      }

      if (vizEl.error) {
        results.push({ type, id, status: "ERROR", detail: vizEl.error.substring(0, 80) });
      } else if (!vizEl.dataSet) {
        results.push({
          type,
          id,
          status: "NO_DATA",
          detail: vizEl.shadowRoot?.textContent?.substring(0, 50) ?? "",
        });
      } else if (vizEl.shadowRoot?.querySelector("canvas")) {
        results.push({ type, id, status: "CHART_OK", detail: "echarts canvas" });
      } else if (vizEl.shadowRoot?.querySelector("table")) {
        const rows = vizEl.shadowRoot.querySelectorAll("tr").length;
        results.push({ type, id, status: "TABLE_OK", detail: `${String(rows)} rows` });
      } else {
        results.push({
          type,
          id,
          status: "RENDERED",
          detail: vizEl.shadowRoot?.textContent?.substring(0, 50) ?? "",
        });
      }
    }
    return results;
  });
}

interface ChartDataInfo {
  tag: string;
  columns: Array<{ id: string; type: string }>;
  rowCount: number;
  hasNumericValues: boolean;
  canvasWidth: number;
  canvasHeight: number;
}

async function getChartDataInfo(
  page: import("@playwright/test").Page,
  selector: string,
): Promise<ChartDataInfo[]> {
  return page.evaluate((sel) => {
    const target = document.getElementById("dashboard-target")!;
    const elements = target.querySelectorAll(sel);
    const results: ChartDataInfo[] = [];

    elements.forEach((el) => {
      const htmlEl = el as HTMLElement & {
        dataSet?: {
          columns?: Array<{ id: string; type: string }>;
          rows?: Array<{ cells: Array<{ type: string; value: unknown }> }>;
        };
      };
      const canvas = htmlEl.shadowRoot?.querySelector("canvas");
      const info: ChartDataInfo = {
        tag: el.tagName.toLowerCase(),
        columns: htmlEl.dataSet?.columns?.map((c) => ({ id: c.id, type: c.type })) ?? [],
        rowCount: htmlEl.dataSet?.rows?.length ?? 0,
        hasNumericValues: false,
        canvasWidth: canvas?.width ?? 0,
        canvasHeight: canvas?.height ?? 0,
      };

      if (htmlEl.dataSet?.rows && htmlEl.dataSet.rows.length > 0) {
        info.hasNumericValues = htmlEl.dataSet.rows.some((r) =>
          r.cells.some((c) => c.type === "NUMBER"),
        );
      }

      results.push(info);
    });
    return results;
  }, selector);
}

// ---------------------------------------------------------------------------
// Sales Dashboard
// ---------------------------------------------------------------------------

test.describe("Sales Dashboard", () => {
  test("default page renders metrics, charts, and selector", async ({ page }) => {
    await openDashboard(page, "Sales Dashboard");
    const statuses = await getComponentStatuses(page);

    const metrics = statuses.filter((s) => s.type === "metric");
    expect(metrics.length).toBeGreaterThanOrEqual(4);
    expect(metrics.every((m) => m.status === "RENDERED")).toBe(true);

    const charts = statuses.filter(
      (s) => s.type === "bar-chart" || s.type === "pie-chart" || s.type === "line-chart",
    );
    expect(charts.length).toBeGreaterThanOrEqual(3);
    expect(charts.every((c) => c.status === "CHART_OK")).toBe(true);

    const selector = statuses.find((s) => s.type === "selector");
    expect(selector).toBeDefined();
  });

  test("sidebar navigation has 4 entries and Pipeline page works", async ({ page }) => {
    await openDashboard(page, "Sales Dashboard");

    const sidebarButtons = page.locator(".casehub-sidebar button[data-slot]");
    const navCount = await sidebarButtons.count();
    expect(navCount).toBe(4);

    await sidebarButtons.filter({ hasText: "Pipeline" }).click();
    await page.waitForFunction(() => {
      const target = document.getElementById("dashboard-target");
      if (!target) return false;
      const table = target.querySelector("casehub-table") as HTMLElement & { dataSet?: unknown };
      return !!table?.dataSet;
    }, { timeout: 10000 });

    const statuses = await getComponentStatuses(page);
    const table = statuses.find((s) => s.type === "table");
    expect(table?.status).toBe("TABLE_OK");
  });

  test("no errors on any component", async ({ page }) => {
    await openDashboard(page, "Sales Dashboard");
    const statuses = await getComponentStatuses(page);
    const errors = statuses.filter((s) => s.status === "ERROR");
    expect(errors).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// IoT Fleet Monitor
// ---------------------------------------------------------------------------

test.describe("IoT Fleet Monitor", () => {
  test("default page renders metrics, device table, and meters", async ({ page }) => {
    await openDashboard(page, "Fleet Monitor");
    const statuses = await getComponentStatuses(page);

    const metrics = statuses.filter((s) => s.type === "metric");
    expect(metrics.length).toBeGreaterThanOrEqual(4);

    const tables = statuses.filter((s) => s.type === "table");
    expect(tables.length).toBeGreaterThanOrEqual(1);
    expect(tables[0]?.status).toBe("TABLE_OK");

    const meters = statuses.filter((s) => s.type === "meter");
    expect(meters.length).toBe(3);
    expect(meters.every((m) => m.status === "CHART_OK")).toBe(true);
  });

  test("meter gauges have numeric data and non-zero canvas", async ({ page }) => {
    await openDashboard(page, "Fleet Monitor");
    const meterInfo = await getChartDataInfo(page, "casehub-meter");

    expect(meterInfo.length).toBe(3);
    for (const meter of meterInfo) {
      expect(meter.canvasWidth).toBeGreaterThan(0);
      expect(meter.canvasHeight).toBeGreaterThan(0);
      expect(meter.hasNumericValues).toBe(true);
    }
  });

  test("dark mode is applied", async ({ page }) => {
    await openDashboard(page, "Fleet Monitor");

    const isDark = await page.evaluate(() => {
      const target = document.getElementById("dashboard-target");
      if (!target) return false;
      const bg = getComputedStyle(target).backgroundColor;
      const match = bg.match(/\d+/g);
      if (!match) return false;
      const [r, g, b] = match.map(Number);
      return (r! + g! + b!) / 3 < 80;
    });
    expect(isDark).toBe(true);
  });

  test("sidebar nav switches to Sensor History with area chart", async ({ page }) => {
    await openDashboard(page, "Fleet Monitor");

    const sidebarButtons = page.locator(".casehub-sidebar button[data-slot]");
    await sidebarButtons.filter({ hasText: "Sensor History" }).click();
    await page.waitForFunction(() => {
      const target = document.getElementById("dashboard-target");
      if (!target) return false;
      const chart = target.querySelector("casehub-area-chart") as HTMLElement & { dataSet?: unknown };
      return !!chart?.dataSet;
    }, { timeout: 10000 });

    const statuses = await getComponentStatuses(page);
    const areaCharts = statuses.filter((s) => s.type === "area-chart");
    expect(areaCharts.length).toBeGreaterThanOrEqual(1);
    expect(areaCharts[0]?.status).toBe("CHART_OK");
  });

  test("no errors on any component", async ({ page }) => {
    await openDashboard(page, "Fleet Monitor");
    const statuses = await getComponentStatuses(page);
    const errors = statuses.filter((s) => s.status === "ERROR");
    expect(errors).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Workforce Analytics
// ---------------------------------------------------------------------------

test.describe("Workforce Analytics", () => {
  test("single page renders selector, panels with charts, and table", async ({ page }) => {
    await openDashboard(page, "Workforce Analytics");
    const statuses = await getComponentStatuses(page);

    const selector = statuses.find((s) => s.type === "selector");
    expect(selector).toBeDefined();

    const charts = statuses.filter(
      (s) =>
        s.type === "bar-chart" ||
        s.type === "pie-chart" ||
        s.type === "scatter-chart",
    );
    expect(charts.length).toBeGreaterThanOrEqual(4);
    expect(charts.every((c) => c.status === "CHART_OK")).toBe(true);

    const table = statuses.find((s) => s.type === "table");
    expect(table?.status).toBe("TABLE_OK");
  });

  test("pie charts have numeric value columns, not duplicate labels", async ({ page }) => {
    await openDashboard(page, "Workforce Analytics");
    const pies = await getChartDataInfo(page, "casehub-pie-chart");

    expect(pies.length).toBe(2);
    for (const pie of pies) {
      expect(pie.rowCount).toBeGreaterThan(0);
      expect(pie.hasNumericValues).toBe(true);
      const types = pie.columns.map((c) => c.type);
      expect(types).toContain("NUMBER");
    }
  });

  test("bar charts have numeric value columns", async ({ page }) => {
    await openDashboard(page, "Workforce Analytics");
    const bars = await getChartDataInfo(page, "casehub-bar-chart");

    expect(bars.length).toBeGreaterThanOrEqual(2);
    for (const bar of bars) {
      expect(bar.rowCount).toBeGreaterThan(0);
      expect(bar.hasNumericValues).toBe(true);
    }
  });

  test("scatter chart has numeric x and y columns", async ({ page }) => {
    await openDashboard(page, "Workforce Analytics");
    const scatters = await getChartDataInfo(page, "casehub-scatter-chart");

    expect(scatters.length).toBe(1);
    const scatter = scatters[0]!;
    expect(scatter.rowCount).toBe(40);
    expect(scatter.columns.length).toBeGreaterThanOrEqual(2);
    expect(scatter.columns[0]!.type).toBe("NUMBER");
    expect(scatter.columns[1]!.type).toBe("NUMBER");
  });

  test("no errors on any component", async ({ page }) => {
    await openDashboard(page, "Workforce Analytics");
    const statuses = await getComponentStatuses(page);
    const errors = statuses.filter((s) => s.status === "ERROR");
    expect(errors).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Patient Tracker
// ---------------------------------------------------------------------------

test.describe("Patient Tracker", () => {
  test("default tab renders metrics, selector, charts, and markdown", async ({ page }) => {
    await openDashboard(page, "Patient Tracker");
    const statuses = await getComponentStatuses(page);

    const metrics = statuses.filter((s) => s.type === "metric");
    expect(metrics.length).toBeGreaterThanOrEqual(4);

    const selector = statuses.find((s) => s.type === "selector");
    expect(selector).toBeDefined();

    const charts = statuses.filter(
      (s) => s.type === "bar-chart" || s.type === "pie-chart",
    );
    expect(charts.length).toBeGreaterThanOrEqual(2);

    const markdown = statuses.find((s) => s.type === "markdown");
    expect(markdown?.status).toBe("OK");
  });

  test("markdown has clinical content, not DevOps", async ({ page }) => {
    await openDashboard(page, "Patient Tracker");

    const markdownText = await page.evaluate(() => {
      const containers = document.querySelectorAll("[data-component-type='markdown']");
      return Array.from(containers)
        .map((c) => c.textContent?.trim() ?? "")
        .join(" ");
    });
    expect(markdownText.length).toBeGreaterThan(20);
    expect(markdownText).toMatch(/ward|patient|protocol|clinical/i);
  });

  test("tab nav switches to Patient Detail with table and form", async ({ page }) => {
    await openDashboard(page, "Patient Tracker");

    const tabButtons = page.locator("[data-component-type='tabs'] button");
    await tabButtons.filter({ hasText: "Patient Detail" }).click();
    await page.waitForFunction(() => {
      const target = document.getElementById("dashboard-target");
      if (!target) return false;
      const table = target.querySelector("casehub-table") as HTMLElement & { dataSet?: unknown };
      return !!table?.dataSet;
    }, { timeout: 10000 });

    const statuses = await getComponentStatuses(page);
    const table = statuses.find((s) => s.type === "table");
    expect(table?.status).toBe("TABLE_OK");
  });

  test("no errors on any component", async ({ page }) => {
    await openDashboard(page, "Patient Tracker");
    const statuses = await getComponentStatuses(page);
    const errors = statuses.filter((s) => s.status === "ERROR");
    expect(errors).toHaveLength(0);
  });
});
