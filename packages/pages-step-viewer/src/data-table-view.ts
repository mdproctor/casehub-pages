import { LitElement, html, css, nothing, type TemplateResult } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import type { CsvDataSource, CsvColumn } from '@casehubio/yaml-core';

export interface ForEachBinding {
  as: string;
  in: string;
}

@customElement('data-table-view')
export class DataTableView extends LitElement {
  @property({ attribute: false }) data!: CsvDataSource;
  @property({ attribute: false }) forEach?: ForEachBinding;

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
      font-size: 12px;
      font-weight: 600;
      color: #7f849c;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .header-icon { color: #89b4fa; font-size: 14px; }
    .header-meta {
      margin-left: auto;
      font-size: 11px;
      color: #7f849c;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 13px;
    }
    th {
      text-align: left;
      padding: 8px 16px;
      color: #cdd6f4;
      font-weight: 600;
      font-size: 12px;
      border-bottom: 1px solid #3b3d52;
      background: rgba(255, 255, 255, 0.02);
    }
    .type-badge {
      font-size: 9px;
      font-weight: 500;
      color: #7f849c;
      background: rgba(127, 132, 156, 0.15);
      padding: 1px 5px;
      border-radius: 3px;
      margin-left: 6px;
      text-transform: lowercase;
      font-family: 'JetBrains Mono', 'Fira Code', monospace;
    }
    td {
      padding: 6px 16px;
      color: #cdd6f4;
      border-bottom: 1px solid rgba(255, 255, 255, 0.04);
    }
    tr:last-child td { border-bottom: none; }
    td.bool-true { color: #a6e3a1; }
    td.bool-false { color: #f38ba8; }
    td.number { text-align: right; font-family: 'JetBrains Mono', 'Fira Code', monospace; font-size: 12px; }

    .foreach-binding {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 16px;
      border-top: 1px solid #3b3d52;
      font-size: 12px;
      color: #7f849c;
    }
    .foreach-binding code {
      background: rgba(166, 227, 161, 0.1);
      color: #a6e3a1;
      padding: 1px 6px;
      border-radius: 3px;
      font-family: 'JetBrains Mono', 'Fira Code', monospace;
      font-size: 11px;
    }
    .foreach-accessor {
      font-family: 'JetBrains Mono', 'Fira Code', monospace;
      font-size: 12px;
      background: rgba(166, 227, 161, 0.15);
      color: #a6e3a1;
      padding: 1px 5px;
      border-radius: 3px;
    }
  `;

  override render() {
    if (!this.data) return nothing;

    const { name, columns, rows } = this.data;

    return html`
      <div class="header">
        <span class="header-icon">⊞</span>
        DATA — ${name}
        <span class="header-meta">${rows.length} rows × ${columns.length} columns</span>
      </div>
      <table>
        <thead>
          <tr>${columns.map(col => html`
            <th>${col.name} <span class="type-badge">${col.type.toLowerCase()}</span></th>
          `)}</tr>
        </thead>
        <tbody>
          ${rows.map(row => html`
            <tr>${columns.map(col => this.renderCell(row, col))}</tr>
          `)}
        </tbody>
      </table>
      ${this.renderForEach()}
    `;
  }

  private renderCell(row: Record<string, unknown>, col: CsvColumn): TemplateResult {
    const val = row[col.name];
    if (col.type === 'BOOLEAN') {
      return val
        ? html`<td class="bool-true">true</td>`
        : html`<td class="bool-false">false</td>`;
    }
    if (col.type === 'INTEGER' || col.type === 'NUMBER') {
      return html`<td class="number">${val}</td>`;
    }
    return html`<td>${val}</td>`;
  }

  private renderForEach(): TemplateResult | typeof nothing {
    if (!this.forEach) return nothing;
    return html`
      <div class="foreach-binding">
        <span>↳ used by forEach:</span>
        <code>as: ${this.forEach.as}</code>
        <code>in: ${this.forEach.in}</code>
        <span style="margin-left: 12px;">→ accessed via</span>
        <span class="foreach-accessor">\${each.${this.forEach.as}.*}</span>
      </div>
    `;
  }
}
