import { LitElement, html, css, nothing, type TemplateResult } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import type { InvokeStep } from '@casehubio/yaml-core/step';
import './decorator-badge.js';

interface InvokeDisplay {
  badge: string;
  badgeClass: string;
  url: string;
  bodyEntries: Array<[string, unknown]>;
}

const BADGE_MAP: Record<string, { badge: string; badgeClass: string }> = {
  rest:             { badge: 'REST', badgeClass: 'rest' },
  mcp:              { badge: 'MCP',  badgeClass: 'mcp' },
  graphql:          { badge: 'GQL',  badgeClass: 'graphql' },
  'graphql-domain': { badge: 'GQL',  badgeClass: 'graphql' },
  process:          { badge: 'EXEC', badgeClass: 'process' },
  script:           { badge: 'SCRIPT', badgeClass: 'process' },
  agent:            { badge: 'AGENT', badgeClass: 'agent' },
};

@customElement('invoke-card')
export class InvokeCard extends LitElement {
  @property({ attribute: false }) step!: InvokeStep;
  @property({ reflect: true, attribute: 'body-layout' }) bodyLayout: 'block' | 'inline' | 'compact' = 'block';

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
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 10px 16px;
      background: rgba(255, 255, 255, 0.03);
      border-bottom: 1px solid #3b3d52;
    }

    .method-badge {
      font-size: 10px;
      font-weight: 700;
      padding: 2px 6px;
      border-radius: 3px;
      font-family: 'JetBrains Mono', 'Fira Code', monospace;
    }
    .method-badge.rest    { background: rgba(166, 227, 161, 0.2); color: #a6e3a1; }
    .method-badge.mcp     { background: rgba(137, 180, 250, 0.2); color: #89b4fa; }
    .method-badge.graphql { background: rgba(245, 194, 231, 0.2); color: #f5c2e7; }
    .method-badge.process { background: rgba(249, 226, 175, 0.2); color: #f9e2af; }
    .method-badge.agent   { background: rgba(203, 166, 247, 0.2); color: #cba6f7; }

    .invoke-url {
      font-family: 'JetBrains Mono', 'Fira Code', monospace;
      font-size: 12px;
      color: #cdd6f4;
    }

    .step-name {
      font-size: 11px;
      color: #7f849c;
      margin-left: auto;
    }

    .body {
      padding: 12px 16px;
      font-family: 'JetBrains Mono', 'Fira Code', monospace;
      font-size: 12px;
      line-height: 1.6;
    }
    :host([body-layout="inline"]) .body {
      display: flex;
      flex-wrap: wrap;
      gap: 0 12px;
    }
    .body-entry .key {
      color: #89b4fa;
    }
    .body-entry .value {
      color: #a6e3a1;
    }
    :host([body-layout="inline"]) .body-entry::after {
      content: ',';
      color: #7f849c;
    }
    :host([body-layout="inline"]) .body-entry:last-child::after {
      content: '';
    }

    :host([body-layout="compact"]) {
      display: flex;
      align-items: center;
      gap: 8px;
      background: rgba(255, 255, 255, 0.04);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 6px;
      padding: 8px 12px;
      font-size: 13px;
    }
    :host([body-layout="compact"]:hover) {
      background: rgba(255, 255, 255, 0.07);
    }
    :host([body-layout="compact"]) .header {
      display: contents;
      padding: 0;
      background: none;
      border: none;
    }
    :host([body-layout="compact"]) .body {
      display: contents;
      padding: 0;
    }
    :host([body-layout="compact"]) .body-entry {
      display: inline;
    }
    :host([body-layout="compact"]) .body-entry::after {
      content: ',';
      color: #7f849c;
      margin-right: 4px;
    }
    :host([body-layout="compact"]) .body-entry:last-child::after {
      content: '';
    }
    :host([body-layout="compact"]) .step-name {
      margin-left: auto;
    }

    .decorators {
      display: flex;
      gap: 4px;
      padding: 6px 16px;
      border-top: 1px solid rgba(255, 255, 255, 0.03);
      justify-content: flex-end;
    }
  `;

  override render() {
    if (!this.step) return nothing;

    const display = this.parseInvokeSpec();

    return html`
      <div class="header">
        <span class="method-badge ${display.badgeClass}">${display.badge}</span>
        <span class="invoke-url">${display.url}</span>
        ${this.step.name ? html`<span class="step-name">step: ${this.step.name}</span>` : nothing}
      </div>
      ${display.bodyEntries.length > 0 ? html`
        <div class="body">
          ${display.bodyEntries.map(([k, v]) => html`
            <div class="body-entry"><span class="key">${k}:</span> <span class="value">${this.formatValue(v)}</span></div>
          `)}
        </div>
      ` : nothing}
      ${this.renderDecorators()}
    `;
  }

  private parseInvokeSpec(): InvokeDisplay {
    const spec = this.step.invokeSpec;
    for (const [key, val] of Object.entries(spec)) {
      const mapped = BADGE_MAP[key];
      if (mapped) {
        if (typeof val === 'object' && val !== null && !Array.isArray(val)) {
          const obj = val as Record<string, unknown>;
          const url = String(obj.url ?? obj.tool ?? obj.command ?? obj.query ?? key);
          const method = obj.method as string | undefined;
          const badge = method ? method.toUpperCase() : mapped.badge;
          const body = Object.entries(obj).filter(([k]) => !['url', 'tool', 'command', 'query', 'method'].includes(k));
          return { badge, badgeClass: mapped.badgeClass, url, bodyEntries: body };
        }
        return { badge: mapped.badge, badgeClass: mapped.badgeClass, url: String(val), bodyEntries: [] };
      }
    }
    const entries = Object.entries(spec);
    return { badge: 'CALL', badgeClass: 'rest', url: entries[0]?.[0] ?? 'unknown', bodyEntries: entries.slice(1) };
  }

  private formatValue(v: unknown): string {
    if (typeof v === 'string') return `"${v}"`;
    if (typeof v === 'object' && v !== null) return JSON.stringify(v);
    return String(v);
  }

  private renderDecorators(): TemplateResult | typeof nothing {
    const decs = this.step.decorators;
    if (!decs || Object.keys(decs).length === 0) return nothing;
    const badges: TemplateResult[] = [];
    if (decs.retry != null) badges.push(html`<decorator-badge kind="retry" label="retry: ${decs.retry}"></decorator-badge>`);
    if (decs.timeout != null) badges.push(html`<decorator-badge kind="timeout" label="${decs.timeout}ms"></decorator-badge>`);
    return badges.length > 0 ? html`<div class="decorators">${badges}</div>` : nothing;
  }
}
