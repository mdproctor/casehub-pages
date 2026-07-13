import { test, expect } from "@playwright/test";

test.describe("pages-modal — browser tests", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/fixtures/pages-modal-test.html");
    await page.waitForSelector("pages-modal", { state: "attached" });
  });

  test("opens with showModal and backdrop is visible", async ({ page }) => {
    await page.click("#trigger");
    const dialog = page.locator("pages-modal#modal dialog");
    await expect(dialog).toBeVisible();
  });

  test("Escape closes the modal", async ({ page }) => {
    await page.click("#trigger");
    const dialog = page.locator("pages-modal#modal dialog");
    await expect(dialog).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible();
  });

  test("close button closes the modal", async ({ page }) => {
    await page.click("#trigger");
    const dialog = page.locator("pages-modal#modal dialog");
    await expect(dialog).toBeVisible();
    const closeBtn = page.locator("pages-modal#modal .close-btn");
    await closeBtn.click();
    await expect(dialog).not.toBeVisible();
  });

  test("OK button closes with returnValue", async ({ page }) => {
    await page.click("#trigger");
    const result = await page.evaluate(() => {
      return new Promise<string>((resolve) => {
        const modal = document.getElementById("modal")!;
        modal.addEventListener(
          "pages-modal-close",
          (e: Event) => resolve((e as CustomEvent).detail.returnValue),
          { once: true }
        );
        document.getElementById("ok-btn")!.click();
      });
    });
    expect(result).toBe("ok");
  });

  test("backdrop click closes dialog variant", async ({ page }) => {
    await page.click("#trigger");
    const dialog = page.locator("pages-modal#modal dialog");
    await expect(dialog).toBeVisible();
    // Click on the backdrop area (top-left corner of viewport, outside the centered modal)
    await page.mouse.click(5, 5);
    await expect(dialog).not.toBeVisible();
  });

  test("backdrop click does not close alertdialog variant", async ({
    page,
  }) => {
    await page.click("#trigger-alert");
    const dialog = page.locator("pages-modal#alert-modal dialog");
    await expect(dialog).toBeVisible();
    await page.mouse.click(5, 5);
    // Alert dialog should remain open
    await expect(dialog).toBeVisible();
  });

  test("alertdialog has no close button", async ({ page }) => {
    await page.click("#trigger-alert");
    const closeBtn = page.locator("pages-modal#alert-modal .close-btn");
    await expect(closeBtn).toHaveCount(0);
  });

  test("focus returns to trigger after close", async ({ page }) => {
    await page.click("#trigger");
    const dialog = page.locator("pages-modal#modal dialog");
    await expect(dialog).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible();
    await expect(page.locator("#trigger")).toBeFocused();
  });

  test("scroll lock prevents body scroll while open", async ({ page }) => {
    await page.click("#trigger");
    const overflow = await page.evaluate(
      () => document.body.style.overflow
    );
    expect(overflow).toBe("hidden");

    await page.keyboard.press("Escape");
    const dialog = page.locator("pages-modal#modal dialog");
    await expect(dialog).not.toBeVisible();
    const restored = await page.evaluate(
      () => document.body.style.overflow
    );
    expect(restored).not.toBe("hidden");
  });

  test("Tab cycles within modal (focus trap)", async ({ page }) => {
    await page.click("#trigger");
    // Tab repeatedly — focus should not leave the modal
    for (let i = 0; i < 10; i++) {
      await page.keyboard.press("Tab");
    }
    // After 10 tabs, focus should still be inside the modal
    const focused = await page.evaluate(() => {
      const active = document.activeElement;
      if (!active) return "none";
      const modal = document.getElementById("modal");
      return modal?.contains(active) || modal?.shadowRoot?.contains(active)
        ? "inside"
        : "outside";
    });
    expect(focused).toBe("inside");
  });
});
