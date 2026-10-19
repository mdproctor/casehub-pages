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
import './barrier-bar.js';
import './race-view.js';
import './select-view.js';
import './delay-step.js';

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
    case 'barrier':
    case 'quorum':
      return html`<barrier-bar .step=${step}></barrier-bar>`;
    case 'delay':
      return html`<pages-delay-step .step=${step}></pages-delay-step>`;
    case 'race':
      return html`<race-view .step=${step}></race-view>`;
    case 'select':
      return html`<select-view .step=${step}></select-view>`;
    default:
      return html`<error-step kind="${(step as ResolvedStep).kind}" message="unsupported step type"></error-step>`;
  }
}
