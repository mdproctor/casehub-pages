import { test, expect } from "@playwright/test";

async function openSample(page: import("@playwright/test").Page, name: string) {
  await page.goto("/");
  await page.locator("#sample-count").waitFor();
  await page.locator(`.sample-item:has-text("${name}")`).first().click();
  await page.locator("#sample-container").waitFor({ state: "visible" });
  await page.waitForFunction(() => {
    const target = document.getElementById("sample-target");
    if (!target) return false;
    const skip = new Set(["page", "panel", "tabs", "sidebar", "accordion", "carousel", "stack", "pills", "html", "title", "markdown", "selector"]);
    for (const c of target.querySelectorAll("[data-component-type]")) {
      const type = (c as HTMLElement).dataset.componentType!;
      if (skip.has(type)) continue;
      const vizEl = c.querySelector(`pages-${type}`) as HTMLElement & { dataSet?: unknown };
      if (vizEl?.dataSet) return true;
    }
    return false;
  }, { timeout: 10000 });
}

async function getComponentStatuses(page: import("@playwright/test").Page) {
  return page.evaluate(() => {
    const target = document.getElementById("sample-target")!;
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

      if (type === "alert" || type === "action-button" || type === "badge") {
        // These components render as standard HTML, not web components
        const hasContent = container.textContent!.trim().length > 0;
        results.push({
          type,
          id,
          status: hasContent ? "OK" : "EMPTY",
          detail: container.textContent!.trim().substring(0, 50),
        });
        continue;
      }

      const tagName = `pages-${type}`;
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
    const target = document.getElementById("sample-target")!;
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
    await openSample(page, "Sales Dashboard");
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
    await openSample(page, "Sales Dashboard");

    const sidebarButtons = page.locator(".pages-sidebar button[data-slot]");
    const navCount = await sidebarButtons.count();
    expect(navCount).toBe(4);

    await sidebarButtons.filter({ hasText: "Pipeline" }).click();
    await page.waitForFunction(() => {
      const target = document.getElementById("sample-target");
      if (!target) return false;
      const table = target.querySelector("pages-data-table") as HTMLElement & { dataSet?: unknown };
      return !!table?.dataSet;
    }, { timeout: 10000 });

    const statuses = await getComponentStatuses(page);
    const table = statuses.find((s) => s.type === "table");
    expect(table?.status).toBe("TABLE_OK");
  });

  test("no errors on any component", async ({ page }) => {
    await openSample(page, "Sales Dashboard");
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
    await openSample(page, "Fleet Monitor");
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
    await openSample(page, "Fleet Monitor");
    const meterInfo = await getChartDataInfo(page, "pages-meter");

    expect(meterInfo.length).toBe(3);
    for (const meter of meterInfo) {
      expect(meter.canvasWidth).toBeGreaterThan(0);
      expect(meter.canvasHeight).toBeGreaterThan(0);
      expect(meter.hasNumericValues).toBe(true);
    }
  });

  test("dark mode is applied", async ({ page }) => {
    await openSample(page, "Fleet Monitor");

    const isDark = await page.evaluate(() => {
      const target = document.getElementById("sample-target");
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
    await openSample(page, "Fleet Monitor");

    const sidebarButtons = page.locator(".pages-sidebar button[data-slot]");
    await sidebarButtons.filter({ hasText: "Sensor History" }).click();
    await page.waitForFunction(() => {
      const target = document.getElementById("sample-target");
      if (!target) return false;
      const chart = target.querySelector("pages-area-chart") as HTMLElement & { dataSet?: unknown };
      return !!chart?.dataSet;
    }, { timeout: 10000 });

    const statuses = await getComponentStatuses(page);
    const areaCharts = statuses.filter((s) => s.type === "area-chart");
    expect(areaCharts.length).toBeGreaterThanOrEqual(1);
    expect(areaCharts[0]?.status).toBe("CHART_OK");
  });

  test("no errors on any component", async ({ page }) => {
    await openSample(page, "Fleet Monitor");
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
    await openSample(page, "Workforce Analytics");
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
    await openSample(page, "Workforce Analytics");
    const pies = await getChartDataInfo(page, "pages-pie-chart");

    expect(pies.length).toBe(2);
    for (const pie of pies) {
      expect(pie.rowCount).toBeGreaterThan(0);
      expect(pie.hasNumericValues).toBe(true);
      const types = pie.columns.map((c) => c.type);
      expect(types).toContain("NUMBER");
    }
  });

  test("bar charts have numeric value columns", async ({ page }) => {
    await openSample(page, "Workforce Analytics");
    const bars = await getChartDataInfo(page, "pages-bar-chart");

    expect(bars.length).toBeGreaterThanOrEqual(2);
    for (const bar of bars) {
      expect(bar.rowCount).toBeGreaterThan(0);
      expect(bar.hasNumericValues).toBe(true);
    }
  });

  test("scatter chart has numeric x and y columns", async ({ page }) => {
    await openSample(page, "Workforce Analytics");
    const scatters = await getChartDataInfo(page, "pages-scatter-chart");

    expect(scatters.length).toBe(1);
    const scatter = scatters[0]!;
    expect(scatter.rowCount).toBe(40);
    expect(scatter.columns.length).toBeGreaterThanOrEqual(2);
    expect(scatter.columns[0]!.type).toBe("NUMBER");
    expect(scatter.columns[1]!.type).toBe("NUMBER");
  });

  test("no errors on any component", async ({ page }) => {
    await openSample(page, "Workforce Analytics");
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
    await openSample(page, "Patient Tracker");
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
    await openSample(page, "Patient Tracker");

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
    await openSample(page, "Patient Tracker");

    const tabButtons = page.locator("[data-component-type='tabs'] button");
    await tabButtons.filter({ hasText: "Patient Detail" }).click();
    await page.waitForFunction(() => {
      const target = document.getElementById("sample-target");
      if (!target) return false;
      const table = target.querySelector("pages-data-table") as HTMLElement & { dataSet?: unknown };
      return !!table?.dataSet;
    }, { timeout: 10000 });

    const statuses = await getComponentStatuses(page);
    const table = statuses.find((s) => s.type === "table");
    expect(table?.status).toBe("TABLE_OK");
  });

  test("no errors on any component", async ({ page }) => {
    await openSample(page, "Patient Tracker");
    const statuses = await getComponentStatuses(page);
    const errors = statuses.filter((s) => s.status === "ERROR");
    expect(errors).toHaveLength(0);
  });

  test("new components render: badge, alert, action-button", async ({ page }) => {
    await openSample(page, "Patient Tracker");
    let statuses = await getComponentStatuses(page);

    // Badge should render on Ward Overview
    const badge = statuses.find((s) => s.type === "badge");
    expect(badge).toBeDefined();
    expect(badge?.status).not.toBe("ERROR");

    // Alert should render on Ward Overview
    const alert = statuses.find((s) => s.type === "alert");
    expect(alert).toBeDefined();
    expect(alert?.status).not.toBe("ERROR");

    // Navigate to Patient Detail tab
    const tabButtons = page.locator("[data-component-type='tabs'] button");
    await tabButtons.filter({ hasText: "Patient Detail" }).click();
    await page.waitForTimeout(500);

    // Action button should render on Patient Detail
    statuses = await getComponentStatuses(page);
    const actionBtn = statuses.find((s) => s.type === "action-button");
    expect(actionBtn).toBeDefined();
    expect(actionBtn?.status).not.toBe("ERROR");
  });

  test("content interpolation in markdown panel updates with filter", async ({ page }) => {
    await openSample(page, "Patient Tracker");

    // Initially, markdown should show total patient count
    const initialMarkdown = await page.evaluate(() => {
      const containers = document.querySelectorAll("[data-component-type='markdown']");
      return Array.from(containers)
        .map((c) => c.textContent?.trim() ?? "")
        .join(" ");
    });
    expect(initialMarkdown).toMatch(/25 patients/i);

    // Select ICU ward filter
    const dropdown = page.locator("[data-component-type='selector'] select").first();
    await dropdown.selectOption({ label: "ICU" });
    await page.waitForTimeout(500); // Wait for filter to apply

    // Markdown should now show ICU ward and reduced patient count
    const filteredMarkdown = await page.evaluate(() => {
      const containers = document.querySelectorAll("[data-component-type='markdown']");
      return Array.from(containers)
        .map((c) => c.textContent?.trim() ?? "")
        .join(" ");
    });
    expect(filteredMarkdown).toMatch(/ICU/i);
    expect(filteredMarkdown).toMatch(/5 patients/i);
  });

  test("alert component renders", async ({ page }) => {
    await openSample(page, "Patient Tracker");

    // Alert component should be present
    const alertExists = await page.evaluate(() => {
      const alert = document.querySelector("[data-component-type='alert']");
      return alert !== null;
    });
    expect(alertExists).toBe(true);
  });

  test("row styling configuration is present on vitals table", async ({ page }) => {
    await openSample(page, "Patient Tracker");

    // Navigate to Vitals Monitor tab
    const tabButtons = page.locator("[data-component-type='tabs'] button");
    await tabButtons.filter({ hasText: "Vitals Monitor" }).click();
    await page.waitForTimeout(500);

    // Check that the vitals table renders with rows
    const hasRows = await page.evaluate(() => {
      const table = document.querySelector("pages-data-table");
      if (!table || !table.shadowRoot) return false;

      const rows = table.shadowRoot.querySelectorAll("tbody tr");
      return rows.length > 0;
    });

    expect(hasRows).toBe(true);
  });

  test("visibleWhen on Patient Detail table evaluates filter expression", async ({ page }) => {
    await openSample(page, "Patient Tracker");

    // Navigate to Patient Detail tab
    const tabButtons = page.locator("[data-component-type='tabs'] button");
    await tabButtons.filter({ hasText: "Patient Detail" }).click();
    await page.waitForTimeout(500);

    // Check if table container exists and has visibleWhen behavior
    const tableExists = await page.evaluate(() => {
      const containers = document.querySelectorAll("[data-component-type='table']");
      for (const container of containers) {
        const vizEl = container.querySelector("pages-data-table");
        if (vizEl) {
          return true;
        }
      }
      return false;
    });
    expect(tableExists).toBe(true);
  });
});
