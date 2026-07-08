import { describe, it, expect, beforeEach } from "vitest";
import type { AlertProps } from "@casehubio/pages-component/dist/model/action-types.js";
import { PagesAlert } from "./PagesAlert.js";

describe("PagesAlert", () => {
  let element: PagesAlert;

  beforeEach(() => {
    element = document.createElement("pages-alert");
    document.body.appendChild(element);
  });

  afterEach(() => {
    element.remove();
  });

  describe("rendering", () => {
    it("renders banner with info severity", () => {
      const props: AlertProps = {
        severity: "info",
        content: "Information message",
      };

      element.props = props;

      const banner = element.shadowRoot?.querySelector(".pages-alert");
      expect(banner).toBeTruthy();
      expect(banner?.classList.contains("pages-alert-info")).toBe(true);
      expect(banner?.textContent?.trim()).toBe("Information message");
    });

    it("renders banner with warning severity", () => {
      const props: AlertProps = {
        severity: "warning",
        content: "Warning message",
      };

      element.props = props;

      const banner = element.shadowRoot?.querySelector(".pages-alert");
      expect(banner?.classList.contains("pages-alert-warning")).toBe(true);
    });

    it("renders banner with error severity", () => {
      const props: AlertProps = {
        severity: "error",
        content: "Error message",
      };

      element.props = props;

      const banner = element.shadowRoot?.querySelector(".pages-alert");
      expect(banner?.classList.contains("pages-alert-error")).toBe(true);
    });

    it("renders banner with success severity", () => {
      const props: AlertProps = {
        severity: "success",
        content: "Success message",
      };

      element.props = props;

      const banner = element.shadowRoot?.querySelector(".pages-alert");
      expect(banner?.classList.contains("pages-alert-success")).toBe(true);
    });

    it("renders content as plain text (HTML is escaped for XSS safety)", () => {
      const props: AlertProps = {
        severity: "info",
        content: "Message with <strong>HTML</strong>",
      };

      element.props = props;

      const banner = element.shadowRoot?.querySelector(".pages-alert");
      const contentEl = banner?.querySelector(".pages-alert-content");
      expect(contentEl?.textContent).toBe("Message with <strong>HTML</strong>");
      // Verify no <strong> element was created (HTML tags are text, not parsed)
      const strong = banner?.querySelector("strong");
      expect(strong).toBeNull();
    });
  });

  describe("ARIA roles", () => {
    it("sets role=alert for error severity", () => {
      const props: AlertProps = {
        severity: "error",
        content: "Error occurred",
      };

      element.props = props;

      const banner = element.shadowRoot?.querySelector(".pages-alert");
      expect(banner?.getAttribute("role")).toBe("alert");
    });

    it("sets role=alert for warning severity", () => {
      const props: AlertProps = {
        severity: "warning",
        content: "Warning message",
      };

      element.props = props;

      const banner = element.shadowRoot?.querySelector(".pages-alert");
      expect(banner?.getAttribute("role")).toBe("alert");
    });

    it("sets role=status for info severity", () => {
      const props: AlertProps = {
        severity: "info",
        content: "Info message",
      };

      element.props = props;

      const banner = element.shadowRoot?.querySelector(".pages-alert");
      expect(banner?.getAttribute("role")).toBe("status");
    });

    it("sets role=status for success severity", () => {
      const props: AlertProps = {
        severity: "success",
        content: "Success message",
      };

      element.props = props;

      const banner = element.shadowRoot?.querySelector(".pages-alert");
      expect(banner?.getAttribute("role")).toBe("status");
    });
  });

  describe("dismissible", () => {
    it("does not render dismiss button when dismissible is false", () => {
      const props: AlertProps = {
        severity: "info",
        content: "Non-dismissible alert",
        dismissible: false,
      };

      element.props = props;

      const dismissButton = element.shadowRoot?.querySelector("button");
      expect(dismissButton).toBeNull();
    });

    it("does not render dismiss button when dismissible is undefined", () => {
      const props: AlertProps = {
        severity: "info",
        content: "Non-dismissible alert",
      };

      element.props = props;

      const dismissButton = element.shadowRoot?.querySelector("button");
      expect(dismissButton).toBeNull();
    });

    it("renders dismiss button when dismissible is true", () => {
      const props: AlertProps = {
        severity: "info",
        content: "Dismissible alert",
        dismissible: true,
      };

      element.props = props;

      const dismissButton = element.shadowRoot?.querySelector("button");
      expect(dismissButton).toBeTruthy();
      expect(dismissButton?.getAttribute("aria-label")).toBe("Dismiss alert");
    });

    it("hides banner when dismiss button clicked", () => {
      const props: AlertProps = {
        severity: "info",
        content: "Dismissible alert",
        dismissible: true,
      };

      element.props = props;

      const banner = element.shadowRoot?.querySelector(".pages-alert") as HTMLElement;
      expect(banner.hidden).toBe(false);

      const dismissButton = element.shadowRoot?.querySelector("button") as HTMLButtonElement;
      dismissButton.click();

      expect(banner.hidden).toBe(true);
    });

    it("keeps banner hidden when content stays same after dismiss", () => {
      const props: AlertProps = {
        severity: "info",
        content: "Dismissible alert",
        dismissible: true,
      };

      element.props = props;

      const dismissButton = element.shadowRoot?.querySelector("button") as HTMLButtonElement;
      dismissButton.click();

      let banner = element.shadowRoot?.querySelector(".pages-alert") as HTMLElement;
      expect(banner.hidden).toBe(true);

      // Re-render with same content
      element.props = { ...props };

      banner = element.shadowRoot?.querySelector(".pages-alert") as HTMLElement;
      expect(banner.hidden).toBe(true);
    });

    it("shows banner again when content changes after dismiss", () => {
      const props: AlertProps = {
        severity: "info",
        content: "First message",
        dismissible: true,
      };

      element.props = props;

      const dismissButton = element.shadowRoot?.querySelector("button") as HTMLButtonElement;
      dismissButton.click();

      let banner = element.shadowRoot?.querySelector(".pages-alert") as HTMLElement;
      expect(banner.hidden).toBe(true);

      // Change content
      element.props = {
        severity: "info",
        content: "Second message",
        dismissible: true,
      };

      banner = element.shadowRoot?.querySelector(".pages-alert") as HTMLElement;
      expect(banner.hidden).toBe(false);
      expect(banner.textContent?.trim()).toContain("Second message");
    });
  });

  describe("CSS custom properties", () => {
    it("applies CSS custom properties for theming", () => {
      const props: AlertProps = {
        severity: "info",
        content: "Themed alert",
      };

      element.props = props;

      const style = element.shadowRoot?.querySelector("style");
      expect(style?.textContent).toContain("--pages-info-3");
      expect(style?.textContent).toContain("--pages-warning-3");
      expect(style?.textContent).toContain("--pages-danger-3");
      expect(style?.textContent).toContain("--pages-success-3");
    });
  });
});
