import { html, css, type TemplateResult } from "lit";
import { customElement } from "lit/decorators.js";
import type { TypedDataSet } from "@casehubio/pages-data";
import type { CountdownProps } from "@casehubio/pages-component";
import { parseRefreshTime } from "@casehubio/pages-data";
import { PagesElement } from "../base/PagesElement.js";
import { cellToRaw } from "../base/cell-extract.js";

interface ThresholdState {
  readonly isWarning: boolean;
  readonly isCritical: boolean;
}

/**
 * Live countdown timer component.
 *
 * Displays time remaining until a deadline from the dataset.
 * Updates every second with threshold-based color transitions.
 */
@customElement("pages-countdown")
export class PagesCountdown extends PagesElement<CountdownProps> {
  private _countdownTimer: ReturnType<typeof setInterval> | undefined;
  private _deadlineMs: number | null = null;
  private _warningThresholdMs: number | null = null;
  private _criticalThresholdMs: number | null = null;
  private _lastThresholdState: ThresholdState = { isWarning: false, isCritical: false };
  private _displayText = "—";
  private _thresholdClass = "";

  static override styles = css`
      :host {
        display: block;
        font-family: var(--pages-font-family, system-ui, sans-serif);
        color: var(--pages-neutral-12, #333);
      }

      .countdown-container {
        background: var(--pages-neutral-1, #fff);
        border: 1px solid var(--pages-neutral-6, #e0e0e0);
        border-radius: var(--pages-radius-sm, 4px);
        padding: 20px 16px;
        text-align: center;
        min-height: 80px;
        display: flex;
        flex-direction: column;
        justify-content: center;
      }

      .countdown-display {
        font-size: var(--pages-countdown-font-size, 2em);
        font-weight: var(--pages-countdown-font-weight, 600);
        color: var(--pages-countdown-color, var(--pages-neutral-12, #333));
      }

      .countdown-display.countdown-warning {
        color: var(--pages-countdown-warning-color, #ff9800);
      }

      .countdown-display.countdown-critical {
        color: var(--pages-countdown-critical-color, #f44336);
      }
    `;

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.stopCountdownTimer();
  }

  protected override renderContent(
    props: CountdownProps,
    dataset: TypedDataSet,
  ): TemplateResult {
    // Parse thresholds
    this._warningThresholdMs = props.warningThreshold
      ? parseRefreshTime(props.warningThreshold)
      : null;
    this._criticalThresholdMs = props.criticalThreshold
      ? parseRefreshTime(props.criticalThreshold)
      : null;

    // Extract deadline from dataset
    const deadlineColumn = props.deadlineColumn ?? dataset.columns[0]?.id;
    if (!deadlineColumn || dataset.rows.length === 0) {
      this._deadlineMs = null;
      this.stopCountdownTimer();
      this._displayText = "—";
      this._thresholdClass = "";
      return this.renderCountdownDisplay();
    }

    const firstRow = dataset.rows[0];
    if (!firstRow) {
      this._deadlineMs = null;
      this.stopCountdownTimer();
      this._displayText = "—";
      this._thresholdClass = "";
      return this.renderCountdownDisplay();
    }

    const deadlineRaw = cellToRaw(firstRow.cell(deadlineColumn));
    if (deadlineRaw === null || !(deadlineRaw instanceof Date)) {
      this._deadlineMs = null;
      this.stopCountdownTimer();
      this._displayText = "—";
      this._thresholdClass = "";
      return this.renderCountdownDisplay();
    }

    this._deadlineMs = deadlineRaw.getTime();

    // Compute current display
    this.updateDisplayState(props.format ?? "full");

    // Start timer if not already running
    if (this._countdownTimer === undefined) {
      this.startCountdownTimer();
    }

    return this.renderCountdownDisplay();
  }

  private renderCountdownDisplay(): TemplateResult {
    return html`
      <div class="countdown-container">
        <div class="countdown-display ${this._thresholdClass}" data-countdown-display aria-live="polite">
          ${this._displayText}
        </div>
      </div>
    `;
  }

  private updateDisplayState(format: string): void {
    if (this._deadlineMs === null) {
      this._displayText = "—";
      this._thresholdClass = "";
      return;
    }

    const now = Date.now();
    const remainingMs = this._deadlineMs - now;

    if (remainingMs <= 0) {
      this._displayText = "EXPIRED";
      this._thresholdClass = "countdown-critical";
      this.stopCountdownTimer();
      return;
    }

    // Determine threshold state
    const newState = this.getThresholdState(remainingMs);

    // Update class
    if (newState.isCritical) {
      this._thresholdClass = "countdown-critical";
    } else if (newState.isWarning) {
      this._thresholdClass = "countdown-warning";
    } else {
      this._thresholdClass = "";
    }

    // Update text content
    this._displayText = this.formatRemaining(remainingMs, format);

    // Check if threshold state changed (for screen reader announcements)
    if (this.hasThresholdChanged(newState)) {
      this._lastThresholdState = newState;
    }
  }

  private getThresholdState(remainingMs: number): ThresholdState {
    const isCritical =
      this._criticalThresholdMs !== null && remainingMs < this._criticalThresholdMs;
    const isWarning =
      !isCritical &&
      this._warningThresholdMs !== null &&
      remainingMs < this._warningThresholdMs;

    return { isWarning, isCritical };
  }

  private hasThresholdChanged(newState: ThresholdState): boolean {
    return (
      newState.isWarning !== this._lastThresholdState.isWarning ||
      newState.isCritical !== this._lastThresholdState.isCritical
    );
  }

  private formatRemaining(ms: number, format: string): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (format === "days-only") {
      return days === 1 ? "1 day" : `${days} days`;
    }

    const s = seconds % 60;
    const m = minutes % 60;
    const h = hours % 24;
    const d = days;

    if (format === "compact") {
      // Largest two units
      if (d > 0) {
        return `${d}d ${h}h`;
      }
      if (h > 0) {
        return `${h}h ${m}m`;
      }
      return `${m}m ${s}s`;
    }

    // Full format
    const parts: string[] = [];
    if (d > 0) parts.push(`${d}d`);
    if (h > 0) parts.push(`${h}h`);
    if (m > 0) parts.push(`${m}m`);
    parts.push(`${s}s`);

    return parts.join(" ");
  }

  private startCountdownTimer(): void {
    this.stopCountdownTimer();

    if (!this.isConnected || this._deadlineMs === null) return;

    this._countdownTimer = setInterval(() => {
      if (this.props) {
        this.updateDisplayState(this.props.format ?? "full");
        this.requestUpdate();
      }
    }, 1000);
  }

  private stopCountdownTimer(): void {
    if (this._countdownTimer !== undefined) {
      clearInterval(this._countdownTimer);
      this._countdownTimer = undefined;
    }
  }
}
