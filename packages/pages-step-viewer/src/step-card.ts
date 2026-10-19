import { LitElement, html, css, nothing, type TemplateResult } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import type { PluginStep } from '@casehubio/yaml-core/step';
import { getActionIcon } from './icons.js';
import { parseExpressions } from './expression.js';
import './decorator-badge.js';
import type { DiffState } from '@casehubio/yaml-core/step/diff';

const TARGET_KEYS = new Set(['target', 'selector', 'element', 'role']);

@customElement('step-card')
export class StepCard extends LitElement {
  @property({ attribute: false }) step!: PluginStep;
  @property({ reflect: true, attribute: 'diff-state' }) diffState?: DiffState;

  static override styles = css`
    :host {
      display: flex;
      align-items: center;
      gap: 8px;
      background: rgba(255, 255, 255, 0.04);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 6px;
      padding: 8px 12px;
      font-size: 13px;
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
      color: #cdd6f4;
      transition: background 0.15s;
      cursor: default;
    }
    :host(:hover) {
      background: rgba(255, 255, 255, 0.07);
    }
    :host([diff-state="added"]) {
      background: rgba(166, 227, 161, 0.12);
      border-color: rgba(166, 227, 161, 0.4);
    }
    :host([diff-state="removed"]) {
      background: rgba(243, 139, 168, 0.12);
      border-color: rgba(243, 139, 168, 0.4);
      text-decoration: line-through;
      opacity: 0.7;
    }
    :host([diff-state="modified"]) {
      background: rgba(249, 226, 175, 0.15);
      border-color: rgba(249, 226, 175, 0.4);
    }

    .step-icon {
      width: 22px;
      height: 22px;
      border-radius: 4px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 11px;
      flex-shrink: 0;
      font-weight: 600;
    }
    .step-icon.click   { background: rgba(137, 180, 250, 0.15); color: #89b4fa; }
    .step-icon.fill    { background: rgba(137, 180, 250, 0.15); color: #89b4fa; }
    .step-icon.nav     { background: rgba(203, 166, 247, 0.15); color: #cba6f7; }
    .step-icon.assert  { background: rgba(166, 227, 161, 0.15); color: #a6e3a1; }
    .step-icon.log     { background: rgba(127, 132, 156, 0.15); color: #7f849c; }
    .step-icon.signal  { background: rgba(203, 166, 247, 0.15); color: #cba6f7; }
    .step-icon.await   { background: rgba(148, 226, 213, 0.15); color: #94e2d5; }
    .step-icon.graphql { background: rgba(245, 194, 231, 0.15); color: #f5c2e7; }
    .step-icon.delay   { background: rgba(249, 226, 175, 0.15); color: #f9e2af; }
    .step-icon.default { background: rgba(205, 214, 244, 0.1);  color: #cdd6f4; }

    .step-action {
      font-weight: 500;
      color: #cdd6f4;
    }
    .step-target {
      color: #7f849c;
      font-size: 12px;
    }
    .step-value {
      color: #f9e2af;
      font-family: 'JetBrains Mono', 'Fira Code', monospace;
      font-size: 12px;
    }

    .expr {
      display: inline;
      padding: 1px 5px;
      border-radius: 3px;
      font-family: 'JetBrains Mono', 'Fira Code', monospace;
      font-size: 11px;
      font-weight: 500;
    }
    .expr.param  { background: rgba(137, 180, 250, 0.15); color: #89b4fa; }
    .expr.each   { background: rgba(166, 227, 161, 0.15); color: #a6e3a1; }
    .expr.from   { background: rgba(250, 179, 135, 0.15); color: #fab387; }
    .expr.module { background: rgba(203, 166, 247, 0.15); color: #cba6f7; }

    .decorators {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
      margin-left: auto;
      justify-content: flex-end;
    }

    .diff-marker {
      font-size: 10px;
      font-weight: 600;
      padding: 1px 5px;
      border-radius: 3px;
      margin-left: auto;
      flex-shrink: 0;
    }
    .diff-marker.added    { background: rgba(166, 227, 161, 0.12); color: #a6e3a1; }
    .diff-marker.removed  { background: rgba(243, 139, 168, 0.12); color: #f38ba8; }
    .diff-marker.modified { background: rgba(249, 226, 175, 0.15); color: #f9e2af; }
  `;

  override render() {
    if (!this.step) return nothing;

    const actionName = this.extractActionName();
    const icon = getActionIcon(actionName);

    return html`
      <div class="step-icon ${icon.colorClass}">${icon.symbol}</div>
      <span class="step-action">${actionName}</span>
      ${this.renderParams()}
      ${this.renderDecorators()}
      ${this.renderDiffMarker()}
    `;
  }

  private extractActionName(): string {
    const qn = this.step.entry.qualifiedName;
    const dotIndex = qn.lastIndexOf('.');
    return dotIndex >= 0 ? qn.slice(dotIndex + 1) : qn;
  }

  private renderParams(): TemplateResult[] {
    const results: TemplateResult[] = [];
    for (const [key, val] of Object.entries(this.step.params)) {
      if (val == null) continue;
      const strVal = String(val);
      if (TARGET_KEYS.has(key)) {
        results.push(html`<span class="step-target">${strVal}</span>`);
      } else {
        results.push(this.renderValue(strVal));
      }
    }
    return results;
  }

  private renderValue(value: string): TemplateResult {
    const segments = parseExpressions(value);
    if (segments.length === 1 && segments[0]!.type === 'text') {
      return html`<span class="step-value">${value}</span>`;
    }
    return html`${segments.map(s =>
      s.type === 'text'
        ? html`<span class="step-value">${s.value}</span>`
        : html`<span class="expr ${s.type}">${s.value}</span>`
    )}`;
  }

  private renderDecorators(): TemplateResult | typeof nothing {
    const decs = this.step.decorators;
    if (!decs || Object.keys(decs).length === 0) return nothing;

    const badges: TemplateResult[] = [];

    if (decs.retry != null) {
      badges.push(html`<decorator-badge kind="retry" label="retry: ${decs.retry}"></decorator-badge>`);
    }
    if (decs.timeout != null) {
      badges.push(html`<decorator-badge kind="timeout" label="${decs.timeout}ms"></decorator-badge>`);
    }
    if (decs.loop != null) {
      badges.push(html`<decorator-badge kind="loop" label="${decs.loop}"></decorator-badge>`);
    }
    if (decs.when != null || decs.if != null) {
      badges.push(html`<decorator-badge kind="when" label="${decs.when ?? decs.if}"></decorator-badge>`);
    }
    if (decs.mutex != null) {
      badges.push(html`<decorator-badge kind="mutex" label="${decs.mutex}"></decorator-badge>`);
    }
    if (decs.forEach != null) {
      const fe = decs.forEach;
      const label = typeof fe === 'string'
        ? fe
        : `${(fe as Record<string, unknown>).item ?? ''} in ${(fe as Record<string, unknown>).collection ?? ''}`;
      badges.push(html`<decorator-badge kind="foreach" label="${label}"></decorator-badge>`);
    }
    if (decs.publish != null) {
      badges.push(html`<decorator-badge kind="publish" label="→ ${decs.publish}"></decorator-badge>`);
    }
    if (decs.from != null) {
      badges.push(html`<decorator-badge kind="from" label="← ${decs.from}"></decorator-badge>`);
    }
    if (decs.cancel != null) {
      badges.push(html`<decorator-badge kind="cancel" label="cancel: ${decs.cancel}"></decorator-badge>`);
    }

    return badges.length > 0
      ? html`<div class="decorators">${badges}</div>`
      : nothing;
  }

  private renderDiffMarker(): TemplateResult | typeof nothing {
    if (!this.diffState) return nothing;
    const labels: Record<DiffState, string> = {
      added: '+ NEW',
      removed: '- REMOVED',
      modified: 'MODIFIED',
      unchanged: '',
    };
    return html`<span class="diff-marker ${this.diffState}">${labels[this.diffState]}</span>`;
  }
}
