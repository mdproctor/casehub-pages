import { LitElement, html, css, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { FocusTrapMixin } from '../a11y/focus-trap.js';

type ModalVariant = 'dialog' | 'alertdialog';
type ModalSize = 'sm' | 'md' | 'lg' | 'full';

@customElement('pages-modal')
export class PagesModal extends FocusTrapMixin(LitElement) {
  @property({ type: Boolean, reflect: true }) open = false;
  @property() variant: ModalVariant = 'dialog';
  @property() size: ModalSize = 'md';
  @property({ type: Boolean, attribute: 'no-close-button' }) noCloseButton = false;
  @property({ type: Boolean, attribute: 'close-on-backdrop' }) closeOnBackdrop: boolean | undefined = undefined;
  @property({ attribute: false }) override ariaLabel: string | null = null;

  @state() private _hasHeaderContent = false;
  @state() private _isAnimating = false;

  private _savedOverflow = '';
  private _savedScrollY = 0;
  private _wasOpen = false;

  private get _dialog(): HTMLDialogElement | null {
    return this.shadowRoot?.querySelector('dialog') ?? null;
  }

  private get _shouldShowCloseButton(): boolean {
    if (this.noCloseButton) return false;
    return this.variant === 'dialog';
  }

  private get _shouldCloseOnBackdrop(): boolean {
    if (this.closeOnBackdrop !== undefined) return this.closeOnBackdrop;
    return this.variant === 'dialog';
  }

  requestClose(returnValue?: string): void {
    if (!this.open || this._isAnimating) return;

    const cancelEvent = new CustomEvent('pages-modal-cancel', {
      bubbles: true,
      composed: true,
      cancelable: true,
    });
    this.dispatchEvent(cancelEvent);
    if (cancelEvent.defaultPrevented) return;

    const dialog = this._dialog;
    if (!dialog) return;

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reducedMotion) {
      dialog.close(returnValue ?? '');
      return;
    }

    this._isAnimating = true;
    dialog.classList.add('closing');

    const duration = getComputedStyle(dialog).animationDuration;
    if (!duration || duration === '0s') {
      dialog.classList.remove('closing');
      dialog.close(returnValue ?? '');
      return;
    }

    const onEnd = () => {
      dialog.removeEventListener('animationend', onEnd);
      dialog.classList.remove('closing');
      dialog.close(returnValue ?? '');
    };
    dialog.addEventListener('animationend', onEnd);
  }

  override updated(changed: Map<string, unknown>): void {
    super.updated(changed);
    if (!changed.has('open')) return;

    const dialog = this._dialog;
    if (!dialog) return;

    if (this.open && !this._wasOpen) {
      if (this._isAnimating) return;
      this._savedScrollY = window.scrollY;
      this._savedOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      dialog.showModal();
      const surface = this.shadowRoot?.querySelector('.modal-surface') as HTMLElement;
      if (surface) this.trapFocus(surface);
    } else if (!this.open && this._wasOpen) {
      dialog.classList.remove('closing');
      if (dialog.hasAttribute('open')) {
        dialog.close();
      }
    }
    this._wasOpen = this.open;
  }

  private _handleNativeClose = (): void => {
    this._isAnimating = false;
    this.releaseFocus();
    document.body.style.overflow = this._savedOverflow;
    window.scrollTo(0, this._savedScrollY);

    if (this.open) {
      this.open = false;
    }

    const dialog = this._dialog;
    this.dispatchEvent(new CustomEvent('pages-modal-close', {
      bubbles: true,
      composed: true,
      detail: { returnValue: dialog?.returnValue ?? '' },
    }));
  };

  private _handleCancel = (e: Event): void => {
    e.preventDefault();
    this.requestClose();
  };

  private _handleBackdropClick = (e: MouseEvent): void => {
    if (e.target === this._dialog && this._shouldCloseOnBackdrop) {
      this.requestClose();
    }
  };

  override firstUpdated(): void {
    this._checkHeaderContent();
  }

  private _onHeaderSlotChange = (): void => {
    this._checkHeaderContent();
  };

  private _checkHeaderContent(): void {
    const slot = this.shadowRoot?.querySelector('slot[name="header"]') as HTMLSlotElement | null;
    if (!slot) return;
    this._hasHeaderContent = slot.assignedNodes().length > 0;

    if (!this._hasHeaderContent && !this.ariaLabel) {
      console.warn(
        'pages-modal opened without an accessible name — provide header slot content or set aria-label.'
      );
    }
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    if (this._wasOpen) {
      document.body.style.overflow = this._savedOverflow;
      window.scrollTo(0, this._savedScrollY);
      this._isAnimating = false;
      this._wasOpen = false;
    }
  }

  static override styles = css`
    :host { display: contents; }

    dialog {
      border: none;
      padding: 0;
      max-width: min(600px, 90vw);
      max-height: calc(100vh - var(--pages-space-8, 2rem));
      border-radius: var(--pages-radius-lg, 8px);
      box-shadow: var(--pages-shadow-4, 0 8px 24px rgba(0,0,0,0.4));
      background: var(--pages-neutral-1, white);
      font-family: var(--pages-font-family, system-ui, sans-serif);
      color: var(--pages-neutral-12, #1a1a1a);
      overflow: visible;
    }

    dialog::backdrop {
      background: var(--pages-modal-backdrop, oklch(0% 0 0 / 0.5));
    }

    dialog[open] {
      animation: modal-enter var(--pages-duration-fast, 150ms) var(--pages-ease-out, ease-out);
    }
    dialog[open]::backdrop {
      animation: backdrop-enter var(--pages-duration-fast, 150ms) var(--pages-ease-out, ease-out);
    }

    dialog.closing {
      animation: modal-exit var(--pages-duration-fast, 150ms) var(--pages-ease-out, ease-out) forwards;
    }
    dialog.closing::backdrop {
      animation: backdrop-exit var(--pages-duration-fast, 150ms) var(--pages-ease-out, ease-out) forwards;
    }

    @keyframes modal-enter {
      from { opacity: 0; transform: translateY(8px) scale(0.97); }
      to   { opacity: 1; transform: translateY(0) scale(1); }
    }
    @keyframes backdrop-enter {
      from { opacity: 0; }
      to   { opacity: 1; }
    }
    @keyframes modal-exit {
      to { opacity: 0; transform: translateY(8px) scale(0.97); }
    }
    @keyframes backdrop-exit {
      to { opacity: 0; }
    }

    @media (prefers-reduced-motion: reduce) {
      dialog[open], dialog[open]::backdrop,
      dialog.closing, dialog.closing::backdrop {
        animation: none;
      }
    }

    dialog.size-sm { max-width: min(400px, 90vw); }
    dialog.size-md { max-width: min(600px, 90vw); }
    dialog.size-lg { max-width: min(800px, 90vw); }
    dialog.size-full {
      max-width: calc(100vw - var(--pages-space-8, 2rem));
      max-height: calc(100vh - var(--pages-space-8, 2rem));
    }

    .modal-surface {
      display: flex;
      flex-direction: column;
      max-height: inherit;
    }

    .modal-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: var(--pages-space-6, 1.5rem);
      padding-bottom: 0;
    }

    #modal-header {
      flex: 1;
      font-size: var(--pages-font-size-lg, 1.125rem);
      font-weight: var(--pages-font-weight-semibold, 600);
      line-height: var(--pages-line-height-lg, 1.5);
    }

    .close-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      width: var(--pages-space-8, 2rem);
      height: var(--pages-space-8, 2rem);
      border: none;
      background: transparent;
      color: var(--pages-neutral-9, #888);
      cursor: pointer;
      border-radius: var(--pages-radius-sm, 4px);
      font-size: 1.25rem;
      line-height: 1;
      flex-shrink: 0;
      margin-left: var(--pages-space-2, 0.5rem);
    }
    .close-btn:hover { color: var(--pages-neutral-11, #333); }
    .close-btn:focus-visible {
      outline: 2px solid var(--pages-accent-9, #007bff);
      outline-offset: 2px;
    }

    .modal-body {
      padding: var(--pages-space-6, 1.5rem);
      overflow-y: auto;
      flex: 1;
    }

    .modal-actions {
      display: flex;
      justify-content: flex-end;
      gap: var(--pages-space-3, 0.75rem);
      padding: var(--pages-space-6, 1.5rem);
      padding-top: 0;
    }

    .modal-actions:empty { display: none; }
  `;

  override render() {
    return html`
      <dialog
        class="size-${this.size}"
        role=${this.variant}
        aria-labelledby=${this._hasHeaderContent ? 'modal-header' : nothing}
        aria-label=${!this._hasHeaderContent && this.ariaLabel ? this.ariaLabel : nothing}
        aria-modal="true"
        @cancel=${this._handleCancel}
        @close=${this._handleNativeClose}
        @click=${this._handleBackdropClick}
      >
        <div class="modal-surface">
          <header class="modal-header">
            <div id="modal-header">
              <slot name="header" @slotchange=${this._onHeaderSlotChange}></slot>
            </div>
            ${this._shouldShowCloseButton ? html`
              <button class="close-btn" @click=${() => this.requestClose()} aria-label="Close">✕</button>
            ` : nothing}
          </header>
          <div class="modal-body">
            <slot></slot>
          </div>
          <footer class="modal-actions">
            <slot name="actions"></slot>
          </footer>
        </div>
      </dialog>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'pages-modal': PagesModal;
  }
}
