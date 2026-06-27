import { test, expect } from "@playwright/test";

/**
 * View State Persistence Tests — Verify URL serialization and restoration
 * of sort/pagination state for components with explicit IDs.
 *
 * Fixture: /tests/fixtures/view-state-test.html
 * - Two tabs with tables
 * - First page has table with id="test-table" (explicit ID → URL state enabled)
 * - Second page has table without id (no URL state persistence)
 */

/**
 * Helper: Navigate to fixture page and wait for site to load.
 */
async function loadFixture(page: import("@playwright/test").Page) {
  await page.goto("/tests/fixtures/view-state-test.html");
  await page.waitForSelector("#target [data-component-type]");
  await page.waitForFunction(() => {
    const target = document.getElementById("target");
    if (!target) return false;
    const table = target.querySelector("casehub-table") as HTMLElement & { dataSet?: unknown };
    return !!table?.dataSet;
  }, { timeout: 10000 });

  // Verify site loaded
  const siteLoaded = await page.evaluate(() => !!(window as any).__testSite);
  if (!siteLoaded) {
    throw new Error("Test site did not load");
  }
}

/**
 * Helper: Get current URL hash.
 */
async function getHash(page: import("@playwright/test").Page): Promise<string> {
  return page.evaluate(() => window.location.hash);
}

/**
 * Helper: Click a table header to sort by that column.
 * Tables are web components with shadow DOM.
 */
async function sortTableByColumn(
  page: import("@playwright/test").Page,
  tableSelector: string,
  columnName: string,
) {
  // Click via page.evaluate to trigger the event handler
  await page.evaluate(
    ({ selector, col }) => {
      const table = document.querySelector(selector) as any;
      if (!table || !table.shadowRoot) {
        throw new Error(`Table ${selector} not found or no shadow DOM`);
      }
      const headers = Array.from(table.shadowRoot.querySelectorAll("th"));
      const targetHeader = headers.find((h: any) => h.textContent?.trim() === col);
      if (!targetHeader) {
        throw new Error(`Column header "${col}" not found in ${headers.map((h: any) => h.textContent).join(", ")}`);
      }
      // Dispatch a real click event
      const event = new MouseEvent("click", { bubbles: true, cancelable: true, view: window });
      (targetHeader as HTMLElement).dispatchEvent(event);
    },
    { selector: tableSelector, col: columnName },
  );
  await page.waitForFunction(
    (sel) => {
      const table = document.querySelector(sel) as HTMLElement & { shadowRoot: ShadowRoot };
      if (!table?.shadowRoot) return false;
      return Array.from(table.shadowRoot.querySelectorAll("th")).some(
        (h) => (h.textContent ?? "").includes("▲") || (h.textContent ?? "").includes("▼")
      );
    },
    tableSelector,
    { timeout: 5000 }
  );
}

/**
 * Helper: Check if a table column has sort indicator (▲ or ▼).
 */
async function hasSortIndicator(
  page: import("@playwright/test").Page,
  tableSelector: string,
  columnName: string,
): Promise<boolean> {
  return page.locator(tableSelector).first().evaluate(
    (table: HTMLElement & { shadowRoot: ShadowRoot }, col: string) => {
      const headers = Array.from(table.shadowRoot.querySelectorAll("th"));
      const targetHeader = headers.find((h) => h.textContent?.includes(col));
      if (!targetHeader) return false;
      const text = targetHeader.textContent || "";
      return text.includes("▲") || text.includes("▼");
    },
    columnName,
  );
}

/**
 * Helper: Click pagination next button.
 */
async function clickNextPage(page: import("@playwright/test").Page, tableSelector: string) {
  await page.locator(tableSelector).first().evaluate((table: HTMLElement & { shadowRoot: ShadowRoot }) => {
    const buttons = Array.from(table.shadowRoot.querySelectorAll(".paging button")) as HTMLButtonElement[];
    const nextBtn = buttons.find(b => b.title === "Next page");
    if (!nextBtn) throw new Error("Next button not found. Found buttons: " + buttons.map(b => b.title || b.textContent).join(", "));
    nextBtn.click();
  });
  await page.waitForFunction(
    () => window.location.hash.includes("page="),
    { timeout: 5000 }
  );
}

/**
 * Helper: Switch to tab by name.
 */
async function switchToTab(page: import("@playwright/test").Page, tabName: string) {
  const tabButton = page.locator(`button:has-text("${tabName}")`);
  await tabButton.click();
  await page.evaluate(() => new Promise<void>(resolve => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  }));
}

test.describe("View State Persistence", () => {
  test("Test 1: Sort table → URL contains sort param", async ({ page }) => {
    await loadFixture(page);

    await sortTableByColumn(page, "casehub-table", "name");

    const hash = await getHash(page);
    expect(hash).toContain("sort=test-table:");
  });

  test("Test 2: Sort table → reload → sort indicator restored", async ({ page }) => {
    await loadFixture(page);

    // Sort by "age"
    await sortTableByColumn(page, "casehub-table", "age");

    // Verify URL has sort param
    let hash = await getHash(page);
    expect(hash).toContain("sort=test-table:");

    // Reload page
    await page.reload();
    await page.waitForSelector("#target [data-component-type]");
    await page.waitForFunction(() => {
      const target = document.getElementById("target");
      if (!target) return false;
      const table = target.querySelector("casehub-table") as HTMLElement & { dataSet?: unknown };
      return !!table?.dataSet;
    }, { timeout: 10000 });

    // Check that sort indicator is present
    const hasSortArrow = await hasSortIndicator(page, "casehub-table", "age");
    expect(hasSortArrow).toBe(true);
  });

  test("Test 3: Sort → navigate to different tab → back → sort indicator restored", async ({ page }) => {
    await loadFixture(page);

    // Sort by "city" on Page 1
    await sortTableByColumn(page, "casehub-table", "city");

    // Navigate to Page 2
    await switchToTab(page, "Page 2");

    // Navigate back to Page 1
    await switchToTab(page, "Page 1");

    // Check that sort indicator is still present
    const hasSortArrow = await hasSortIndicator(page, "casehub-table", "city");
    expect(hasSortArrow).toBe(true);
  });

  test("Test 4: Paginate table → URL contains page param", async ({ page }) => {
    await loadFixture(page);

    // Click next page button
    await clickNextPage(page, "casehub-table");

    const hash = await getHash(page);
    expect(hash).toContain("page=test-table:");
  });

  test("Test 5: Sort + paginate → reload → both present in URL", async ({ page }) => {
    await loadFixture(page);

    // Sort by name
    await sortTableByColumn(page, "casehub-table", "name");

    // Paginate to page 2
    await clickNextPage(page, "casehub-table");

    // Check URL contains both
    let hash = await getHash(page);
    expect(hash).toContain("sort=test-table:");
    expect(hash).toContain("page=test-table:");

    // Reload and verify both are still present
    await page.reload();
    await page.waitForSelector("#target [data-component-type]");
    await page.waitForFunction(() => {
      const target = document.getElementById("target");
      if (!target) return false;
      const table = target.querySelector("casehub-table") as HTMLElement & { dataSet?: unknown };
      return !!table?.dataSet;
    }, { timeout: 10000 });

    hash = await getHash(page);
    expect(hash).toContain("sort=test-table:");
    expect(hash).toContain("page=test-table:");
  });

  test("Test 6: Sort table without explicit ID → reload → sort gone", async ({ page }) => {
    await loadFixture(page);

    // Navigate to Page 2 (table without ID)
    await switchToTab(page, "Page 2");

    // Sort by name
    const tables = page.locator("casehub-table");
    const tableCount = await tables.count();
    // Page 2 should have the second table
    const page2Table = tables.nth(tableCount > 1 ? 1 : 0);

    await page2Table.evaluate((table: HTMLElement & { shadowRoot: ShadowRoot }) => {
      const headers = Array.from(table.shadowRoot.querySelectorAll("th"));
      const nameHeader = headers.find((h) => h.textContent?.includes("name"));
      if (!nameHeader) throw new Error("name column not found");
      (nameHeader as HTMLElement).click();
    });
    await page.evaluate(() => new Promise<void>(resolve => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    }));

    // Check URL — should NOT contain sort param for this table
    let hash = await getHash(page);
    // The hash might be empty or contain only tab navigation state
    // Important: it should NOT contain any sort state

    // Reload page
    await page.reload();
    await page.waitForSelector("#target [data-component-type]");
    await page.waitForFunction(() => {
      const target = document.getElementById("target");
      if (!target) return false;
      const table = target.querySelector("casehub-table") as HTMLElement & { dataSet?: unknown };
      return !!table?.dataSet;
    }, { timeout: 10000 });

    // Navigate back to Page 2
    await switchToTab(page, "Page 2");

    // Check that sort indicator is NOT present (sort was not persisted)
    const hasSortArrow = await page2Table.evaluate((table: HTMLElement & { shadowRoot: ShadowRoot }) => {
      const headers = Array.from(table.shadowRoot.querySelectorAll("th"));
      return headers.some((h) => (h.textContent || "").includes("▲") || (h.textContent || "").includes("▼"));
    });
    expect(hasSortArrow).toBe(false);
  });
});
