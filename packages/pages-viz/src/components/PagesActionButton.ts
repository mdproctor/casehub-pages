import { html, css, type TemplateResult } from "lit";
import { state } from "lit/decorators.js";
import type { ActionButtonProps, ActionRequest, ActionCallbacks, ActionResult, PagesActionRequestDetail } from "@casehubio/pages-component";
import { PagesContentElement } from "../base/PagesContentElement.js";

const STYLE_CLASSES: Record<string, string> = {
  primary: "pages-btn-primary",
  danger: "pages-btn-danger",
  secondary: "pages-btn-secondary",
  ghost: "pages-btn-ghost",
  outline: "pages-btn-outline",
};

export class PagesActionButton extends PagesContentElement<ActionButtonProps> {
  @state() private _isLoading = false;
  @state() private _resultMessage: string | null = null;
  @state() private _resultType: "success" | "error" | null = null;
  private _successTimeoutId: ReturnType<typeof setTimeout> | null = null;

  static override styles = css`
    :host { display: inline-block; }
    .pages-action-container { display: flex; flex-direction: column; gap: var(--pages-space-2, 0.5rem); }
    button { padding: var(--pages-btn-padding, 0.5rem 1rem); border: none; border-radius: var(--pages-radius-sm, 4px); font-family: var(--pages-font-family, system-ui, -apple-system, sans-serif); font-size: var(--pages-font-size-base, 14px); font-weight: 500; cursor: pointer; transition: background-color 0.2s, opacity 0.2s; }
    button:disabled { opacity: 0.6; cursor: not-allowed; }
    .pages-btn-primary { background-color: var(--pages-accent-9, #0066cc); color: var(--pages-btn-primary-color, white); }
    .pages-btn-primary:hover:not(:disabled) { background-color: var(--pages-accent-10, #0052a3); }
    .pages-btn-danger { background-color: var(--pages-danger-9, #dc3545); color: var(--pages-btn-danger-color, white); }
    .pages-btn-danger:hover:not(:disabled) { background-color: var(--pages-danger-10, #bd2130); }
    .pages-btn-secondary { background-color: var(--pages-neutral-8, #6c757d); color: var(--pages-btn-secondary-color, white); }
    .pages-btn-secondary:hover:not(:disabled) { background-color: var(--pages-neutral-9, #5a6268); }
    .pages-btn-ghost { background-color: transparent; color: var(--pages-accent-9, #0066cc); }
    .pages-btn-ghost:hover:not(:disabled) { background-color: var(--pages-neutral-3, #f0f0f0); }
    .pages-btn-outline { background-color: transparent; color: var(--pages-accent-9, #0066cc); border: 1px solid var(--pages-accent-7, #99c2e6); }
    .pages-btn-outline:hover:not(:disabled) { background-color: var(--pages-accent-3, #e6f0fa); }
    .pages-action-spinner { display: inline-block; width: 1em; height: 1em; margin-right: var(--pages-space-1, 0.25rem); border: 2px solid currentColor; border-right-color: transparent; border-radius: 50%; animation: pages-spin 0.6s linear infinite; vertical-align: middle; }
    @keyframes pages-spin { to { transform: rotate(360deg); } }
    .pages-action-success { padding: var(--pages-space-2, 0.5rem); background-color: var(--pages-success-3, #d4edda); color: var(--pages-success-11, #155724); border: 1px solid var(--pages-success-6, #c3e6cb); border-radius: var(--pages-radius-sm, 4px); font-size: var(--pages-font-size-sm, 13px); }
    .pages-action-error { padding: var(--pages-space-2, 0.5rem); background-color: var(--pages-danger-3, #f8d7da); color: var(--pages-danger-11, #721c24); border: 1px solid var(--pages-danger-6, #f5c6cb); border-radius: var(--pages-radius-sm, 4px); font-size: var(--pages-font-size-sm, 13px); }
  `;

  protected override renderContent(props: ActionButtonProps): TemplateResult {
    const btnClass = STYLE_CLASSES[props.style ?? "primary"] ?? "pages-btn-primary";
    const disabled = this._isLoading || (props.disabled ?? false);

    return html`
      <div class="pages-action-container">
        <button class=${btnClass}
                ?disabled=${disabled}
                aria-busy=${String(this._isLoading)}
                ${props.disabled ? html`` : ""}
                @click=${() => { this._handleClick(props); }}>
          ${this._isLoading ? html`<span class="pages-action-spinner" aria-hidden="true"></span>` : ""}
          ${props.label}
        </button>
        ${this._resultMessage ? html`
          <div class=${this._resultType === "success" ? "pages-action-success" : "pages-action-error"}>
            ${this._resultMessage}
          </div>
        ` : ""}
      </div>
    `;
  }

  private _handleClick(props: ActionButtonProps): void {
    if (this._isLoading || props.disabled) return;

    if (props.confirm) {
      const confirmed = window.confirm(props.confirm);
      if (!confirmed) return;
    }

    this._isLoading = true;
    this._resultMessage = null;
    this._resultType = null;

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
      resolve: (result: ActionResult) => { this._handleResult(result, props); },
    };

    this.dispatchEvent(new CustomEvent<PagesActionRequestDetail>("pages-action-request", {
      detail, bubbles: true, composed: true,
    }));
  }

  private _handleResult(result: ActionResult, props: ActionButtonProps): void {
    this._isLoading = false;

    if (result.success) {
      if (props.onSuccess?.message) {
        this._resultMessage = props.onSuccess.message;
        this._resultType = "success";
        this._successTimeoutId = setTimeout(() => {
          this._resultMessage = null;
          this._resultType = null;
          this._successTimeoutId = null;
        }, 3000);
      }
    } else {
      this._resultMessage = props.onError?.message ?? result.error ?? "An error occurred";
      this._resultType = "error";
    }
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    if (this._successTimeoutId !== null) {
      clearTimeout(this._successTimeoutId);
      this._successTimeoutId = null;
    }
  }
}

if (!customElements.get('pages-action-button')) {
  customElements.define('pages-action-button', PagesActionButton);
}

declare global {
  interface HTMLElementTagNameMap {
    'pages-action-button': PagesActionButton;
  }
}
