import { LitElement, html, css, nothing } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import type { PluginStep } from '@casehubio/yaml-core/step';

export interface StateMachineData {
  name: string;
  states: string[];
  initial: string;
}

@customElement('state-machine-view')
export class StateMachineView extends LitElement {
  @property({ attribute: false }) step!: PluginStep;

  static override styles = css`
    :host {
      display: block;
      background: #282a3a;
      border: 1px solid #3b3d52;
      border-radius: 8px;
      overflow: hidden;
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
    }

    .header {
      padding: 10px 16px;
      border-bottom: 1px solid #3b3d52;
      font-size: 12px;
      font-weight: 600;
      color: #7f849c;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .diagram {
      display: flex;
      align-items: center;
      gap: 0;
      padding: 16px;
      overflow-x: auto;
    }

    .state-node {
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 8px 16px;
      border: 2px solid #3b3d52;
      border-radius: 20px;
      font-size: 13px;
      font-weight: 500;
      color: #cdd6f4;
      white-space: nowrap;
      background: rgba(255, 255, 255, 0.03);
    }
    .state-node.initial {
      border-color: #89b4fa;
      color: #89b4fa;
    }

    .arrow {
      display: flex;
      align-items: center;
      padding: 0 4px;
      color: #7f849c;
      font-size: 18px;
      flex-shrink: 0;
    }

    .branch-label {
      padding: 0 8px;
      opacity: 0.5;
      font-size: 12px;
      color: #7f849c;
    }
  `;

  override render() {
    if (!this.step) return nothing;

    const data = this.extractData();
    if (!data) return nothing;

    return html`
      <div class="header">STATE MACHINE — ${data.name}</div>
      <div class="diagram">
        ${this.renderStates(data)}
      </div>
    `;
  }

  private extractData(): StateMachineData | null {
    const params = this.step.params;
    const name = params.name as string;
    const states = params.states as string[];
    const initial = params.initial as string;
    if (!name || !states || !initial) return null;
    return { name, states, initial };
  }

  private renderStates(data: StateMachineData) {
    const { states, initial } = data;
    const result: unknown[] = [];

    for (let i = 0; i < states.length; i++) {
      const state = states[i]!;
      const isInitial = state === initial;

      if (i > 0) {
        result.push(html`<div class="arrow">→</div>`);
      }

      result.push(html`
        <div class="state-node ${isInitial ? 'initial' : ''}">
          ${state}
        </div>
      `);
    }

    return result;
  }
}
