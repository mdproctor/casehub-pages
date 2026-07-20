import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PagesActionRequestDetail, ActionResult } from "@casehubio/pages-component";
import { PagesActionButton } from "./PagesActionButton.js";

describe("PagesActionButton", () => {
  let element: PagesActionButton;

  beforeEach(async () => {
    element = document.createElement("pages-action-button") as PagesActionButton;
    document.body.appendChild(element);
    await element.updateComplete;
  });

  afterEach(() => {
    element.remove();
  });

  describe("rendering", () => {
    it("renders button with label text", async () => {
      element.props = { label: "Submit Request", url: "/api/submit" };
      await element.updateComplete;

      const button = element.shadowRoot?.querySelector("button");
      expect(button).toBeTruthy();
      expect(button?.textContent?.trim()).toBe("Submit Request");
    });

    it("applies primary style class by default", async () => {
      element.props = { label: "Primary Action", url: "/api/action" };
      await element.updateComplete;

      const button = element.shadowRoot?.querySelector("button");
      expect(button?.classList.contains("pages-btn-primary")).toBe(true);
    });

    it("applies danger style class when specified", async () => {
      element.props = { label: "Delete", url: "/api/delete", style: "danger" };
      await element.updateComplete;

      const button = element.shadowRoot?.querySelector("button");
      expect(button?.classList.contains("pages-btn-danger")).toBe(true);
    });

    it("applies secondary style class when specified", async () => {
      element.props = { label: "Cancel", url: "/api/cancel", style: "secondary" };
      await element.updateComplete;

      const button = element.shadowRoot?.querySelector("button");
      expect(button?.classList.contains("pages-btn-secondary")).toBe(true);
    });
  });

  describe("action dispatch", () => {
    it("dispatches pages-action-request event on click", async () => {
      element.props = { label: "Submit", url: "/api/submit", method: "POST", body: { key: "value" }, headers: { "X-Custom": "header" } };
      await element.updateComplete;

      const eventPromise = new Promise<PagesActionRequestDetail>((resolve) => {
        element.addEventListener("pages-action-request", (e: Event) => {
          const detail = (e as CustomEvent<PagesActionRequestDetail>).detail;
          resolve(detail);
          detail.resolve({ success: true, status: 200 });
        });
      });

      const button = element.shadowRoot?.querySelector("button");
      button?.click();

      const detail = await eventPromise;
      expect(detail.config.url).toBe("/api/submit");
      expect(detail.config.method).toBe("POST");
      expect(detail.config.body).toEqual({ key: "value" });
      expect(detail.config.headers).toEqual({ "X-Custom": "header" });
    });

    it("includes callbacks in action request", async () => {
      element.props = { label: "Submit", url: "/api/submit", onSuccess: { refresh: ["dataset1"], message: "Success!" }, onError: { message: "Failed!" } };
      await element.updateComplete;

      const eventPromise = new Promise<PagesActionRequestDetail>((resolve) => {
        element.addEventListener("pages-action-request", (e: Event) => {
          const detail = (e as CustomEvent<PagesActionRequestDetail>).detail;
          resolve(detail);
          detail.resolve({ success: true });
        });
      });

      const button = element.shadowRoot?.querySelector("button");
      button?.click();

      const detail = await eventPromise;
      expect(detail.config.callbacks.onSuccess).toEqual({ refresh: ["dataset1"], message: "Success!" });
      expect(detail.config.callbacks.onError).toEqual({ message: "Failed!" });
    });

    it("uses POST as default method", async () => {
      element.props = { label: "Submit", url: "/api/submit" };
      await element.updateComplete;

      const eventPromise = new Promise<PagesActionRequestDetail>((resolve) => {
        element.addEventListener("pages-action-request", (e: Event) => {
          const detail = (e as CustomEvent<PagesActionRequestDetail>).detail;
          resolve(detail);
          detail.resolve({ success: true });
        });
      });

      const button = element.shadowRoot?.querySelector("button");
      button?.click();

      const detail = await eventPromise;
      expect(detail.config.method).toBe("POST");
    });
  });

  describe("confirmation dialog", () => {
    it("shows confirmation dialog when confirm prop set", async () => {
      const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);

      element.props = { label: "Delete", url: "/api/delete", confirm: "Are you sure you want to delete this item?" };
      await element.updateComplete;

      const eventPromise = new Promise<PagesActionRequestDetail>((resolve) => {
        element.addEventListener("pages-action-request", (e: Event) => {
          const detail = (e as CustomEvent<PagesActionRequestDetail>).detail;
          resolve(detail);
          detail.resolve({ success: true });
        });
      });

      const button = element.shadowRoot?.querySelector("button");
      button?.click();

      expect(confirmSpy).toHaveBeenCalledWith("Are you sure you want to delete this item?");
      await eventPromise;

      confirmSpy.mockRestore();
    });

    it("aborts action when user cancels confirmation", async () => {
      const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);

      element.props = { label: "Delete", url: "/api/delete", confirm: "Are you sure?" };
      await element.updateComplete;

      let eventFired = false;
      element.addEventListener("pages-action-request", () => { eventFired = true; });

      const button = element.shadowRoot?.querySelector("button");
      button?.click();

      expect(confirmSpy).toHaveBeenCalledWith("Are you sure?");
      expect(eventFired).toBe(false);

      confirmSpy.mockRestore();
    });
  });

  describe("loading state", () => {
    it("disables button and sets aria-busy during request", async () => {
      element.props = { label: "Submit", url: "/api/submit" };
      await element.updateComplete;

      let resolveFn: ((result: ActionResult) => void) | undefined;
      const eventPromise = new Promise<void>((resolve) => {
        element.addEventListener("pages-action-request", (e: Event) => {
          const detail = (e as CustomEvent<PagesActionRequestDetail>).detail;
          resolveFn = detail.resolve;
          resolve();
        });
      });

      const button = element.shadowRoot?.querySelector("button") as HTMLButtonElement;
      button.click();
      await eventPromise;
      await element.updateComplete;

      expect(button.disabled).toBe(true);
      expect(button.getAttribute("aria-busy")).toBe("true");

      resolveFn?.({ success: true });
      await element.updateComplete;

      const buttonAfter = element.shadowRoot?.querySelector("button") as HTMLButtonElement;
      expect(buttonAfter.disabled).toBe(false);
      expect(buttonAfter.getAttribute("aria-busy")).toBe("false");
    });
  });

  describe("success/error feedback", () => {
    it("shows success message briefly on success", async () => {
      element.props = { label: "Submit", url: "/api/submit", onSuccess: { message: "Action completed!" } };
      await element.updateComplete;

      const eventPromise = new Promise<(result: ActionResult) => void>((resolve) => {
        element.addEventListener("pages-action-request", (e: Event) => {
          const detail = (e as CustomEvent<PagesActionRequestDetail>).detail;
          resolve(detail.resolve);
        });
      });

      const button = element.shadowRoot?.querySelector("button");
      button?.click();

      const resolveFn = await eventPromise;
      resolveFn({ success: true, status: 200 });
      await element.updateComplete;

      const message = element.shadowRoot?.querySelector(".pages-action-success");
      expect(message).toBeTruthy();
      expect(message?.textContent?.trim()).toBe("Action completed!");
    });

    it("shows error message on failure", async () => {
      element.props = { label: "Submit", url: "/api/submit", onError: { message: "Action failed!" } };
      await element.updateComplete;

      const eventPromise = new Promise<(result: ActionResult) => void>((resolve) => {
        element.addEventListener("pages-action-request", (e: Event) => {
          const detail = (e as CustomEvent<PagesActionRequestDetail>).detail;
          resolve(detail.resolve);
        });
      });

      const button = element.shadowRoot?.querySelector("button");
      button?.click();

      const resolveFn = await eventPromise;
      resolveFn({ success: false, error: "Network error" });
      await element.updateComplete;

      const message = element.shadowRoot?.querySelector(".pages-action-error");
      expect(message).toBeTruthy();
      expect(message?.textContent).toContain("Action failed!");
    });

    it("uses server error when no custom error message provided", async () => {
      element.props = { label: "Submit", url: "/api/submit" };
      await element.updateComplete;

      const eventPromise = new Promise<(result: ActionResult) => void>((resolve) => {
        element.addEventListener("pages-action-request", (e: Event) => {
          const detail = (e as CustomEvent<PagesActionRequestDetail>).detail;
          resolve(detail.resolve);
        });
      });

      const button = element.shadowRoot?.querySelector("button");
      button?.click();

      const resolveFn = await eventPromise;
      resolveFn({ success: false, error: "Server returned 500" });
      await element.updateComplete;

      const message = element.shadowRoot?.querySelector(".pages-action-error");
      expect(message).toBeTruthy();
      expect(message?.textContent).toContain("Server returned 500");
    });
  });

  describe("disabled state", () => {
    it("button is enabled when not disabled", async () => {
      element.props = { label: "Submit", url: "/api/submit" };
      await element.updateComplete;
      const button = element.shadowRoot?.querySelector("button") as HTMLButtonElement;

      expect(button.disabled).toBe(false);
    });

    it("disables button when disabled prop is true", async () => {
      element.props = { label: "Submit", url: "/api/submit", disabled: true };
      await element.updateComplete;
      const button = element.shadowRoot?.querySelector("button") as HTMLButtonElement;

      expect(button.disabled).toBe(true);
    });

    it("does not dispatch action when disabled", async () => {
      element.props = { label: "Submit", url: "/api/submit", disabled: true };
      await element.updateComplete;

      let eventFired = false;
      element.addEventListener("pages-action-request", () => { eventFired = true; });

      const button = element.shadowRoot?.querySelector("button");
      button?.click();

      expect(eventFired).toBe(false);
    });
  });

  describe("ghost and outline variants", () => {
    it("applies ghost style class", async () => {
      element.props = { label: "Ghost", url: "/api/action", style: "ghost" };
      await element.updateComplete;

      const button = element.shadowRoot?.querySelector("button");
      expect(button?.classList.contains("pages-btn-ghost")).toBe(true);
    });

    it("applies outline style class", async () => {
      element.props = { label: "Outline", url: "/api/action", style: "outline" };
      await element.updateComplete;

      const button = element.shadowRoot?.querySelector("button");
      expect(button?.classList.contains("pages-btn-outline")).toBe(true);
    });
  });

  describe("loading spinner", () => {
    it("shows spinner element during loading", async () => {
      element.props = { label: "Submit", url: "/api/submit" };
      await element.updateComplete;

      let resolveFn: ((result: ActionResult) => void) | undefined;
      const eventPromise = new Promise<void>((resolve) => {
        element.addEventListener("pages-action-request", (e: Event) => {
          const detail = (e as CustomEvent<PagesActionRequestDetail>).detail;
          resolveFn = detail.resolve;
          resolve();
        });
      });

      const button = element.shadowRoot?.querySelector("button") as HTMLButtonElement;
      button.click();
      await eventPromise;
      await element.updateComplete;

      const spinner = element.shadowRoot?.querySelector(".pages-action-spinner");
      expect(spinner).toBeTruthy();

      resolveFn?.({ success: true });
      await element.updateComplete;

      const spinnerAfter = element.shadowRoot?.querySelector(".pages-action-spinner");
      expect(spinnerAfter).toBeFalsy();
    });
  });
});
