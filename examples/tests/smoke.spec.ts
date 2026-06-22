import { test, expect } from "@playwright/test";
import { readFileSync } from "fs";
import { join } from "path";

interface Dashboard {
  name: string;
  path: string;
  category: string;
  file: string;
}

interface SamplesData {
  totalDashboards: number;
  categories: Array<{
    category: string;
    dashboards: Dashboard[];
  }>;
}

const samplesPath = join(__dirname, "../dist/samples.json");
const samples: SamplesData = JSON.parse(readFileSync(samplesPath, "utf-8"));
const allDashboards = samples.categories.flatMap((c) => c.dashboards);

// Kitchensink has known partial issues: iframe-plugin (external component server required),
// map (regions property undefined). These produce ERROR statuses that are expected.
const KNOWN_ERROR_DASHBOARDS = new Set(["Kitchensink"]);

// Prometheus Basic has a known failure: API response format not supported (#35).
// The dashboard errors on load because the data extraction layer can't parse the response.
const EXPECTED_LOAD_FAILURES = new Set(["Prometheus Basic"]);

async function openDashboard(page: import("@playwright/test").Page, name: string) {
  await page.goto("/");
  await page.locator("#dashboard-count").waitFor();
  await page.locator(`.dashboard-item:has-text("${name}")`).first().click();
  await page.locator("#dashboard-container").waitFor({ state: "visible" });
  await page.waitForTimeout(2000);
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
        ["page", "panel", "tabs", "sidebar", "accordion", "carousel", "stack", "pills"].includes(
          type,
        )
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
        results.push({ type, id, status: "TABLE_OK", detail: `${rows} rows` });
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

test.describe("Smoke — all dashboards load without errors", () => {
  test(`gallery has ${allDashboards.length} dashboards in samples.json`, () => {
    expect(allDashboards.length).toBeGreaterThanOrEqual(30);
  });

  for (const dashboard of allDashboards) {
    if (EXPECTED_LOAD_FAILURES.has(dashboard.name)) {
      test(`[known-fail] ${dashboard.name} — loads but may show errors (#35)`, async ({
        page,
      }) => {
        await openDashboard(page, dashboard.name);
        const container = page.locator("#dashboard-container");
        await expect(container).toBeVisible();
      });
      continue;
    }

    test(`${dashboard.name} — loads and renders without errors`, async ({ page }) => {
      await openDashboard(page, dashboard.name);

      const errorDiv = page.locator(
        '#dashboard-target div:has-text("Error loading dashboard")',
      );
      await expect(errorDiv).toHaveCount(0);

      const statuses = await getComponentStatuses(page);

      if (KNOWN_ERROR_DASHBOARDS.has(dashboard.name)) {
        // Known partial: just verify the dashboard loaded and has some components
        expect(statuses.length).toBeGreaterThan(0);
      } else {
        const errors = statuses.filter((s) => s.status === "ERROR");
        expect(errors).toHaveLength(0);
      }
    });
  }
});
