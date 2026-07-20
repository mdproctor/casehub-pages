import { html, css, type TemplateResult } from "lit";
import { customElement, state } from "lit/decorators.js";
import type { AlertProps } from "@casehubio/pages-component";
import { PagesContentElement } from "../base/PagesContentElement.js";

@customElement("pages-alert")
export class PagesAlert extends PagesContentElement<AlertProps> {
  @state() private _dismissedContent: string | null = null;

  static override styles = css`
    .pages-alert { padding: 12px 16px; border-radius: 4px; display: flex; align-items: flex-start; gap: 12px; }
    .pages-alert-info { background-color: var(--pages-info-3, #e3f2fd); color: var(--pages-info-11, #01579b); }
    .pages-alert-warning { background-color: var(--pages-warning-3, #fff3e0); color: var(--pages-warning-11, #e65100); }
    .pages-alert-error { background-color: var(--pages-danger-3, #ffebee); color: var(--pages-danger-11, #b71c1c); }
    .pages-alert-success { background-color: var(--pages-success-3, #e8f5e9); color: var(--pages-success-11, #1b5e20); }
    .pages-alert-content { flex: 1; }
    .pages-alert-dismiss { background: none; border: none; cursor: pointer; font-size: 18px; line-height: 1; padding: 0; color: inherit; opacity: 0.7; }
    .pages-alert-dismiss:hover { opacity: 1; }
    .pages-alert-dismiss:focus { outline: 2px solid currentColor; outline-offset: 2px; }
  `;

  protected override renderContent(props: AlertProps): TemplateResult {
    const isDismissed = props.content === this._dismissedContent;
    const role = props.severity === "error" || props.severity === "warning" ? "alert" : "status";

    return html`
      <div class="pages-alert pages-alert-${props.severity}"
           role=${role}
           ?hidden=${isDismissed}>
        <div class="pages-alert-content">${props.content}</div>
        ${props.dismissible ? html`
          <button class="pages-alert-dismiss"
                  aria-label="Dismiss alert"
                  @click=${() => { this._dismissedContent = props.content; }}>×</button>
        ` : ""}
      </div>
    `;
  }
}
