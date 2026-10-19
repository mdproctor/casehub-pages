import { html, type TemplateResult } from 'lit';
import type { DiffNode } from '@casehubio/yaml-core/step/diff';
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

export function renderDiffContent(node: DiffNode): TemplateResult {
  const { step, state: ds, fieldChanges: fc } = node;

  switch (step.kind) {
    case 'plugin':
      if (SM_ACTIONS.has(step.entry.qualifiedName)) {
        return html`<state-machine-view .step=${step} .diffState=${ds} .fieldChanges=${fc}></state-machine-view>`;
      }
      return html`<step-card .step=${step} .diffState=${ds} .fieldChanges=${fc}></step-card>`;
    case 'invoke':
      return html`<invoke-card .step=${step} .diffState=${ds} .fieldChanges=${fc}></invoke-card>`;
    case 'parallel':
      return html`<swim-lane-view .step=${step} .diffState=${ds} .fieldChanges=${fc} .diffNode=${node}></swim-lane-view>`;
    case 'block':
      return html`<step-block-view .step=${step} .diffState=${ds} .fieldChanges=${fc} .diffNode=${node}></step-block-view>`;
    case 'if-else':
      return html`<if-else-view .step=${step} .diffState=${ds} .fieldChanges=${fc} .diffNode=${node}></if-else-view>`;
    case 'match':
      return html`<match-view .step=${step} .diffState=${ds} .fieldChanges=${fc} .diffNode=${node}></match-view>`;
    case 'try-catch-finally':
      return html`<try-catch-view .step=${step} .diffState=${ds} .fieldChanges=${fc} .diffNode=${node}></try-catch-view>`;
    case 'barrier':
    case 'quorum':
      return html`<barrier-bar .step=${step} .diffState=${ds} .fieldChanges=${fc}></barrier-bar>`;
    case 'delay':
      return html`<pages-delay-step .step=${step} .diffState=${ds} .fieldChanges=${fc}></pages-delay-step>`;
    case 'race':
      return html`<race-view .step=${step} .diffState=${ds} .fieldChanges=${fc} .diffNode=${node}></race-view>`;
    case 'select':
      return html`<select-view .step=${step} .diffState=${ds} .fieldChanges=${fc} .diffNode=${node}></select-view>`;
    default:
      return html`<error-step kind="${step.kind}" message="unsupported step type" .diffState=${ds}></error-step>`;
  }
}
