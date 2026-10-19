import { html, css, nothing, type TemplateResult, type CSSResult } from 'lit';
import type { DiffState, FieldChange } from '@casehubio/yaml-core/step/diff';

const DISPLAY_NAME_OVERRIDES: Record<string, string> = {
  'awaitSteps.length': 'count',
  'ofSteps.length': 'of',
  'steps.length': 'steps',
};

function displayName(field: string): string {
  return DISPLAY_NAME_OVERRIDES[field] ?? field.split('.').pop()!;
}

export const diffTokenStyles: CSSResult = css`
  :host {
    --pages-diff-added-bg: rgba(166, 227, 161, 0.12);
    --pages-diff-added-border: rgba(166, 227, 161, 0.4);
    --pages-diff-added-text: #a6e3a1;
    --pages-diff-removed-bg: rgba(243, 139, 168, 0.12);
    --pages-diff-removed-border: rgba(243, 139, 168, 0.4);
    --pages-diff-removed-text: #f38ba8;
    --pages-diff-modified-bg: rgba(249, 226, 175, 0.15);
    --pages-diff-modified-border: rgba(249, 226, 175, 0.4);
    --pages-diff-modified-text: #f9e2af;
  }
`;

export const diffMarkerStyles: CSSResult = css`
  :host([diff-state="added"])    { background: var(--pages-diff-added-bg); border: 1px solid var(--pages-diff-added-border); }
  :host([diff-state="removed"])  { background: var(--pages-diff-removed-bg); border: 1px solid var(--pages-diff-removed-border); opacity: 0.7; text-decoration: line-through; }
  :host([diff-state="modified"]) { background: var(--pages-diff-modified-bg); border: 1px solid var(--pages-diff-modified-border); }

  .diff-marker {
    font-size: 10px; font-weight: 700; padding: 1px 6px; border-radius: 3px;
    font-family: 'Inter', system-ui, sans-serif;
  }
  .diff-marker.added    { background: var(--pages-diff-added-bg); color: var(--pages-diff-added-text); }
  .diff-marker.removed  { background: var(--pages-diff-removed-bg); color: var(--pages-diff-removed-text); }
  .diff-marker.modified { background: var(--pages-diff-modified-bg); color: var(--pages-diff-modified-text); }

  .field-changes { display: flex; flex-wrap: wrap; gap: 4px 12px; font-size: 11px; margin-top: 4px; }
  .field-change  { display: flex; align-items: center; gap: 4px; }
  .field-name    { color: #7f849c; }
  .old-value     { color: var(--pages-diff-removed-text); text-decoration: line-through; }
  .new-value     { color: var(--pages-diff-added-text); }
`;

const BADGE_TEXT: Record<string, string> = {
  added: '+ NEW',
  removed: '- REMOVED',
  modified: 'MODIFIED',
};

export function renderDiffMarker(state?: DiffState): TemplateResult | typeof nothing {
  if (!state || state === 'unchanged') return nothing;
  return html`<span class="diff-marker ${state}">${BADGE_TEXT[state]}</span>`;
}

export function renderFieldChanges(changes: FieldChange[]): TemplateResult | typeof nothing {
  if (!changes.length) return nothing;
  return html`
    <div class="field-changes">
      ${changes.map(c => html`
        <span class="field-change">
          <span class="field-name">${displayName(c.field)}</span>:
          <span class="old-value">${String(c.oldValue ?? '∅')}</span> →
          <span class="new-value">${String(c.newValue ?? '∅')}</span>
        </span>
      `)}
    </div>
  `;
}
