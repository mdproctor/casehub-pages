import { LitElement, html, css, nothing, type TemplateResult } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import type { BarrierStep, QuorumStep } from '@casehubio/yaml-core/step';
import type { DiffState } from '@casehubio/yaml-core/step/diff';

@customElement('barrier-bar')
export class BarrierBar extends LitElement {
  @property({ attribute: false }) step!: BarrierStep | QuorumStep;
  @property({ reflect: true, attribute: 'diff-state' }) diffState?: DiffState;

  static override styles = css`
    :host {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 8px 16px;
      background: rgba(137, 180, 250, 0.06);
      border-top: 2px solid #89b4fa;
      border-bottom: 2px solid #89b4fa;
      margin: 4px 0;
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
    }
    :host([diff-state="added"]) {
      border-color: #a6e3a1;
      background: rgba(166, 227, 161, 0.06);
    }
    :host([diff-state="modified"]) {
      border-color: #f9e2af;
      background: rgba(249, 226, 175, 0.06);
    }
    :host([diff-state="removed"]) {
      border-color: #f38ba8;
      background: rgba(243, 139, 168, 0.06);
      opacity: 0.7;
    }

    .label {
      font-size: 11px;
      font-weight: 600;
      color: #89b4fa;
      text-transform: uppercase;
      letter-spacing: 0.3px;
      white-space: nowrap;
    }
    :host([diff-state="modified"]) .label { color: #f9e2af; }
    :host([diff-state="added"]) .label { color: #a6e3a1; }

    .name {
      font-size: 11px;
      font-family: 'JetBrains Mono', 'Fira Code', monospace;
      color: #7f849c;
    }

    .line {
      flex: 1;
      height: 0;
      border-top: 1px dashed #89b4fa;
    }
    :host([diff-state="modified"]) .line { border-color: #f9e2af; }
    :host([diff-state="added"]) .line { border-color: #a6e3a1; }

    .count {
      font-size: 11px;
      font-family: 'JetBrains Mono', 'Fira Code', monospace;
      color: #7f849c;
    }

    .timeout {
      font-size: 10px;
      padding: 1px 6px;
      border-radius: 10px;
      background: rgba(249, 226, 175, 0.15);
      color: #f9e2af;
      font-family: 'JetBrains Mono', 'Fira Code', monospace;
      font-weight: 500;
    }
  `;

  override render() {
    if (!this.step) return nothing;

    const isQuorum = this.step.kind === 'quorum';
    const icon = isQuorum ? '◎' : '▮';
    const kindLabel = isQuorum ? 'quorum' : 'barrier';

    return html`
      <span class="label">${icon} ${kindLabel}</span>
      ${this.renderName()}
      <span class="line"></span>
      ${this.renderCount()}
      ${this.renderTimeout()}
    `;
  }

  private renderName(): TemplateResult | typeof nothing {
    if (!this.step.name) return nothing;
    return html`<span class="name">${this.step.name}</span>`;
  }

  private renderCount(): TemplateResult {
    if (this.step.kind === 'quorum') {
      const q = this.step as QuorumStep;
      return html`<span class="count">${q.required} of ${q.ofSteps.length}</span>`;
    }
    const b = this.step as BarrierStep;
    return html`<span class="count">count: ${b.awaitSteps.length}</span>`;
  }

  private renderTimeout(): TemplateResult | typeof nothing {
    if (!this.step.timeout) return nothing;
    return html`<span class="timeout">⏱ ${this.step.timeout}ms</span>`;
  }
}
