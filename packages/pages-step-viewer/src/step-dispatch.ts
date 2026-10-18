import { html, type TemplateResult } from 'lit';
import type { ResolvedStep } from '@casehubio/yaml-core/step';
import './step-card.js';
import './swim-lane-view.js';
import './step-block-view.js';
import './if-else-view.js';
import './match-view.js';
import './try-catch-view.js';

export function renderStepContent(step: ResolvedStep): TemplateResult {
  switch (step.kind) {
    case 'plugin':
      return html`<step-card .step=${step}></step-card>`;
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
    default:
      return html`<div class="unsupported-step">${step.kind} (not yet rendered)</div>`;
  }
}
