import type { AlertProps } from "@casehubio/pages-component/dist/model/action-types.js";
import { PagesContentElement } from "../base/PagesContentElement.js";

/**
 * Alert banner component with severity-based styling and dismissible state.
 *
 * Renders a styled banner with:
 * - Severity-based CSS classes and ARIA roles
 * - Optional dismiss button
 * - Dismiss state keyed on resolved content (reappears when content changes)
 */
export class PagesAlert extends PagesContentElement<AlertProps> {
  private _dismissedContent: string | null = null;

  protected render(container: HTMLDivElement, props: AlertProps): void {
    const isDismissed = props.content === this._dismissedContent;

    container.innerHTML = "";

    // Add styles
    const style = document.createElement("style");
    style.textContent = `
      .pages-alert {
        padding: 12px 16px;
        border-radius: 4px;
        display: flex;
        align-items: flex-start;
        gap: 12px;
      }

      .pages-alert-info {
        background-color: var(--pages-info-3, #e3f2fd);
        color: var(--pages-info-11, #01579b);
      }

      .pages-alert-warning {
        background-color: var(--pages-warning-3, #fff3e0);
        color: var(--pages-warning-11, #e65100);
      }

      .pages-alert-error {
        background-color: var(--pages-danger-3, #ffebee);
        color: var(--pages-danger-11, #b71c1c);
      }

      .pages-alert-success {
        background-color: var(--pages-success-3, #e8f5e9);
        color: var(--pages-success-11, #1b5e20);
      }

      .pages-alert-content {
        flex: 1;
      }

      .pages-alert-dismiss {
        background: none;
        border: none;
        cursor: pointer;
        font-size: 18px;
        line-height: 1;
        padding: 0;
        color: inherit;
        opacity: 0.7;
      }

      .pages-alert-dismiss:hover {
        opacity: 1;
      }

      .pages-alert-dismiss:focus {
        outline: 2px solid currentColor;
        outline-offset: 2px;
      }
    `;
    container.appendChild(style);

    // Create banner
    const banner = document.createElement("div");
    banner.className = `pages-alert pages-alert-${props.severity}`;

    // Set ARIA role
    const role = props.severity === "error" || props.severity === "warning" ? "alert" : "status";
    banner.setAttribute("role", role);

    // Set hidden state based on dismiss
    banner.hidden = isDismissed;

    // Render content
    const contentEl = document.createElement("div");
    contentEl.className = "pages-alert-content";
    contentEl.textContent = props.content;
    banner.appendChild(contentEl);

    // Render dismiss button if dismissible
    if (props.dismissible) {
      const dismissButton = document.createElement("button");
      dismissButton.className = "pages-alert-dismiss";
      dismissButton.setAttribute("aria-label", "Dismiss alert");
      dismissButton.textContent = "×";
      dismissButton.addEventListener("click", () => {
        this._dismissedContent = props.content;
        banner.hidden = true;
      });
      banner.appendChild(dismissButton);
    }

    container.appendChild(banner);
  }
}

customElements.define("pages-alert", PagesAlert);
