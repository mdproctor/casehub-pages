import { test, expect } from "@playwright/test";

test.describe("Gallery infrastructure", () => {
  test("loads sidebar with sample count", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("#sample-count")).toHaveText(/\d+ samples/);
  });

  test("shows categories in sidebar", async ({ page }) => {
    await page.goto("/");
    const categories = page.locator(".category");
    await expect(categories).not.toHaveCount(0);
  });

  test("shows welcome screen initially", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("#welcome-screen")).toBeVisible();
    await expect(page.locator("#sample-container")).not.toBeVisible();
  });

  test("search filters samples", async ({ page }) => {
    await page.goto("/");
    await page.fill("#search", "Charts");
    const visible = page.locator(".sample-item:not(.hidden)");
    await expect(visible.first()).toBeVisible();
  });
});

/**
 * Helper: click a sample by name and wait for loadSite to complete.
 */
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

/**
 * Helper: count pages-* custom elements with echarts canvas inside shadow DOM.
 */
async function countRenderedCharts(page: import("@playwright/test").Page): Promise<number> {
  return page.evaluate(() => {
    const target = document.getElementById("sample-target")!;
    let count = 0;
    const charts = target.querySelectorAll(
      "pages-bar-chart, pages-line-chart, pages-area-chart, pages-pie-chart, " +
      "pages-scatter-chart, pages-bubble-chart, pages-timeseries, pages-meter"
    );
    for (const chart of charts) {
      if (chart.shadowRoot?.querySelector("canvas")) count++;
    }
    return count;
  });
}

/**
 * Helper: get component status — what the human would see for each data component.
 */
async function getComponentStatuses(page: import("@playwright/test").Page) {
  return page.evaluate(() => {
    const target = document.getElementById("sample-target")!;
    const results: Array<{ type: string; id: string; status: string; detail: string }> = [];

    const containers = target.querySelectorAll("[data-component-type]");
    for (const container of containers) {
      const type = (container as HTMLElement).dataset.componentType!;
      const id = (container as HTMLElement).dataset.componentId!;

      // Skip layout types
      if (["page", "panel", "tabs", "sidebar", "accordion", "carousel", "stack", "pills"].includes(type)) continue;

      // Content types
      if (type === "html" || type === "title" || type === "markdown") {
        const hasContent = container.textContent!.trim().length > 0;
        results.push({ type, id, status: hasContent ? "OK" : "EMPTY", detail: container.textContent!.trim().substring(0, 50) });
        continue;
      }

      // Data component
      const tagName = `pages-${type}`;
      const vizEl = container.querySelector(tagName) as any;
      if (!vizEl) {
        results.push({ type, id, status: "NO_ELEMENT", detail: `<${tagName}> not found` });
        continue;
      }

      if (vizEl.error) {
        results.push({ type, id, status: "ERROR", detail: vizEl.error.substring(0, 80) });
      } else if (!vizEl.dataSet) {
        results.push({ type, id, status: "NO_DATA", detail: vizEl.shadowRoot?.textContent?.substring(0, 50) || "" });
      } else if (vizEl.shadowRoot?.querySelector("canvas")) {
        results.push({ type, id, status: "CHART_OK", detail: "echarts canvas" });
      } else if (vizEl.shadowRoot?.querySelector("table")) {
        const rows = vizEl.shadowRoot.querySelectorAll("tr").length;
        results.push({ type, id, status: "TABLE_OK", detail: `${rows} rows` });
      } else {
        results.push({ type, id, status: "RENDERED", detail: vizEl.shadowRoot?.textContent?.substring(0, 50) || "" });
      }
    }
    return results;
  });
}

test.describe("Charts", () => {
  test("renders bar charts on default tab", async ({ page }) => {
    await openSample(page, "Charts");

    const charts = await countRenderedCharts(page);
    expect(charts).toBeGreaterThanOrEqual(4);
  });
});

test.describe("Filter", () => {
  test("renders selector and bar chart", async ({ page }) => {
    await openSample(page, "Filter");
    const statuses = await getComponentStatuses(page);

    const selector = statuses.find(s => s.type === "selector");
    expect(selector?.status).toBe("RENDERED");

    const chart = statuses.find(s => s.type === "bar-chart");
    expect(chart?.status).toBe("CHART_OK");
  });
});

test.describe("Selectors and Filters", () => {
  test("renders selector and chart on default tab", async ({ page }) => {
    await openSample(page, "Selectors and Filters");
    const statuses = await getComponentStatuses(page);

    const selector = statuses.find(s => s.type === "selector");
    expect(selector).toBeDefined();

    const chart = statuses.find(s => s.type === "bar-chart");
    expect(chart?.status).toBe("CHART_OK");
  });
});

test.describe("DarkMode", () => {
  test("renders bar chart with data", async ({ page }) => {
    await openSample(page, "DarkMode");
    const charts = await countRenderedCharts(page);
    expect(charts).toBe(1);
  });
});

test.describe("Decal Pattern", () => {
  test("renders bar chart", async ({ page }) => {
    await openSample(page, "Decal Pattern");
    const charts = await countRenderedCharts(page);
    expect(charts).toBe(1);
  });
});

test.describe("Accumulate Flag", () => {
  test("renders timeseries chart", async ({ page }) => {
    await openSample(page, "Accumulate Flag");
    const charts = await countRenderedCharts(page);
    expect(charts).toBe(1);
  });
});

test.describe("Histogram", () => {
  test("renders bar chart with histogram data", async ({ page }) => {
    await openSample(page, "Histogram");
    const statuses = await getComponentStatuses(page);

    const chart = statuses.find(s => s.type === "bar-chart");
    expect(chart?.status).toBe("CHART_OK");
  });
});

test.describe("Most Spoken Languages", () => {
  test("renders HTML title, bar chart, and table", async ({ page }) => {
    await openSample(page, "Most Spoken Languages");
    const statuses = await getComponentStatuses(page);

    const html = statuses.find(s => s.type === "html");
    expect(html?.status).toBe("OK");

    const chart = statuses.find(s => s.type === "bar-chart");
    expect(chart?.status).toBe("CHART_OK");

    const table = statuses.find(s => s.type === "table");
    expect(table?.status).toBe("TABLE_OK");
  });
});

test.describe("Global Lookup Operation", () => {
  test("renders charts with global default lookup", async ({ page }) => {
    await openSample(page, "Global Lookup Operation");
    const charts = await countRenderedCharts(page);
    expect(charts).toBeGreaterThanOrEqual(1);

    // No errors on any component
    const statuses = await getComponentStatuses(page);
    const errors = statuses.filter(s => s.status === "ERROR");
    expect(errors).toHaveLength(0);
  });
});

test.describe("Column with rows", () => {
  test("renders all three chart types from nested layout", async ({ page }) => {
    await openSample(page, "Column with rows");
    const charts = await countRenderedCharts(page);
    expect(charts).toBe(3); // bar-chart, pie-chart, meter
  });
});

test.describe("Global Column settings", () => {
  test("renders charts with global defaults and inline content", async ({ page }) => {
    await openSample(page, "Global Column settings");
    const statuses = await getComponentStatuses(page);

    const unknowns = statuses.filter(s => s.status === "NO_ELEMENT" && s.type === "unknown");
    expect(unknowns).toHaveLength(0);

    // Should have table and bar-chart components with data
    const dataComponents = statuses.filter(s =>
      s.status === "CHART_OK" || s.status === "TABLE_OK" || s.status === "RENDERED"
    );
    expect(dataComponents.length).toBeGreaterThan(0);
  });
});

test.describe("Github Repositories (external API + JSONata)", () => {
  test("renders bar chart and table with live GitHub data", async ({ page }) => {
    await openSample(page, "Github Repositories");
    const statuses = await getComponentStatuses(page);

    const chart = statuses.find(s => s.type === "bar-chart");
    expect(chart?.status).toBe("CHART_OK");

    const table = statuses.find(s => s.type === "table");
    expect(table?.status).toBe("TABLE_OK");
  });
});

test.describe("FIFA 2022 Goals (external API + metrics)", () => {
  test("renders metrics with substituted titles", async ({ page }) => {
    await openSample(page, "FIFA 2022 Goals");
    const statuses = await getComponentStatuses(page);

    const metrics = statuses.filter(s => s.type === "metric");
    expect(metrics.length).toBeGreaterThanOrEqual(1);
    expect(metrics.every(m => m.status === "RENDERED")).toBe(true);

    // Verify ${title} is substituted — should NOT appear literally
    const metricText = await page.evaluate(() => {
      const els = document.querySelectorAll('pages-metric');
      return Array.from(els).map(el => el.shadowRoot?.textContent || '').join(' ');
    });
    expect(metricText).not.toContain("${title}");
  });
});

test.describe("Google Spreadsheet (external API)", () => {
  test("renders chart and table", async ({ page }) => {
    await openSample(page, "Google Spreadsheet");
    const charts = await countRenderedCharts(page);
    expect(charts).toBeGreaterThanOrEqual(1);
  });
});

test.describe("Table sample (external API)", () => {
  test("renders bar chart and table from GitHub Gists", async ({ page }) => {
    await openSample(page, "Table");
    const statuses = await getComponentStatuses(page);

    const dataComponents = statuses.filter(s =>
      s.status === "CHART_OK" || s.status === "TABLE_OK"
    );
    expect(dataComponents.length).toBeGreaterThanOrEqual(1);
  });
});
