import { describe, it, expect, beforeEach } from "vitest";
import type {} from "@casehubio/pages-component";
import { PagesAlert } from "./PagesAlert.js";

describe("PagesAlert", () => {
  let element: PagesAlert;

  beforeEach(async () => {
    element = document.createElement("pages-alert") as PagesAlert;
    document.body.appendChild(element);
    await element.updateComplete;
  });

  afterEach(() => {
    element.remove();
  });

  describe("rendering", () => {
    it("renders banner with info severity", async () => {
      element.props = { severity: "info", content: "Information message" };
      await element.updateComplete;

      const banner = element.shadowRoot?.querySelector(".pages-alert");
      expect(banner).toBeTruthy();
      expect(banner?.classList.contains("pages-alert-info")).toBe(true);
      expect(banner?.textContent?.trim()).toBe("Information message");
    });

    it("renders banner with warning severity", async () => {
      element.props = { severity: "warning", content: "Warning message" };
      await element.updateComplete;

      const banner = element.shadowRoot?.querySelector(".pages-alert");
      expect(banner?.classList.contains("pages-alert-warning")).toBe(true);
    });

    it("renders banner with error severity", async () => {
      element.props = { severity: "error", content: "Error message" };
      await element.updateComplete;

      const banner = element.shadowRoot?.querySelector(".pages-alert");
      expect(banner?.classList.contains("pages-alert-error")).toBe(true);
    });

    it("renders banner with success severity", async () => {
      element.props = { severity: "success", content: "Success message" };
      await element.updateComplete;

      const banner = element.shadowRoot?.querySelector(".pages-alert");
      expect(banner?.classList.contains("pages-alert-success")).toBe(true);
    });

    it("renders content as plain text (HTML is escaped for XSS safety)", async () => {
      element.props = { severity: "info", content: "Message with <strong>HTML</strong>" };
      await element.updateComplete;

      const banner = element.shadowRoot?.querySelector(".pages-alert");
      const contentEl = banner?.querySelector(".pages-alert-content");
      expect(contentEl?.textContent).toBe("Message with <strong>HTML</strong>");
      const strong = banner?.querySelector("strong");
      expect(strong).toBeNull();
    });
  });

  describe("ARIA roles", () => {
    it("sets role=alert for error severity", async () => {
      element.props = { severity: "error", content: "Error occurred" };
      await element.updateComplete;

      const banner = element.shadowRoot?.querySelector(".pages-alert");
      expect(banner?.getAttribute("role")).toBe("alert");
    });

    it("sets role=alert for warning severity", async () => {
      element.props = { severity: "warning", content: "Warning message" };
      await element.updateComplete;

      const banner = element.shadowRoot?.querySelector(".pages-alert");
      expect(banner?.getAttribute("role")).toBe("alert");
    });

    it("sets role=status for info severity", async () => {
      element.props = { severity: "info", content: "Info message" };
      await element.updateComplete;

      const banner = element.shadowRoot?.querySelector(".pages-alert");
      expect(banner?.getAttribute("role")).toBe("status");
    });

    it("sets role=status for success severity", async () => {
      element.props = { severity: "success", content: "Success message" };
      await element.updateComplete;

      const banner = element.shadowRoot?.querySelector(".pages-alert");
      expect(banner?.getAttribute("role")).toBe("status");
    });
  });

  describe("dismissible", () => {
    it("does not render dismiss button when dismissible is false", async () => {
      element.props = { severity: "info", content: "Non-dismissible alert", dismissible: false };
      await element.updateComplete;

      const dismissButton = element.shadowRoot?.querySelector("button");
      expect(dismissButton).toBeNull();
    });

    it("does not render dismiss button when dismissible is undefined", async () => {
      element.props = { severity: "info", content: "Non-dismissible alert" };
      await element.updateComplete;

      const dismissButton = element.shadowRoot?.querySelector("button");
      expect(dismissButton).toBeNull();
    });

    it("renders dismiss button when dismissible is true", async () => {
      element.props = { severity: "info", content: "Dismissible alert", dismissible: true };
      await element.updateComplete;

      const dismissButton = element.shadowRoot?.querySelector("button");
      expect(dismissButton).toBeTruthy();
      expect(dismissButton?.getAttribute("aria-label")).toBe("Dismiss alert");
    });

    it("hides banner when dismiss button clicked", async () => {
      element.props = { severity: "info", content: "Dismissible alert", dismissible: true };
      await element.updateComplete;

      const banner = element.shadowRoot?.querySelector(".pages-alert") as HTMLElement;
      expect(banner.hidden).toBe(false);

      const dismissButton = element.shadowRoot?.querySelector("button") as HTMLButtonElement;
      dismissButton.click();
      await element.updateComplete;

      const bannerAfter = element.shadowRoot?.querySelector(".pages-alert") as HTMLElement;
      expect(bannerAfter.hidden).toBe(true);
    });

    it("keeps banner hidden when content stays same after dismiss", async () => {
      element.props = { severity: "info", content: "Dismissible alert", dismissible: true };
      await element.updateComplete;

      const dismissButton = element.shadowRoot?.querySelector("button") as HTMLButtonElement;
      dismissButton.click();
      await element.updateComplete;

      let banner = element.shadowRoot?.querySelector(".pages-alert") as HTMLElement;
      expect(banner.hidden).toBe(true);

      element.props = { severity: "info", content: "Dismissible alert", dismissible: true };
      await element.updateComplete;

      banner = element.shadowRoot?.querySelector(".pages-alert") as HTMLElement;
      expect(banner.hidden).toBe(true);
    });

    it("shows banner again when content changes after dismiss", async () => {
      element.props = { severity: "info", content: "First message", dismissible: true };
      await element.updateComplete;

      const dismissButton = element.shadowRoot?.querySelector("button") as HTMLButtonElement;
      dismissButton.click();
      await element.updateComplete;

      let banner = element.shadowRoot?.querySelector(".pages-alert") as HTMLElement;
      expect(banner.hidden).toBe(true);

      element.props = { severity: "info", content: "Second message", dismissible: true };
      await element.updateComplete;

      banner = element.shadowRoot?.querySelector(".pages-alert") as HTMLElement;
      expect(banner.hidden).toBe(false);
      expect(banner.textContent?.trim()).toContain("Second message");
    });
  });

  describe("CSS custom properties", () => {
    it("uses static styles with CSS custom properties for theming", () => {
      const styles = (PagesAlert as unknown as { styles: { cssText: string } }).styles;
      const cssText = typeof styles === "object" && "cssText" in styles ? styles.cssText : "";
      expect(cssText).toContain("--pages-info-3");
      expect(cssText).toContain("--pages-warning-3");
      expect(cssText).toContain("--pages-danger-3");
      expect(cssText).toContain("--pages-success-3");
    });
  });
});
