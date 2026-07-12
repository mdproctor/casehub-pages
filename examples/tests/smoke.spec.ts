import { test, expect } from "@playwright/test";
import { readFileSync } from "fs";
import { join } from "path";

interface Sample {
  name: string;
  path: string;
  category: string;
  file: string;
}

interface SamplesData {
  totalSamples: number;
  categories: Array<{
    category: string;
    samples: Sample[];
  }>;
}

const samplesPath = join(__dirname, "../dist/samples.json");
const samples: SamplesData = JSON.parse(readFileSync(samplesPath, "utf-8"));
const allSamples = samples.categories.flatMap((c) => c.samples);

const KNOWN_ERROR_SAMPLES = new Set<string>();

// Samples that fail to load due to external data or unsupported formats.
const EXPECTED_LOAD_FAILURES = new Set(["Prometheus Basic"]);

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

test.describe("Smoke — all samples load without errors", () => {
  test(`gallery has ${allSamples.length} samples in samples.json`, () => {
    expect(allSamples.length).toBeGreaterThanOrEqual(30);
  });

  for (const sample of allSamples) {
    if (EXPECTED_LOAD_FAILURES.has(sample.name)) {
      test(`[known-fail] ${sample.category}/${sample.name} — loads but may show errors (#35)`, async ({
        page,
      }) => {
        const consoleErrors: string[] = [];
        page.on("pageerror", (err) => consoleErrors.push(err.message));

        await openSample(page, sample.name);
        const container = page.locator("#sample-container");
        await expect(container).toBeVisible();
        expect(consoleErrors, `Console errors in "${sample.name}"`).toHaveLength(0);
      });
      continue;
    }

    test(`${sample.category}/${sample.name} — loads and renders without errors`, async ({ page }) => {
      const consoleErrors: string[] = [];
      page.on("pageerror", (err) => consoleErrors.push(err.message));

      await openSample(page, sample.name);

      const errorDiv = page.locator(
        '#sample-target div:has-text("Error loading sample")',
      );
      await expect(errorDiv).toHaveCount(0);

      const statuses = await getComponentStatuses(page);

      if (KNOWN_ERROR_SAMPLES.has(sample.name)) {
        // Known partial: just verify the sample loaded and has some components
        expect(statuses.length).toBeGreaterThan(0);
      } else {
        const errors = statuses.filter((s) => s.status === "ERROR");
        expect(errors).toHaveLength(0);
      }

      expect(consoleErrors, `Console errors in "${sample.name}"`).toHaveLength(0);
    });
  }
});
