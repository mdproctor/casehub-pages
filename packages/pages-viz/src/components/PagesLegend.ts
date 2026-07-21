import { html, css, type TemplateResult } from "lit";
import { PagesContentElement } from "../base/PagesContentElement.js";

interface LegendEntry {
  readonly label: string;
  readonly color: string;
}

export interface LegendProps {
  readonly entries: readonly LegendEntry[];
  readonly layout?: "linear" | "horizontal" | "vertical" | "grid";
  readonly swatchShape?: "square" | "circle";
}

export class PagesLegend extends PagesContentElement<LegendProps> {
  static override styles = css`
    .pages-legend { display: flex; flex-wrap: wrap; gap: var(--pages-space-3, 12px); list-style: none; margin: 0; padding: 0; font-size: var(--pages-font-size-sm, 12px); color: var(--pages-neutral-11, #404040); }
    .pages-legend.horizontal { flex-wrap: nowrap; overflow-x: auto; }
    .pages-legend.vertical { flex-direction: column; flex-wrap: nowrap; }
    .pages-legend.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); }
    .legend-entry { display: flex; align-items: center; gap: var(--pages-space-1, 4px); }
    .legend-swatch { width: 12px; height: 12px; border-radius: var(--pages-radius-sm, 4px); flex-shrink: 0; }
    .legend-swatch.circle { border-radius: 50%; }
  `;

  protected override renderContent(props: LegendProps): TemplateResult {
    const layout = props.layout ?? "linear";
    const shape = props.swatchShape ?? "square";
    const layoutClass = layout === "linear" ? "" : ` ${layout}`;

    return html`
      <ul class="pages-legend${layoutClass}">
        ${props.entries.map(entry => html`
          <li class="legend-entry">
            <span class="legend-swatch${shape === "circle" ? " circle" : ""}"
                  style="background:${entry.color}"
                  aria-hidden="true"></span>
            <span>${entry.label}</span>
          </li>
        `)}
      </ul>
    `;
  }
}

if (!customElements.get('pages-legend')) {
  customElements.define('pages-legend', PagesLegend);
}

declare global {
  interface HTMLElementTagNameMap {
    'pages-legend': PagesLegend;
  }
}
