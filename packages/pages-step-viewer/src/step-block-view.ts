import { LitElement, html, css, nothing, type TemplateResult } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import type { BlockStep, ResolvedStep } from '@casehubio/yaml-core/step';
import { renderStepContent } from './step-dispatch.js';
import './decorator-badge.js';

@customElement('step-block-view')
export class StepBlockView extends LitElement {
  @property({ attribute: false }) step!: BlockStep;

  static override styles = css`
    :host {
      display: block;
      border: 1px solid rgba(255, 255, 255, 0.06);
      border-radius: 8px;
      overflow: hidden;
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
    }

    .block-header {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 6px 12px;
      background: rgba(255, 255, 255, 0.02);
      border-bottom: 1px solid rgba(255, 255, 255, 0.06);
      font-size: 11px;
      font-weight: 600;
      color: #7f849c;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .block-icon {
      color: #89b4fa;
      font-size: 12px;
    }
    .block-label {
      color: #cdd6f4;
      font-size: 12px;
      font-weight: 500;
      text-transform: none;
      letter-spacing: normal;
    }
    .decorators {
      display: flex;
      gap: 4px;
      margin-left: auto;
    }

    .block-body {
      padding: 8px;
    }

    step-card { margin-bottom: 4px; }
    swim-lane-view { margin: 8px 0; }
    step-block-view { margin: 8px 0; }
  `;

  override render() {
    if (!this.step) return nothing;

    const hasDecorators = Object.keys(this.step.decorators).length > 0;
    const hasName = this.step.name != null;

    return html`
      ${hasDecorators || hasName ? this.renderHeader() : nothing}
      <div class="block-body">
        ${this.step.steps.map(s => renderStepContent(s))}
      </div>
    `;
  }

  private renderHeader(): TemplateResult {
    const decs = this.step.decorators;
    const badges: TemplateResult[] = [];

    if (decs.forEach != null) {
      const fe = decs.forEach;
      const label = typeof fe === 'string' ? fe : `${(fe as Record<string, unknown>).item ?? ''} in ${(fe as Record<string, unknown>).collection ?? ''}`;
      badges.push(html`<decorator-badge kind="foreach" label="${label}"></decorator-badge>`);
    }
    if (decs.retry != null) {
      badges.push(html`<decorator-badge kind="retry" label="retry: ${decs.retry}"></decorator-badge>`);
    }
    if (decs.timeout != null) {
      badges.push(html`<decorator-badge kind="timeout" label="${decs.timeout}ms"></decorator-badge>`);
    }
    if (decs.when != null || decs.if != null) {
      badges.push(html`<decorator-badge kind="when" label="${decs.when ?? decs.if}"></decorator-badge>`);
    }
    if (decs.mutex != null) {
      badges.push(html`<decorator-badge kind="mutex" label="${decs.mutex}"></decorator-badge>`);
    }
    if (decs.loop != null) {
      badges.push(html`<decorator-badge kind="loop" label="${decs.loop}"></decorator-badge>`);
    }

    return html`
      <div class="block-header">
        <span class="block-icon">▧</span>
        BLOCK
        ${this.step.name ? html`<span class="block-label">${this.step.name}</span>` : nothing}
        ${badges.length > 0 ? html`<div class="decorators">${badges}</div>` : nothing}
      </div>
    `;
  }
}
