import { LitElement, html, css, nothing, type TemplateResult } from 'lit';
import { property, state } from 'lit/decorators.js';
import type { AriaTarget } from '@casehubio/pages-primitives';
import { probeReadiness, type ReadinessStatus } from './readiness-probe.js';

export interface ScriptDescriptor {
  name: string;
  description?: string;
  labels: string[];
  tags: string[];
  params: { name: string; type: string; required: boolean }[];
  calls: string[];
  provenance: string;
  firstStepTargets: AriaTarget[];
}

export class PagesLibraryView extends LitElement {
  static override styles = css`
    :host {
      display: block;
      font-family: var(--pages-font-family, system-ui, sans-serif);
      color: var(--pages-neutral-12, #1a1a1a);
    }
    .search {
      padding: var(--pages-space-2, 8px);
      border-bottom: 1px solid var(--pages-neutral-4, #e5e5e5);
    }
    .search input {
      width: 100%; box-sizing: border-box;
      padding: var(--pages-space-1, 4px) var(--pages-space-2, 8px);
      border: 1px solid var(--pages-neutral-5, #ddd);
      border-radius: var(--pages-radius-sm, 4px);
      font-size: var(--pages-font-size-sm, 12px);
      background: var(--pages-neutral-1, #fff);
      color: var(--pages-neutral-12, #1a1a1a);
    }
    .search input::placeholder { color: var(--pages-neutral-8, #999); }
    .filters {
      display: flex; flex-wrap: wrap; gap: 4px;
      padding: 4px var(--pages-space-2, 8px);
    }
    .filter-chip {
      font-size: 10px; padding: 2px 6px;
      border-radius: var(--pages-radius-sm, 4px);
      background: var(--pages-accent-3, #e8eaf6);
      color: var(--pages-accent-11, #1e3a5f);
      cursor: pointer;
    }
    .filter-chip.active { background: var(--pages-accent-9, #2563eb); color: white; }
    .script-list { padding: var(--pages-space-2, 8px) 0; }
    .script-item {
      padding: var(--pages-space-2, 8px);
      border-bottom: 1px solid var(--pages-neutral-4, #e5e5e5);
      display: flex; align-items: flex-start; gap: var(--pages-space-2, 8px);
    }
    .script-item:hover { background: var(--pages-neutral-3, #f5f5f5); }
    .readiness {
      font-size: 10px; font-weight: 600;
      padding: 2px 6px; border-radius: var(--pages-radius-sm, 4px);
      flex-shrink: 0; min-width: 52px; text-align: center;
    }
    .readiness-ready { background: var(--pages-success-3, #dcfce7); color: var(--pages-success-11, #166534); }
    .readiness-not-ready { background: var(--pages-danger-3, #fee2e2); color: var(--pages-danger-11, #991b1b); }
    .readiness-unknown { background: var(--pages-warning-3, #fef3c7); color: var(--pages-warning-11, #92400e); }
    .script-info { flex: 1; min-width: 0; }
    .script-name {
      font-weight: var(--pages-font-weight-medium, 500);
      font-size: var(--pages-font-size-base, 14px);
      color: var(--pages-neutral-12, #1a1a1a);
    }
    .script-desc {
      font-size: var(--pages-font-size-sm, 12px);
      color: var(--pages-neutral-9, #777);
      margin-top: 2px;
    }
    .script-meta {
      display: flex; flex-wrap: wrap; gap: 4px; margin-top: 4px;
    }
    .label-chip {
      font-size: 10px; padding: 1px 4px;
      border-radius: 2px;
      background: var(--pages-neutral-3, #f5f5f5);
      color: var(--pages-neutral-10, #555);
    }
    .provenance {
      font-size: 9px; padding: 1px 4px;
      border-radius: 2px; text-transform: lowercase;
      background: var(--pages-neutral-3, #f5f5f5);
      color: var(--pages-neutral-8, #999);
    }
    .run-btn {
      flex-shrink: 0; padding: var(--pages-space-1, 4px) var(--pages-space-2, 8px);
      background: var(--pages-accent-9, #2563eb); color: white;
      border: none; border-radius: var(--pages-radius-sm, 4px);
      cursor: pointer; font-size: var(--pages-font-size-sm, 12px);
    }
    .run-btn:hover { background: var(--pages-accent-10, #1d4ed8); }
    .empty {
      padding: var(--pages-space-4, 16px);
      color: var(--pages-neutral-8, #999);
      text-align: center; font-style: italic;
    }
    .header-bar {
      display: flex; align-items: center; justify-content: flex-end;
      padding: var(--pages-space-1, 4px) var(--pages-space-2, 8px);
      border-bottom: 1px solid var(--pages-neutral-4, #e5e5e5);
    }
    .upload-btn {
      padding: var(--pages-space-1, 4px) var(--pages-space-2, 8px);
      background: var(--pages-neutral-3, #f5f5f5); color: var(--pages-neutral-11, #333);
      border: 1px solid var(--pages-neutral-5, #ddd); border-radius: var(--pages-radius-sm, 4px);
      cursor: pointer; font-size: var(--pages-font-size-sm, 12px);
    }
    .upload-btn:hover { background: var(--pages-neutral-4, #e5e5e5); }
    .upload-panel {
      padding: var(--pages-space-2, 8px);
      border-bottom: 1px solid var(--pages-neutral-4, #e5e5e5);
      background: var(--pages-neutral-2, #fafafa);
    }
    .upload-panel textarea {
      width: 100%; box-sizing: border-box; min-height: 80px;
      padding: var(--pages-space-2, 8px);
      border: 1px solid var(--pages-neutral-5, #ddd); border-radius: var(--pages-radius-sm, 4px);
      font-family: monospace; font-size: var(--pages-font-size-sm, 12px);
      background: var(--pages-neutral-1, #fff); color: var(--pages-neutral-12, #1a1a1a);
      resize: vertical;
    }
    .upload-actions {
      display: flex; gap: var(--pages-space-2, 8px); margin-top: var(--pages-space-1, 4px);
      align-items: center;
    }
    .submit-btn {
      padding: var(--pages-space-1, 4px) var(--pages-space-2, 8px);
      background: var(--pages-accent-9, #2563eb); color: white;
      border: none; border-radius: var(--pages-radius-sm, 4px);
      cursor: pointer; font-size: var(--pages-font-size-sm, 12px);
    }
    .submit-btn:hover { background: var(--pages-accent-10, #1d4ed8); }
    .submit-btn:disabled { opacity: 0.5; cursor: default; }
    .edit-btn {
      background: none; border: none; cursor: pointer;
      color: var(--pages-neutral-8, #999); font-size: 12px; padding: 2px 4px;
    }
    .edit-btn:hover { color: var(--pages-accent-9, #2563eb); }
    .meta-editor {
      padding: var(--pages-space-2, 8px);
      background: var(--pages-neutral-2, #fafafa);
      border-top: 1px solid var(--pages-neutral-4, #e5e5e5);
    }
    .meta-editor label {
      display: block; font-size: 10px; color: var(--pages-neutral-9, #777);
      margin-top: var(--pages-space-1, 4px);
    }
    .meta-editor input {
      width: 100%; box-sizing: border-box;
      padding: 2px var(--pages-space-1, 4px);
      border: 1px solid var(--pages-neutral-5, #ddd); border-radius: 2px;
      font-size: var(--pages-font-size-sm, 12px);
      background: var(--pages-neutral-1, #fff); color: var(--pages-neutral-12, #1a1a1a);
    }
    .meta-editor-actions { margin-top: var(--pages-space-1, 4px); }
  `;

  @property() baseUrl = '';
  @state() searchText = '';
  @state() filterLabels: string[] = [];
  @state() private _showUpload = false;
  @state() private _uploadYaml = '';
  @state() private _editingScript: string | null = null;
  @state() private _editDesc = '';
  @state() private _editLabels = '';
  @state() private _editTags = '';

  @state() private _scripts: ScriptDescriptor[] = [];
  @state() private _readiness = new Map<string, ReadinessStatus>();
  @state() private _allLabels: string[] = [];

  @property({ attribute: false })
  set scripts(value: ScriptDescriptor[]) {
    this._scripts = value;
    this._allLabels = [...new Set(value.flatMap(s => s.labels))];
    this._probeAll();
  }

  get scripts(): ScriptDescriptor[] {
    return this._scripts;
  }

  async loadLibrary(): Promise<void> {
    try {
      const resp = await fetch(`${this.baseUrl}/scenario/library`);
      if (!resp.ok) return;
      this.scripts = await resp.json() as ScriptDescriptor[];
    } catch { /* ignore */ }
  }

  private _probeAll(): void {
    const readiness = new Map<string, ReadinessStatus>();
    for (const script of this._scripts) {
      readiness.set(script.name, probeReadiness(script.firstStepTargets));
    }
    this._readiness = readiness;
  }

  private get _filtered(): ScriptDescriptor[] {
    let result = this._scripts;
    if (this.searchText) {
      const q = this.searchText.toLowerCase();
      result = result.filter(s =>
        s.name.toLowerCase().includes(q) ||
        (s.description ?? '').toLowerCase().includes(q));
    }
    if (this.filterLabels.length > 0) {
      result = result.filter(s =>
        this.filterLabels.every(l => s.labels.includes(l)));
    }
    return result;
  }

  override render(): TemplateResult {
    return html`
      <div class="header-bar">
        <button class="upload-btn" aria-label="Upload script"
                @click=${() => { this._showUpload = !this._showUpload; }}>Upload</button>
      </div>
      ${this._showUpload ? html`
        <div class="upload-panel">
          <textarea placeholder="Paste YAML here..." aria-label="Script YAML"
                    @input=${(e: Event) => { this._uploadYaml = (e.target as HTMLTextAreaElement).value; }}></textarea>
          <div class="upload-actions">
            <button class="submit-btn" aria-label="Submit upload"
                    ?disabled=${!this._uploadYaml.trim()}
                    @click=${() => { void this._submitUpload(); }}>Upload</button>
            <input type="file" accept=".yaml,.yml" aria-label="Upload YAML file"
                   @change=${(e: Event) => { void this._handleFileUpload(e); }}>
          </div>
        </div>
      ` : nothing}
      <div class="search">
        <input type="text" placeholder="Search scripts..."
               .value=${this.searchText}
               @input=${(e: Event) => { this.searchText = (e.target as HTMLInputElement).value; }}
               aria-label="Search scripts">
      </div>
      ${this._allLabels.length > 0 ? html`
        <div class="filters">
          ${this._allLabels.map(label => html`
            <span class="filter-chip ${this.filterLabels.includes(label) ? 'active' : ''}"
                  @click=${() => { this._toggleLabel(label); }}>${label}</span>
          `)}
        </div>
      ` : nothing}
      <div class="script-list">
        ${this._filtered.length === 0
          ? html`<div class="empty">No scripts found</div>`
          : this._filtered.map(s => this._renderScript(s))}
      </div>
    `;
  }

  private _renderScript(script: ScriptDescriptor): TemplateResult {
    const status = this._readiness.get(script.name) ?? 'unknown';
    const editing = this._editingScript === script.name;
    return html`
      <div class="script-item">
        <span class="readiness readiness-${status}">${status}</span>
        <div class="script-info">
          <div class="script-name">${script.name}</div>
          ${script.description ? html`<div class="script-desc">${script.description}</div>` : nothing}
          <div class="script-meta">
            ${script.labels.map(l => html`<span class="label-chip">${l}</span>`)}
            ${script.tags.map(t => html`<span class="label-chip">${t}</span>`)}
            <span class="provenance">${script.provenance.toLowerCase()}</span>
          </div>
          ${editing ? this._renderMetaEditor(script) : nothing}
        </div>
        <button class="edit-btn" aria-label="Edit ${script.name} metadata"
                @click=${() => { this._startEdit(script); }}>&#9998;</button>
        <button class="run-btn" @click=${() => { this._selectScript(script); }}
                aria-label="Run ${script.name}">Run</button>
      </div>
    `;
  }

  private _renderMetaEditor(script: ScriptDescriptor): TemplateResult {
    return html`
      <div class="meta-editor">
        <label>Description
          <input type="text" .value=${this._editDesc}
                 @input=${(e: Event) => { this._editDesc = (e.target as HTMLInputElement).value; }}>
        </label>
        <label>Labels (comma-separated)
          <input type="text" .value=${this._editLabels}
                 @input=${(e: Event) => { this._editLabels = (e.target as HTMLInputElement).value; }}>
        </label>
        <label>Tags (comma-separated)
          <input type="text" .value=${this._editTags}
                 @input=${(e: Event) => { this._editTags = (e.target as HTMLInputElement).value; }}>
        </label>
        <div class="meta-editor-actions">
          <button class="submit-btn" aria-label="Save metadata"
                  @click=${() => { void this._saveMeta(script.name); }}>Save</button>
          <button class="edit-btn" @click=${() => { this._editingScript = null; }}>Cancel</button>
        </div>
      </div>
    `;
  }

  private _toggleLabel(label: string): void {
    if (this.filterLabels.includes(label)) {
      this.filterLabels = this.filterLabels.filter(l => l !== label);
    } else {
      this.filterLabels = [...this.filterLabels, label];
    }
  }

  private async _submitUpload(): Promise<void> {
    if (!this._uploadYaml.trim()) return;
    try {
      const resp = await fetch(`${this.baseUrl}/scenario/library`, {
        method: 'POST',
        headers: { 'Content-Type': 'text/yaml' },
        body: this._uploadYaml,
      });
      if (resp.ok) {
        this._uploadYaml = '';
        this._showUpload = false;
        await this.loadLibrary();
      }
    } catch { /* ignore */ }
  }

  private async _handleFileUpload(e: Event): Promise<void> {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const text = await file.text();
    this._uploadYaml = text;
    await this._submitUpload();
  }

  private _startEdit(script: ScriptDescriptor): void {
    if (this._editingScript === script.name) {
      this._editingScript = null;
      return;
    }
    this._editingScript = script.name;
    this._editDesc = script.description ?? '';
    this._editLabels = script.labels.join(', ');
    this._editTags = script.tags.join(', ');
  }

  private async _saveMeta(name: string): Promise<void> {
    const labels = this._editLabels.split(',').map(s => s.trim()).filter(Boolean);
    const tags = this._editTags.split(',').map(s => s.trim()).filter(Boolean);
    try {
      const resp = await fetch(`${this.baseUrl}/scenario/library/${name}/meta`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: this._editDesc, labels, tags }),
      });
      if (resp.ok) {
        this._editingScript = null;
        await this.loadLibrary();
      }
    } catch { /* ignore */ }
  }

  private _selectScript(script: ScriptDescriptor): void {
    this.dispatchEvent(new CustomEvent('script-selected', {
      detail: { name: script.name },
      bubbles: true,
      composed: true,
    }));
  }
}

if (!customElements.get('pages-library-view')) {
  customElements.define('pages-library-view', PagesLibraryView);
}
