import { LitElement, html } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import type { GraphModel, RuntimeState } from '@casehubio/graph-core';

export interface DiagramCanvasProps {
  model: GraphModel;
  runtime?: RuntimeState;
  onNodeSelect?: (nodeId: string) => void;
}

@customElement('casehub-diagram-canvas')
export class CasehubDiagramCanvas extends LitElement {
  @property({ type: Object }) model?: GraphModel;
  @property({ type: Object }) runtime?: RuntimeState;

  // Skip Shadow DOM — React Flow needs light DOM
  override createRenderRoot() {
    return this;
  }

  override render() {
    return html`<div class="casehub-diagram-root"><!-- React Flow mounts here --></div>`;
  }
}
