import type { TypedDataSet } from "@casehubio/pages-data/dist/dataset/types.js";
import type { CountdownProps } from "@casehubio/pages-component/dist/model/displayer-types.js";
import { parseRefreshTime } from "@casehubio/pages-data/dist/dataset/external/types.js";
import { PagesElement } from "../base/PagesElement.js";
import { cellToRaw } from "../base/cell-extract.js";

const COUNTDOWN_CSS = `
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
export class PagesCountdown extends PagesElement<CountdownProps> {
  private _countdownTimer: ReturnType<typeof setInterval> | undefined;
  private _deadlineMs: number | null = null;
  private _warningThresholdMs: number | null = null;
  private _criticalThresholdMs: number | null = null;
  private _lastThresholdState: ThresholdState = { isWarning: false, isCritical: false };

  protected override render(
    container: HTMLDivElement,
    props: CountdownProps,
    dataset: TypedDataSet,
  ): void {
    container.textContent = "";

    // Add styles
    const style = document.createElement("style");
    style.textContent = COUNTDOWN_CSS;
    container.appendChild(style);

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
      this.renderPlaceholder(container);
      return;
    }

    const firstRow = dataset.rows[0];
    if (!firstRow) {
      this.renderPlaceholder(container);
      return;
    }

    const deadlineRaw = cellToRaw(firstRow.cell(deadlineColumn));
    if (deadlineRaw === null || !(deadlineRaw instanceof Date)) {
      this.renderPlaceholder(container);
      return;
    }

    this._deadlineMs = deadlineRaw.getTime();

    // Create countdown display
    this.renderCountdownDisplay(container, props.format ?? "full");

    // Start timer
    this.startCountdownTimer();
  }

  private renderPlaceholder(container: HTMLDivElement): void {
    const wrapper = document.createElement("div");
    wrapper.className = "countdown-container";

    const display = document.createElement("div");
    display.className = "countdown-display";
    display.setAttribute("data-countdown-display", "");
    display.setAttribute("aria-live", "polite");
    display.textContent = "—";

    wrapper.appendChild(display);
    container.appendChild(wrapper);
  }

  private renderCountdownDisplay(container: HTMLDivElement, format: string): void {
    const wrapper = document.createElement("div");
    wrapper.className = "countdown-container";

    const display = document.createElement("div");
    display.className = "countdown-display";
    display.setAttribute("data-countdown-display", "");
    display.setAttribute("aria-live", "polite");

    // Initial render
    this.updateDisplay(display, format);

    wrapper.appendChild(display);
    container.appendChild(wrapper);
  }

  private updateDisplay(display: HTMLElement, format: string): void {
    if (this._deadlineMs === null) {
      display.textContent = "—";
      return;
    }

    const now = Date.now();
    const remainingMs = this._deadlineMs - now;

    if (remainingMs <= 0) {
      display.textContent = "EXPIRED";
      display.className = "countdown-display countdown-critical";
      this.stopCountdownTimer();
      return;
    }

    // Determine threshold state
    const newState = this.getThresholdState(remainingMs);

    // Update classes
    display.className = "countdown-display";
    if (newState.isCritical) {
      display.className += " countdown-critical";
    } else if (newState.isWarning) {
      display.className += " countdown-warning";
    }

    // Update text content
    display.textContent = this.formatRemaining(remainingMs, format);

    // Check if threshold state changed (for screen reader announcements)
    if (this.hasThresholdChanged(newState)) {
      // Trigger screen reader announcement by updating aria-live region
      // This happens automatically when textContent changes
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
      const display = this.container.querySelector<HTMLElement>("[data-countdown-display]");
      if (display && this.props) {
        this.updateDisplay(display, this.props.format ?? "full");
      }
    }, 1000);
  }

  private stopCountdownTimer(): void {
    if (this._countdownTimer !== undefined) {
      clearInterval(this._countdownTimer);
      this._countdownTimer = undefined;
    }
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.stopCountdownTimer();
  }
}

customElements.define("pages-countdown", PagesCountdown);
