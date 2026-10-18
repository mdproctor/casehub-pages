import { html, type TemplateResult } from 'lit';
import type { ResolvedStep } from '@casehubio/yaml-core/step';
import './step-card.js';
import './swim-lane-view.js';
import './step-block-view.js';
import './if-else-view.js';
import './match-view.js';
import './try-catch-view.js';
import './invoke-card.js';
import './error-step.js';
import './state-machine-view.js';

const SM_ACTIONS = new Set(['sm-create']);

export function renderStepContent(step: ResolvedStep): TemplateResult {
  switch (step.kind) {
    case 'plugin':
      if (SM_ACTIONS.has(step.entry.qualifiedName)) {
        return html`<state-machine-view .step=${step}></state-machine-view>`;
      }
      return html`<step-card .step=${step}></step-card>`;
    case 'invoke':
      return html`<invoke-card .step=${step}></invoke-card>`;
    case 'parallel':
      return html`<swim-lane-view .step=${step}></swim-lane-view>`;
    case 'block':
      return html`<step-block-view .step=${step}></step-block-view>`;
    case 'if-else':
      return html`<if-else-view .step=${step}></if-else-view>`;
    case 'match':
      return html`<match-view .step=${step}></match-view>`;
    case 'try-catch-finally':
      return html`<try-catch-view .step=${step}></try-catch-view>`;
    case 'delay':
      return html`<div style="display:flex;align-items:center;gap:6px;padding:4px 12px;color:#7f849c;font-size:12px;font-family:Inter,system-ui,sans-serif"><span style="color:#f9e2af">⏱</span><span style="background:rgba(249,226,175,0.15);color:#f9e2af;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:600">${step.duration}ms</span></div>`;
    default:
      return html`<error-step kind="${step.kind}" message="unsupported step type"></error-step>`;
  }
}
