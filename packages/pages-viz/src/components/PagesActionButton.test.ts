import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ActionButtonProps, PagesActionRequestDetail, ActionResult } from "@casehubio/pages-component/dist/model/action-types.js";
import { PagesActionButton } from "./PagesActionButton.js";

describe("PagesActionButton", () => {
  let element: PagesActionButton;

  beforeEach(() => {
    element = document.createElement("pages-action-button");
    document.body.appendChild(element);
  });

  afterEach(() => {
    element.remove();
  });

  describe("rendering", () => {
    it("renders button with label text", () => {
      const props: ActionButtonProps = {
        label: "Submit Request",
        url: "/api/submit",
      };

      element.props = props;

      const button = element.shadowRoot?.querySelector("button");
      expect(button).toBeTruthy();
      expect(button?.textContent?.trim()).toBe("Submit Request");
    });

    it("applies primary style class by default", () => {
      const props: ActionButtonProps = {
        label: "Primary Action",
        url: "/api/action",
      };

      element.props = props;

      const button = element.shadowRoot?.querySelector("button");
      expect(button?.classList.contains("pages-btn-primary")).toBe(true);
    });

    it("applies danger style class when specified", () => {
      const props: ActionButtonProps = {
        label: "Delete",
        url: "/api/delete",
        style: "danger",
      };

      element.props = props;

      const button = element.shadowRoot?.querySelector("button");
      expect(button?.classList.contains("pages-btn-danger")).toBe(true);
    });

    it("applies secondary style class when specified", () => {
      const props: ActionButtonProps = {
        label: "Cancel",
        url: "/api/cancel",
        style: "secondary",
      };

      element.props = props;

      const button = element.shadowRoot?.querySelector("button");
      expect(button?.classList.contains("pages-btn-secondary")).toBe(true);
    });
  });

  describe("action dispatch", () => {
    it("dispatches pages-action-request event on click", async () => {
      const props: ActionButtonProps = {
        label: "Submit",
        url: "/api/submit",
        method: "POST",
        body: { key: "value" },
        headers: { "X-Custom": "header" },
      };

      element.props = props;

      const eventPromise = new Promise<PagesActionRequestDetail>((resolve) => {
        element.addEventListener("pages-action-request", (e: Event) => {
          const detail = (e as CustomEvent<PagesActionRequestDetail>).detail;
          resolve(detail);
          // Simulate successful action
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
      const props: ActionButtonProps = {
        label: "Submit",
        url: "/api/submit",
        onSuccess: { refresh: ["dataset1"], message: "Success!" },
        onError: { message: "Failed!" },
      };

      element.props = props;

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
      const props: ActionButtonProps = {
        label: "Submit",
        url: "/api/submit",
      };

      element.props = props;

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

      const props: ActionButtonProps = {
        label: "Delete",
        url: "/api/delete",
        confirm: "Are you sure you want to delete this item?",
      };

      element.props = props;

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
      await eventPromise; // Should proceed

      confirmSpy.mockRestore();
    });

    it("aborts action when user cancels confirmation", async () => {
      const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);

      const props: ActionButtonProps = {
        label: "Delete",
        url: "/api/delete",
        confirm: "Are you sure?",
      };

      element.props = props;

      let eventFired = false;
      element.addEventListener("pages-action-request", () => {
        eventFired = true;
      });

      const button = element.shadowRoot?.querySelector("button");
      button?.click();

      expect(confirmSpy).toHaveBeenCalledWith("Are you sure?");
      expect(eventFired).toBe(false); // Event should not fire

      confirmSpy.mockRestore();
    });
  });

  describe("loading state", () => {
    it("disables button and sets aria-busy during request", async () => {
      const props: ActionButtonProps = {
        label: "Submit",
        url: "/api/submit",
      };

      element.props = props;

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

      // Button should be disabled and aria-busy during request
      expect(button.disabled).toBe(true);
      expect(button.getAttribute("aria-busy")).toBe("true");

      // Resolve the action
      resolveFn?.({ success: true });

      // Wait for state update
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Button should be re-enabled
      expect(button.disabled).toBe(false);
      expect(button.getAttribute("aria-busy")).toBe("false");
    });
  });

  describe("success/error feedback", () => {
    it("shows success message briefly on success", async () => {
      const props: ActionButtonProps = {
        label: "Submit",
        url: "/api/submit",
        onSuccess: { message: "Action completed!" },
      };

      element.props = props;

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

      // Wait for DOM update
      await new Promise((resolve) => setTimeout(resolve, 10));

      const message = element.shadowRoot?.querySelector(".pages-action-success");
      expect(message).toBeTruthy();
      expect(message?.textContent).toBe("Action completed!");
    });

    it("shows error message on failure", async () => {
      const props: ActionButtonProps = {
        label: "Submit",
        url: "/api/submit",
        onError: { message: "Action failed!" },
      };

      element.props = props;

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

      // Wait for DOM update
      await new Promise((resolve) => setTimeout(resolve, 10));

      const message = element.shadowRoot?.querySelector(".pages-action-error");
      expect(message).toBeTruthy();
      expect(message?.textContent).toContain("Action failed!");
    });

    it("uses server error when no custom error message provided", async () => {
      const props: ActionButtonProps = {
        label: "Submit",
        url: "/api/submit",
      };

      element.props = props;

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

      // Wait for DOM update
      await new Promise((resolve) => setTimeout(resolve, 10));

      const message = element.shadowRoot?.querySelector(".pages-action-error");
      expect(message).toBeTruthy();
      expect(message?.textContent).toContain("Server returned 500");
    });
  });

  describe("disabled state", () => {
    it("sets aria-disabled=false when button is initially rendered", () => {
      const props: ActionButtonProps = {
        label: "Submit",
        url: "/api/submit",
      };

      element.props = props;
      const button = element.shadowRoot?.querySelector("button") as HTMLButtonElement;

      // Initially enabled (aria-disabled not set when false, only when true)
      expect(button.getAttribute("aria-disabled")).toBeNull();
      expect(button.disabled).toBe(false);
    });
  });
});
