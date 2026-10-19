import { LitElement, html, css } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import type { DiffState, FieldChange } from '@casehubio/yaml-core/step/diff';
import { diffTokenStyles, diffMarkerStyles, renderDiffMarker, renderFieldChanges } from './diff-shared.js';

@customElement('error-step')
export class ErrorStep extends LitElement {
  @property() kind = '';
  @property() message = '';
  @property({ reflect: true, attribute: 'diff-state' }) diffState?: DiffState;
  @property({ attribute: false }) fieldChanges: FieldChange[] = [];

  static override styles = [diffTokenStyles, diffMarkerStyles, css`
    :host {
      display: flex;
      align-items: center;
      gap: 8px;
      background: rgba(243, 139, 168, 0.08);
      border: 1px solid rgba(243, 139, 168, 0.3);
      border-radius: 6px;
      padding: 8px 12px;
      font-size: 13px;
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
      color: #cdd6f4;
      margin-bottom: 4px;
    }

    .error-icon {
      width: 22px;
      height: 22px;
      border-radius: 4px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 11px;
      flex-shrink: 0;
      font-weight: 600;
      background: rgba(243, 139, 168, 0.15);
      color: #f38ba8;
    }

    .error-kind {
      font-weight: 600;
      color: #f38ba8;
      font-size: 12px;
    }

    .error-msg {
      color: #7f849c;
      font-size: 12px;
      font-family: 'JetBrains Mono', 'Fira Code', monospace;
    }

    .badge {
      margin-left: auto;
      font-size: 10px;
      font-weight: 600;
      padding: 1px 5px;
      border-radius: 3px;
      background: rgba(243, 139, 168, 0.12);
      color: #f38ba8;
      flex-shrink: 0;
    }
  `];

  override render() {
    return html`
      <div class="error-icon">✕</div>
      <span class="error-kind">${this.kind || 'unknown'}</span>
      ${this.message ? html`<span class="error-msg">${this.message}</span>` : ''}
      <span class="badge">ERROR</span>
      ${renderDiffMarker(this.diffState)}
      ${renderFieldChanges(this.fieldChanges)}
    `;
  }
}
