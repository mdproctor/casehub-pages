import type { ActionButtonProps, ActionRequest, ActionCallbacks, ActionResult, PagesActionRequestDetail } from "@casehubio/pages-component/dist/model/action-types.js";
import { PagesContentElement } from "../base/PagesContentElement.js";

export class PagesActionButton extends PagesContentElement<ActionButtonProps> {
  private button: HTMLButtonElement | null = null;
  private messageContainer: HTMLDivElement | null = null;
  private isLoading = false;
  private successTimeoutId: ReturnType<typeof setTimeout> | null = null;

  protected render(container: HTMLDivElement, props: ActionButtonProps): void {
    // Clear previous content
    container.innerHTML = "";

    // Add CSS
    const style = document.createElement("style");
    style.textContent = `
      :host {
        display: inline-block;
      }

      .pages-action-container {
        display: flex;
        flex-direction: column;
        gap: var(--pages-space-2, 0.5rem);
      }

      button {
        padding: var(--pages-btn-padding, 0.5rem 1rem);
        border: none;
        border-radius: var(--pages-radius-sm, 4px);
        font-family: var(--pages-font-family, system-ui, -apple-system, sans-serif);
        font-size: var(--pages-font-size-base, 14px);
        font-weight: 500;
        cursor: pointer;
        transition: background-color 0.2s, opacity 0.2s;
      }

      button:disabled {
        opacity: 0.6;
        cursor: not-allowed;
      }

      .pages-btn-primary {
        background-color: var(--pages-accent-9, #0066cc);
        color: var(--pages-btn-primary-color, white);
      }

      .pages-btn-primary:hover:not(:disabled) {
        background-color: var(--pages-accent-10, #0052a3);
      }

      .pages-btn-danger {
        background-color: var(--pages-danger-9, #dc3545);
        color: var(--pages-btn-danger-color, white);
      }

      .pages-btn-danger:hover:not(:disabled) {
        background-color: var(--pages-danger-10, #bd2130);
      }

      .pages-btn-secondary {
        background-color: var(--pages-neutral-8, #6c757d);
        color: var(--pages-btn-secondary-color, white);
      }

      .pages-btn-secondary:hover:not(:disabled) {
        background-color: var(--pages-neutral-9, #5a6268);
      }

      .pages-action-success {
        padding: var(--pages-space-2, 0.5rem);
        background-color: var(--pages-success-3, #d4edda);
        color: var(--pages-success-11, #155724);
        border: 1px solid var(--pages-success-6, #c3e6cb);
        border-radius: var(--pages-radius-sm, 4px);
        font-size: var(--pages-font-size-sm, 13px);
      }

      .pages-action-error {
        padding: var(--pages-space-2, 0.5rem);
        background-color: var(--pages-danger-3, #f8d7da);
        color: var(--pages-danger-11, #721c24);
        border: 1px solid var(--pages-danger-6, #f5c6cb);
        border-radius: var(--pages-radius-sm, 4px);
        font-size: var(--pages-font-size-sm, 13px);
      }
    `;
    container.appendChild(style);

    // Create container
    const wrapper = document.createElement("div");
    wrapper.className = "pages-action-container";

    // Create button
    this.button = document.createElement("button");
    this.button.textContent = props.label;

    // Apply style class
    const styleClass = props.style === "danger"
      ? "pages-btn-danger"
      : props.style === "secondary"
      ? "pages-btn-secondary"
      : "pages-btn-primary";
    this.button.className = styleClass;

    // Set ARIA attributes
    this.button.setAttribute("aria-busy", "false");

    // Attach click handler
    this.button.addEventListener("click", () => this.handleClick(props));

    wrapper.appendChild(this.button);

    // Create message container
    this.messageContainer = document.createElement("div");
    wrapper.appendChild(this.messageContainer);

    container.appendChild(wrapper);
  }

  private handleClick(props: ActionButtonProps): void {
    if (this.isLoading || !this.button) return;

    // Show confirmation dialog if configured
    if (props.confirm) {
      const confirmed = window.confirm(props.confirm);
      if (!confirmed) return;
    }

    // Set loading state
    this.isLoading = true;
    this.button.disabled = true;
    this.button.setAttribute("aria-busy", "true");

    // Clear previous messages
    if (this.messageContainer) {
      this.messageContainer.innerHTML = "";
    }

    // Dispatch pages-action-request event
    const actionRequest: ActionRequest = {
      url: props.url,
      method: props.method ?? "POST",
      ...(props.body !== undefined && { body: props.body }),
      ...(props.headers !== undefined && { headers: props.headers }),
    };

    const callbacks: ActionCallbacks = {
      ...(props.onSuccess !== undefined && { onSuccess: props.onSuccess }),
      ...(props.onError !== undefined && { onError: props.onError }),
    };

    const detail: PagesActionRequestDetail = {
      config: { ...actionRequest, callbacks },
      resolve: (result: ActionResult) => this.handleResult(result, props),
    };

    const event = new CustomEvent<PagesActionRequestDetail>("pages-action-request", {
      detail,
      bubbles: true,
      composed: true,
    });

    this.dispatchEvent(event);
  }

  private handleResult(result: ActionResult, props: ActionButtonProps): void {
    // Clear loading state
    this.isLoading = false;
    if (this.button) {
      this.button.disabled = false;
      this.button.setAttribute("aria-busy", "false");
    }

    if (!this.messageContainer) return;

    // Clear previous messages
    this.messageContainer.innerHTML = "";

    if (result.success) {
      // Show success message
      if (props.onSuccess?.message) {
        const successMsg = document.createElement("div");
        successMsg.className = "pages-action-success";
        successMsg.textContent = props.onSuccess.message;
        this.messageContainer.appendChild(successMsg);

        // Auto-hide after 3 seconds
        this.successTimeoutId = setTimeout(() => {
          if (this.messageContainer?.contains(successMsg)) {
            this.messageContainer.removeChild(successMsg);
          }
          this.successTimeoutId = null;
        }, 3000);
      }
    } else {
      // Show error message
      const errorMsg = document.createElement("div");
      errorMsg.className = "pages-action-error";
      errorMsg.textContent = props.onError?.message ?? result.error ?? "An error occurred";
      this.messageContainer.appendChild(errorMsg);
    }
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback?.();
    if (this.successTimeoutId !== null) {
      clearTimeout(this.successTimeoutId);
      this.successTimeoutId = null;
    }
  }
}

customElements.define("pages-action-button", PagesActionButton);
