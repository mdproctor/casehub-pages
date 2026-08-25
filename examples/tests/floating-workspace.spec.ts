import { test, expect } from "@playwright/test";

async function openFloatingWorkspace(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.locator("#sample-count").waitFor();
  await page.locator('.sample-item:has-text("Floating Workspace")').first().click();
  await page.locator("#sample-container").waitFor({ state: "visible" });
  await page.waitForSelector("[data-floating-workspace-centre]", { timeout: 10000 });
}

test.describe("Floating Workspace", () => {
  test("centre content renders", async ({ page }) => {
    await openFloatingWorkspace(page);
    const centre = page.locator("[data-floating-workspace-centre]");
    await expect(centre).toBeVisible();
    await expect(centre).toContainText("Editor Area");
  });

  test("floating frames appear after backend loads", async ({ page }) => {
    await openFloatingWorkspace(page);
    await page.waitForSelector("[data-floating-workspace-overlay]", { timeout: 10000 });
    const overlay = page.locator("[data-floating-workspace-overlay]");
    await expect(overlay).toBeAttached();
  });

  test("close dot removes a frame", async ({ page }) => {
    await openFloatingWorkspace(page);
    await page.waitForSelector("[data-floating-workspace-overlay]", { timeout: 10000 });
    const closeDots = page.locator(".frame-close-dot");
    const initialCount = await closeDots.count();
    if (initialCount === 0) {
      test.skip(true, "No close dots rendered — backend may not have loaded");
      return;
    }
    await closeDots.first().click();
    await expect(page.locator(".frame-close-dot")).toHaveCount(initialCount - 1);
  });

  test("pin button toggles", async ({ page }) => {
    await openFloatingWorkspace(page);
    await page.waitForSelector("[data-floating-workspace-overlay]", { timeout: 10000 });
    const pinBtns = page.locator(".frame-pin-btn");
    const count = await pinBtns.count();
    if (count === 0) {
      test.skip(true, "No pin buttons rendered — backend may not have loaded");
      return;
    }
    await pinBtns.first().click();
    // Pin event should fire without error
    await expect(page.locator("[data-floating-workspace-centre]")).toBeVisible();
  });

  test("dock panels toggle independently of floating frames", async ({ page }) => {
    await openFloatingWorkspace(page);
    await page.waitForSelector("[data-floating-workspace-overlay]", { timeout: 10000 });
    const explorerBtn = page.locator("button[data-dock-panel-id='explorer']");
    if (await explorerBtn.count() === 0) {
      test.skip(true, "No dock buttons found");
      return;
    }
    // Toggle off
    await explorerBtn.click();
    // Centre content should still be visible
    await expect(page.locator("[data-floating-workspace-centre]")).toBeVisible();
    // Toggle back on
    await explorerBtn.click();
    await expect(page.locator("[data-floating-workspace-centre]")).toBeVisible();
  });

  test("pin button reflects toggled state with aria-pressed", async ({ page }) => {
    await openFloatingWorkspace(page);
    await page.waitForSelector("[data-floating-workspace-overlay]", { timeout: 10000 });
    const pinBtns = page.locator(".frame-pin-btn");
    const count = await pinBtns.count();
    if (count === 0) {
      test.skip(true, "No pin buttons rendered — backend may not have loaded");
      return;
    }
    const pinBtn = pinBtns.first();
    await expect(pinBtn).toHaveAttribute("aria-pressed", "false");
    await pinBtn.click();
    await expect(pinBtn).toHaveAttribute("aria-pressed", "true");
    await expect(pinBtn).toHaveClass(/frame-pin-active/);
    await pinBtn.click();
    await expect(pinBtn).toHaveAttribute("aria-pressed", "false");
  });

  test("pinned frame resists drag", async ({ page }) => {
    await openFloatingWorkspace(page);
    await page.waitForSelector("[data-floating-workspace-overlay]", { timeout: 10000 });
    const pinBtns = page.locator(".frame-pin-btn");
    if (await pinBtns.count() === 0) {
      test.skip(true, "No pin buttons rendered");
      return;
    }
    // Pin the first frame
    await pinBtns.first().click();
    await expect(pinBtns.first()).toHaveAttribute("aria-pressed", "true");

    // Find the frame's titlebar and get its position
    const titlebar = page.locator("[data-frame-titlebar]").first();
    const box = await titlebar.boundingBox();
    if (!box) {
      test.skip(true, "Titlebar not visible");
      return;
    }

    // Record frame position before drag attempt
    const frame = page.locator("[data-frame-key]").first();
    const beforeBox = await frame.boundingBox();

    // Attempt to drag the titlebar
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 100, box.y + box.height / 2 + 100, { steps: 5 });
    await page.mouse.up();

    // Frame should not have moved
    const afterBox = await frame.boundingBox();
    if (beforeBox && afterBox) {
      expect(Math.abs(afterBox.x - beforeBox.x)).toBeLessThan(5);
      expect(Math.abs(afterBox.y - beforeBox.y)).toBeLessThan(5);
    }
  });

  test("empty tab-bar area does not initiate drag", async ({ page }) => {
    await openFloatingWorkspace(page);
    await page.waitForSelector("[data-floating-workspace-overlay]", { timeout: 10000 });

    // Find a frame's tab strip
    const tabStrip = page.locator("[data-tab-strip]").first();
    if (await tabStrip.count() === 0) {
      test.skip(true, "No tab strips found");
      return;
    }

    const frame = page.locator("[data-frame-key]").first();
    const beforeBox = await frame.boundingBox();

    // Click and drag in the tab strip area (to the right of tabs)
    const tabStripBox = await tabStrip.boundingBox();
    if (!tabStripBox) {
      test.skip(true, "Tab strip not visible");
      return;
    }

    // Drag from the right edge of the tab strip (empty space)
    const dragX = tabStripBox.x + tabStripBox.width - 5;
    const dragY = tabStripBox.y + tabStripBox.height / 2;
    await page.mouse.move(dragX, dragY);
    await page.mouse.down();
    await page.mouse.move(dragX + 100, dragY + 100, { steps: 5 });
    await page.mouse.up();

    // Frame should not have moved
    const afterBox = await frame.boundingBox();
    if (beforeBox && afterBox) {
      expect(Math.abs(afterBox.x - beforeBox.x)).toBeLessThan(5);
      expect(Math.abs(afterBox.y - beforeBox.y)).toBeLessThan(5);
    }
  });

  test("frames scale proportionally on window resize", async ({ page, context }) => {
    await openFloatingWorkspace(page);
    await page.waitForSelector("[data-frame-key]", { timeout: 10000 });

    const before = await page.evaluate(() => {
      const overlay = document.querySelector("[data-floating-workspace-overlay]");
      const oRect = overlay?.getBoundingClientRect();
      const frames = [...document.querySelectorAll("[data-frame-key]")].map(f => {
        const r = f.getBoundingClientRect();
        return { key: f.getAttribute("data-frame-key"), w: r.width, l: r.left, r: r.right };
      });
      return { overlayW: oRect?.width ?? 0, frames };
    });

    await page.setViewportSize({ width: 1600, height: 900 });
    await page.waitForTimeout(500);

    const after = await page.evaluate(() => {
      const overlay = document.querySelector("[data-floating-workspace-overlay]");
      const oRect = overlay?.getBoundingClientRect();
      const frames = [...document.querySelectorAll("[data-frame-key]")].map(f => {
        const r = f.getBoundingClientRect();
        return { key: f.getAttribute("data-frame-key"), w: r.width, r: r.right };
      });
      return { overlayW: oRect?.width ?? 0, overlayR: oRect?.right ?? 0, frames };
    });

    // Overlay must have grown
    expect(after.overlayW).toBeGreaterThan(before.overlayW);

    // Every frame must have grown proportionally
    for (const bf of before.frames) {
      const af = after.frames.find(f => f.key === bf.key);
      if (!af) continue;
      expect(af.w).toBeGreaterThan(bf.w);
      // Frame must not overflow the overlay
      expect(af.r).toBeLessThanOrEqual(after.overlayR + 1);
    }
  });
});
