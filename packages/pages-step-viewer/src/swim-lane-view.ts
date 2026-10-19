import { LitElement, html, css, nothing, svg, type TemplateResult } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import type { ParallelStep, ResolvedStep } from '@casehubio/yaml-core/step';
import { renderStepContent } from './step-dispatch.js';
import type { DiffState, FieldChange } from '@casehubio/yaml-core/step/diff';
import { diffTokenStyles, renderDiffMarker, renderFieldChanges } from './diff-shared.js';

interface SignalPair {
  name: string;
  sourceLane: number;
  targetLane: number;
}

@customElement('swim-lane-view')
export class SwimLaneView extends LitElement {
  @property({ attribute: false }) step!: ParallelStep;
  @property({ reflect: true, attribute: 'diff-state' }) diffState?: DiffState;
  @property({ attribute: false }) fieldChanges: FieldChange[] = [];

  static override styles = [diffTokenStyles, css`
    :host {
      display: block;
      background: #282a3a;
      border: 1px solid #3b3d52;
      border-radius: 8px;
      overflow: hidden;
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
    }

    .header {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 10px 16px;
      background: rgba(255, 255, 255, 0.03);
      border-bottom: 1px solid #3b3d52;
      font-size: 12px;
      font-weight: 600;
      color: #7f849c;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .header-icon {
      color: #89b4fa;
      font-size: 14px;
    }
    .header-meta {
      margin-left: auto;
      font-size: 11px;
      color: #7f849c;
    }

    .diff-marker {
      font-size: 10px;
      font-weight: 600;
      padding: 1px 5px;
      border-radius: 3px;
      margin-left: auto;
      flex-shrink: 0;
    }
    .diff-marker.added    { background: var(--pages-diff-added-bg); color: var(--pages-diff-added-text); }
    .diff-marker.modified { background: var(--pages-diff-modified-bg); color: var(--pages-diff-modified-text); }

    .lanes {
      display: grid;
      gap: 0;
      padding: 0;
      position: relative;
    }

    .lane {
      padding: 16px;
      border-right: 1px solid rgba(255, 255, 255, 0.06);
      min-height: 120px;
      position: relative;
    }
    .lane:last-child {
      border-right: none;
    }
    .lane.added { background: var(--pages-diff-added-bg); }
    .lane.removed { background: var(--pages-diff-removed-bg); opacity: 0.7; }
    .lane.modified { background: var(--pages-diff-modified-bg); }

    .lane-name {
      font-size: 13px;
      font-weight: 600;
      color: #89b4fa;
      margin-bottom: 16px;
      padding-bottom: 6px;
      border-bottom: 2px solid #89b4fa;
      display: inline-block;
    }
    .lane-name.added {
      color: var(--pages-diff-added-text);
      border-bottom-color: var(--pages-diff-added-text);
    }

    step-card { margin-bottom: 4px; }
    swim-lane-view { margin: 8px 0; }
    step-block-view { margin: 8px 0; }

    .signal-row {
      display: grid;
      gap: 0;
      position: relative;
      height: 28px;
    }

    .signal-arrow-svg {
      width: 100%;
      height: 28px;
      overflow: visible;
      pointer-events: none;
    }
  `];

  override render() {
    if (!this.step) return nothing;

    const branches = this.step.branches
      ?? this.step.steps.map((s, i) => ({ name: `lane-${i + 1}`, steps: [s] }));

    const cols = branches.length;
    const pairs = this.findSignalPairs(branches);

    return html`
      <div class="header">
        <span class="header-icon">⫘</span>
        CONCURRENT
        ${this.renderHeaderDiff()}
        <span class="header-meta">${this.renderMeta(branches)}</span>
      </div>
      <div class="lanes" style="grid-template-columns: repeat(${cols}, 1fr)">
        ${branches.map(branch => this.renderBranch(branch))}
      </div>
      ${pairs.map(pair => this.renderSignalArrow(pair, cols))}
    `;
  }

  private renderHeaderDiff(): TemplateResult | typeof nothing {
    if (!this.diffState) return nothing;
    const labels: Record<DiffState, string> = {
      added: 'ADDED',
      removed: 'REMOVED',
      modified: 'MODIFIED',
    };
    return html`<span class="diff-marker ${this.diffState}">${labels[this.diffState]}</span>`;
  }

  private renderBranch(branch: { name: string; steps: ResolvedStep[] }): TemplateResult {
    return html`
      <div class="lane">
        <div class="lane-name">${branch.name}</div>
        ${branch.steps.map(step => renderStepContent(step))}
      </div>
    `;
  }

  private renderMeta(branches: Array<{ name: string; steps: ResolvedStep[] }>): string {
    const totalSteps = branches.reduce((sum, b) => sum + b.steps.length, 0);
    return `${branches.length} branches, ${totalSteps} steps`;
  }

  private findSignalPairs(branches: Array<{ name: string; steps: ResolvedStep[] }>): SignalPair[] {
    const signals = new Map<string, number>();
    const awaits = new Map<string, number>();

    branches.forEach((branch, laneIndex) => {
      for (const step of branch.steps) {
        if (!('decorators' in step)) continue;
        const decs = step.decorators as Record<string, unknown>;
        if (decs.signal != null) {
          signals.set(String(decs.signal), laneIndex);
        }
        if (decs.await != null) {
          awaits.set(String(decs.await), laneIndex);
        }
      }
    });

    const pairs: SignalPair[] = [];
    for (const [signalName, sourceLane] of signals) {
      const targetLane = awaits.get(signalName);
      if (targetLane !== undefined && targetLane !== sourceLane) {
        pairs.push({ name: signalName, sourceLane, targetLane });
      }
    }
    return pairs;
  }

  private renderSignalArrow(pair: SignalPair, cols: number): TemplateResult {
    const laneWidth = 100 / cols;
    const x1 = laneWidth * (pair.sourceLane + 0.5);
    const x2 = laneWidth * (pair.targetLane + 0.5);

    const arrowId = `arrow-${pair.name}`;

    return html`
      <div class="signal-row" style="grid-template-columns: repeat(${cols}, 1fr)">
        <svg class="signal-arrow-svg" style="position: absolute; left: 0; top: 0; width: 100%; height: 28px;">
          <defs>
            <marker id="${arrowId}" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
              <polygon points="0 0, 8 3, 0 6" fill="#cba6f7"/>
            </marker>
          </defs>
          <line x1="${x1}%" y1="14" x2="${x2}%" y2="14"
                stroke="#cba6f7" stroke-width="2" stroke-dasharray="6,3"
                marker-end="url(#${arrowId})"/>
          <rect x="${(x1 + x2) / 2 - 3}%" y="3" width="6%" height="18" rx="3"
                fill="#282a3a" stroke="rgba(203,166,247,0.3)" stroke-width="1"/>
          ${svg`<text x="${(x1 + x2) / 2}%" y="16" fill="#cba6f7"
                font-size="10" font-weight="600" font-family="Inter, sans-serif"
                text-anchor="middle">${pair.name}</text>`}
        </svg>
      </div>
    `;
  }
}
