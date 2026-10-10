import { LitElement, html, css, nothing, type TemplateResult } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { DriftStatus } from './types.js';

@customElement('pages-drift-badge')
export class PagesDriftBadge extends LitElement {
  @property({ attribute: false }) driftStatus: DriftStatus = DriftStatus.NORMAL;
  @property({ attribute: false }) triggerSource?: string;
  @property({ attribute: false }) exemptUntil?: string;

  private _timer: ReturnType<typeof setInterval> | undefined;

  static override styles = css`
    :host {
      display: inline-block;
    }

    .drift-badge {
      display: inline-flex;
      align-items: center;
      gap: var(--pages-space-1, 4px);
      padding: var(--pages-space-0-5, 2px) var(--pages-space-2, 8px);
      border-radius: var(--pages-radius-sm, 4px);
      font-family: var(--pages-font-family, system-ui, sans-serif);
      font-size: var(--pages-font-size-xs, 12px);
      font-weight: var(--pages-font-weight-medium, 500);
      line-height: var(--pages-line-height-xs, 1.2);
      white-space: nowrap;
    }

    .drift-badge.permitted {
      background: var(--pages-warning-3, oklch(93% 0.05 55));
      color: var(--pages-warning-11, oklch(35% 0.12 55));
      border: 1px solid var(--pages-warning-6, oklch(78% 0.1 55));
    }

    .drift-badge.unexpected {
      background: var(--pages-danger-3, oklch(93% 0.05 25));
      color: var(--pages-danger-11, oklch(35% 0.12 25));
      border: 1px solid var(--pages-danger-6, oklch(78% 0.1 25));
    }

    .drift-indicator {
      display: inline-block;
      width: 6px;
      height: 6px;
      border-radius: 50%;
    }

    .permitted .drift-indicator {
      background: var(--pages-warning-9, oklch(70% 0.15 55));
    }

    .unexpected .drift-indicator {
      background: var(--pages-danger-9, oklch(55% 0.2 25));
      animation: pulse 1.5s ease-in-out infinite;
    }

    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.4; }
    }
  `;

  override connectedCallback(): void {
    super.connectedCallback();
    this._syncTimer();
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this._stopTimer();
  }

  override updated(changed: Map<PropertyKey, unknown>): void {
    if (changed.has('driftStatus') || changed.has('exemptUntil')) {
      this._syncTimer();
    }
  }

  protected override render(): TemplateResult | typeof nothing {
    if (this.driftStatus === DriftStatus.NORMAL) return nothing;

    const cssClass = this.driftStatus === DriftStatus.PERMITTED_DRIFT
      ? 'permitted'
      : 'unexpected';

    return html`
      <span class="drift-badge ${cssClass}" role="status"
            aria-label=${this._ariaLabel()}>
        <span class="drift-indicator"></span>
        ${this._badgeText()}
      </span>
    `;
  }

  private _badgeText(): string {
    if (this.driftStatus === DriftStatus.UNEXPECTED_DRIFT) {
      return 'DRIFT';
    }
    const source = this.triggerSource ?? 'TRIGGER';
    const remaining = this._computeRemaining();
    return remaining ? `${source} — ${remaining}` : source;
  }

  private _ariaLabel(): string {
    if (this.driftStatus === DriftStatus.UNEXPECTED_DRIFT) {
      return 'Unexpected drift detected';
    }
    const source = this.triggerSource ?? 'trigger';
    const remaining = this._computeRemaining();
    return remaining
      ? `Permitted drift from ${source}, ${remaining} remaining`
      : `Permitted drift from ${source}`;
  }

  private _computeRemaining(): string {
    if (!this.exemptUntil) return '';

    const deadline = new Date(this.exemptUntil).getTime();
    if (isNaN(deadline)) return '';
    const remainingMs = deadline - Date.now();

    if (remainingMs <= 0) return 'expired';

    const totalMinutes = Math.ceil(remainingMs / 60_000);
    if (totalMinutes >= 60) {
      const h = Math.floor(totalMinutes / 60);
      const m = totalMinutes % 60;
      return m > 0 ? `${h}h ${m}m` : `${h}h`;
    }
    return `${totalMinutes}m`;
  }

  private _syncTimer(): void {
    this._stopTimer();
    if (this.driftStatus === DriftStatus.PERMITTED_DRIFT && this.exemptUntil) {
      this._timer = setInterval(() => { this.requestUpdate(); }, 60_000);
    }
  }

  private _stopTimer(): void {
    if (this._timer !== undefined) {
      clearInterval(this._timer);
      this._timer = undefined;
    }
  }
}
