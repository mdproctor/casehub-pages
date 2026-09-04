import { LitElement, html, css } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { parse } from 'yaml';
import '@casehubio/pages-code-editor';
import { exportDiagram } from '@casehubio/graph-renderer';
import type { GraphModel } from '@casehubio/graph-core';
import '@casehubio/graph-renderer';

const DEFAULT_YAML = `nodes:
  - id: start
    type: default
    label: Start
  - id: process
    type: default
    label: Process Data
  - id: validate
    type: default
    label: Validate
  - id: complete
    type: default
    label: Complete
edges:
  - source: start
    target: process
  - source: process
    target: validate
  - source: validate
    target: complete
`;

function yamlToGraphModel(yamlStr: string): GraphModel {
  const parsed = parse(yamlStr) as {
    nodes?: Array<{ id: string; type?: string; label?: string }>;
    edges?: Array<{ source: string; target: string; label?: string }>;
  };
  return {
    nodes: (parsed.nodes ?? []).map(n => ({
      id: n.id,
      type: n.type ?? 'default',
      label: n.label ?? n.id,
      properties: {},
    })),
    edges: (parsed.edges ?? []).map((e, i) => ({
      id: `e-${e.source}-${e.target}-${i}`,
      source: e.source,
      target: e.target,
      label: e.label,
    })),
  };
}

@customElement('diagram-export-tool')
class DiagramExportTool extends LitElement {
  static override styles = css`
    :host {
      display: flex;
      flex-direction: column;
      height: 100vh;
    }
    .toolbar {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 16px;
      background: var(--pages-neutral-2, #f5f5f5);
      border-bottom: 1px solid var(--pages-neutral-4, #e0e0e0);
    }
    .toolbar h1 {
      font-size: 16px;
      font-weight: 600;
      flex: 1;
    }
    .toolbar button {
      padding: 6px 12px;
      border: 1px solid var(--pages-neutral-6, #d0d0d0);
      border-radius: 4px;
      background: white;
      cursor: pointer;
      font-size: 13px;
    }
    .toolbar button:hover {
      background: var(--pages-neutral-3, #eeeeee);
    }
    .error-banner {
      padding: 8px 16px;
      background: var(--pages-danger-3, #ffe5e5);
      color: var(--pages-danger-11, #cd2b31);
      font-size: 13px;
      font-family: monospace;
    }
    .content {
      display: flex;
      flex: 1;
      min-height: 0;
    }
    pages-code-editor {
      flex: 1;
      height: auto;
      border: none;
      border-radius: 0;
      border-right: 1px solid var(--pages-neutral-4, #e0e0e0);
      resize: none;
    }
    .canvas-container {
      flex: 1;
      position: relative;
    }
    pages-graph-canvas {
      width: 100%;
      height: 100%;
    }
  `;

  @state() private _yamlContent = DEFAULT_YAML;
  @state() private _model: GraphModel | null = null;
  @state() private _parseError: string | null = null;

  override connectedCallback() {
    super.connectedCallback();
    this._parseYaml(this._yamlContent);
  }

  private _parseYaml(yamlStr: string) {
    try {
      this._model = yamlToGraphModel(yamlStr);
      this._parseError = null;
    } catch (e: unknown) {
      this._parseError = e instanceof Error ? e.message : String(e);
    }
  }

  private _onInput(e: Event) {
    const editor = e.target as HTMLElement & { value: string };
    this._yamlContent = editor.value;
    this._parseYaml(this._yamlContent);
  }

  private _export(format: 'svg' | 'png') {
    const canvas = this.shadowRoot?.querySelector('pages-graph-canvas');
    if (canvas && this._model) {
      exportDiagram(canvas as HTMLElement, this._model.nodes as any[], format);
    }
  }

  override render() {
    return html`
      <div class="toolbar">
        <h1>Diagram Export Tool</h1>
        <button @click=${() => this._export('svg')}>SVG</button>
        <button @click=${() => this._export('png')}>PNG</button>
      </div>
      ${this._parseError
        ? html`<div class="error-banner">${this._parseError}</div>`
        : ''}
      <div class="content">
        <pages-code-editor
          .value=${this._yamlContent}
          language="yaml"
          label="YAML diagram source"
          @input=${this._onInput}
        ></pages-code-editor>
        <div class="canvas-container">
          <pages-graph-canvas
            .model=${this._model}
          ></pages-graph-canvas>
        </div>
      </div>
    `;
  }
}
