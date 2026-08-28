import { LitElement, html, css, nothing, type TemplateResult } from 'lit';
import { property, state } from 'lit/decorators.js';
import type { PaletteItem, PaletteSelectDetail, IconRenderer, PaletteMode } from '../types.js';
import { renderStencilList } from '../internal/stencil-list-renderer.js';

export class PagesDiagramPalette extends LitElement {
  static override styles = css`
    :host { display: block; flex-shrink: 0; font-family: var(--pages-font-family, system-ui, sans-serif); user-select: none; }
    .palette-search {
      display: block; width: 100%; padding: var(--pages-space-1, 4px) var(--pages-space-2, 8px);
      border: 1px solid var(--pages-neutral-4, #e5e7eb); border-radius: var(--pages-radius-sm, 4px);
      background: var(--pages-neutral-2, #fafafa); color: var(--pages-neutral-12, #333);
      font-size: var(--pages-font-size-base, 14px); font-family: inherit;
      margin-bottom: var(--pages-space-2, 8px); box-sizing: border-box;
    }
    .palette-search:focus { outline: 2px solid var(--pages-accent-9, #5470c6); outline-offset: -2px; }
    .palette-item {
      display: flex; align-items: flex-start; gap: var(--pages-space-2, 8px);
      padding: var(--pages-space-1, 4px) var(--pages-space-2, 8px);
      border-radius: var(--pages-radius-sm, 4px); cursor: pointer;
      border: none; background: transparent; color: var(--pages-neutral-12, #333);
      font-size: var(--pages-font-size-base, 14px); width: 100%; text-align: left;
    }
    .palette-item:hover { background: var(--pages-neutral-3, #f3f4f6); }
    .palette-item:focus-visible { outline: 2px solid var(--pages-accent-9, #5470c6); outline-offset: -2px; }
    .palette-item-icon { width: 20px; height: 20px; flex-shrink: 0; display: inline-flex; align-items: center; justify-content: center; }
    .palette-item-label { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    details.palette-group { border: 1px solid var(--pages-neutral-4, #e5e7eb); border-radius: var(--pages-radius-sm, 4px); margin-bottom: var(--pages-space-1, 4px); }
    details.palette-group summary {
      padding: var(--pages-space-1, 4px) var(--pages-space-2, 8px);
      font-size: var(--pages-font-size-base, 14px); font-weight: var(--pages-font-weight-semibold, 600);
      color: var(--pages-neutral-11, #374151); cursor: pointer; user-select: none;
    }
    .palette-group-items, .ungrouped-items {
      display: flex; flex-direction: column; padding: var(--pages-space-1, 4px);
    }
    .palette-group-header {
      padding: var(--pages-space-1, 4px) var(--pages-space-2, 8px);
      font-size: var(--pages-font-size-base, 14px); font-weight: var(--pages-font-weight-semibold, 600);
      color: var(--pages-neutral-11, #374151);
    }
    .palette-toolbar {
      display: flex; justify-content: flex-end; margin-bottom: 0; position: absolute; top: 2px; right: 2px;
    }
    :host { position: relative; }
    .mode-toggle {
      display: inline-flex; align-items: center; justify-content: center;
      width: 22px; height: 22px; border: none;
      border-radius: var(--pages-radius-sm, 4px); background: transparent;
      color: var(--pages-neutral-9, #9ca3af); cursor: pointer; font-size: 12px; opacity: 0.7;
    }
    .mode-toggle:hover { background: var(--pages-neutral-3, #f3f4f6); opacity: 1; }
    .mode-toggle:focus-visible { outline: 2px solid var(--pages-accent-9, #5470c6); outline-offset: -2px; }
    .compact-column {
      display: flex; flex-direction: column; align-items: center; gap: var(--pages-space-1, 4px);
    }
    .palette-item.compact {
      width: 32px; height: 32px; padding: 0;
      display: inline-flex; align-items: center; justify-content: center;
    }
    :host(.compact) { width: auto !important; min-width: 0; padding: 4px; }
  `;

  @property({ attribute: false }) items: readonly PaletteItem[] = [];
  @property() paletteId: string | undefined;
  @property({ type: Number }) searchThreshold = 8;
  @property({ attribute: false }) iconRenderer: IconRenderer | undefined;

  @state() private _searchQuery = '';
  @state() private _mode: PaletteMode = 'standard';

  override connectedCallback(): void {
    super.connectedCallback();
    const stored = localStorage.getItem(this._modeStorageKey());
    if (stored === 'compact' || stored === 'standard') this._mode = stored;
    this.classList.toggle('compact', this._mode === 'compact');
  }

  override render(): TemplateResult {
    const compact = this._mode === 'compact';
    const showSearch = !compact && this.items.length > this.searchThreshold;
    return html`
      <div role="region" aria-label="Node palette">
        <div class="palette-toolbar">
          <button class="mode-toggle"
            aria-label=${compact ? 'Switch to standard view' : 'Switch to compact view'}
            title=${compact ? 'Standard view' : 'Compact view'}
            @click=${this._toggleMode}>
            ${compact ? '☰' : '⊞'}
          </button>
        </div>
        ${showSearch
          ? html`<input class="palette-search" role="searchbox"
              aria-label="Filter palette items"
              placeholder="Search..."
              .value=${this._searchQuery}
              @input=${(e: Event) => { this._searchQuery = (e.target as HTMLInputElement).value; }}
            />`
          : nothing}
        ${renderStencilList(this.items, {
          collapsible: !compact,
          isGroupOpen: (name) => this._isGroupOpen(name),
          onGroupToggle: (name, open) => this._onGroupToggle(name, open),
          onSelect: (item) => this._onSelect(item),
          searchQuery: this._searchQuery,
          itemRole: 'button',
          iconRenderer: this.iconRenderer,
          mode: this._mode,
        })}
      </div>`;
  }

  private _onSelect(item: PaletteItem): void {
    this.dispatchEvent(new CustomEvent<PaletteSelectDetail>('pages-palette-select', {
      detail: { item },
      bubbles: true,
      composed: true,
    }));
  }

  private _toggleMode(): void {
    this._mode = this._mode === 'standard' ? 'compact' : 'standard';
    localStorage.setItem(this._modeStorageKey(), this._mode);
    this.classList.toggle('compact', this._mode === 'compact');
  }

  private _modeStorageKey(): string {
    return `pages-palette-${this.paletteId ?? 'default'}-mode`;
  }

  private _storageKey(groupName: string): string {
    return `pages-palette-${this.paletteId ?? 'default'}-${groupName}`;
  }

  private _isGroupOpen(name: string): boolean {
    const stored = localStorage.getItem(this._storageKey(name));
    return stored === null ? true : stored === 'true';
  }

  private _onGroupToggle(name: string, open: boolean): void {
    localStorage.setItem(this._storageKey(name), String(open));
  }
}

if (!customElements.get('pages-diagram-palette')) {
  customElements.define('pages-diagram-palette', PagesDiagramPalette);
}
