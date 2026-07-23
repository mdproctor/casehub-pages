import { test, expect } from "@playwright/test";

async function loadScenario(page: import("@playwright/test").Page, scenario: string) {
  await page.goto(`/fixtures/table-spanning-test.html?scenario=${scenario}`);
  await page.waitForFunction(
    () => document.body.dataset.ready === "true",
    { timeout: 15000 },
  );
  await page.waitForTimeout(300);
}

function getTable(page: import("@playwright/test").Page) {
  return page.locator("pages-data-table").first();
}

test.describe("Table spanning — visual tests", () => {
  test.use({ viewport: { width: 800, height: 600 } });

  test("colspan renders correctly", async ({ page }) => {
    await loadScenario(page, "colspan");
    const table = getTable(page);
    await expect(table).toBeVisible();
    await expect(table).toHaveScreenshot("colspan.png");
  });

  test("rowspan renders correctly", async ({ page }) => {
    await loadScenario(page, "rowspan");
    const table = getTable(page);
    await expect(table).toBeVisible();
    await expect(table).toHaveScreenshot("rowspan.png");
  });

  test("both directions", async ({ page }) => {
    await loadScenario(page, "both");
    const table = getTable(page);
    await expect(table).toBeVisible();
    await expect(table).toHaveScreenshot("both-directions.png");
  });

  test("scroll into rowspan from above", async ({ page }) => {
    await loadScenario(page, "scroll-mid");
    const table = getTable(page);
    await expect(table).toBeVisible();

    await page.evaluate(() => {
      const table = document.querySelector("pages-data-table")!;
      const scrollContainer = table.shadowRoot!.querySelector(".body-scroll");
      if (scrollContainer) {
        scrollContainer.scrollTop = 800;
      }
    });
    await page.waitForTimeout(500);

    await expect(table).toHaveScreenshot("scroll-into-rowspan.png");
  });

  test("scroll past rowspan", async ({ page }) => {
    await loadScenario(page, "scroll-past");
    const table = getTable(page);
    await expect(table).toBeVisible();

    await page.evaluate(() => {
      const table = document.querySelector("pages-data-table")!;
      const scrollContainer = table.shadowRoot!.querySelector(".body-scroll");
      if (scrollContainer) {
        scrollContainer.scrollTop = 800;
      }
    });
    await page.waitForTimeout(300);

    await page.evaluate(() => {
      const table = document.querySelector("pages-data-table")!;
      const scrollContainer = table.shadowRoot!.querySelector(".body-scroll");
      if (scrollContainer) {
        scrollContainer.scrollTop = 2500;
      }
    });
    await page.waitForTimeout(500);

    await expect(table).toHaveScreenshot("scroll-past-rowspan.png");
  });

  test("fast scroll through multiple spans", async ({ page }) => {
    await loadScenario(page, "fast-scroll");
    const table = getTable(page);
    await expect(table).toBeVisible();

    await page.evaluate(() => {
      const table = document.querySelector("pages-data-table")!;
      const scrollContainer = table.shadowRoot!.querySelector(".body-scroll");
      if (scrollContainer) {
        let pos = 0;
        const step = 400;
        const target = 5000;
        const interval = setInterval(() => {
          pos += step;
          scrollContainer.scrollTop = pos;
          if (pos >= target) clearInterval(interval);
        }, 50);
      }
    });
    await page.waitForTimeout(2000);

    await expect(table).toHaveScreenshot("fast-scroll-spans.png");
  });

  test("rowspan at page boundary", async ({ page }) => {
    await loadScenario(page, "page-boundary");
    const table = getTable(page);
    await expect(table).toBeVisible();
    await expect(table).toHaveScreenshot("page-boundary-rowspan.png");
  });

  test("hover on spanned cell", async ({ page }) => {
    await loadScenario(page, "hover");
    const table = getTable(page);
    await expect(table).toBeVisible();

    const spanCell = await page.evaluate(() => {
      const table = document.querySelector("pages-data-table")!;
      const cells = table.shadowRoot!.querySelectorAll(".cell[role='gridcell']");
      for (const cell of cells) {
        const style = cell.getAttribute("style") || "";
        if (style.includes("span") && style.includes("grid-row")) {
          const rect = cell.getBoundingClientRect();
          return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
        }
      }
      return null;
    });

    if (spanCell) {
      await page.mouse.move(spanCell.x, spanCell.y);
      await page.waitForTimeout(300);
    }

    await expect(table).toHaveScreenshot("hover-spanned-cell.png");
  });

  test("no spans — regression baseline", async ({ page }) => {
    await loadScenario(page, "no-spans");
    const table = getTable(page);
    await expect(table).toBeVisible();
    await expect(table).toHaveScreenshot("no-spans-baseline.png");
  });
});
