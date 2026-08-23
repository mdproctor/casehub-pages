import { LitElement, html, css, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import type { TypedDataSet, ColumnId } from '@casehubio/pages-data';
import type { FilterState } from './types.js';

@customElement('pages-filter-bar')
export class PagesFilterBar extends LitElement {
  @property({ type: Object }) dataSet?: TypedDataSet;
  @property({ type: String }) chipField?: ColumnId;
  @property({ type: Array }) chipValues?: string[];
  @property({ type: String }) entityField?: ColumnId;
  @property({ type: String }) entityLabel = '';
  @property({ type: Boolean }) showDateRange = false;
  @property({ type: String }) dateFromLabel = 'From';
  @property({ type: String }) dateToLabel = 'To';

  @state() private _selectedChips: readonly string[] = [];
  @state() private _selectedEntity: string | null = null;
  @state() private _dateFrom = '';
  @state() private _dateTo = '';
  @state() private _dropdownOpen = false;
  @state() private _focusedIndex = -1;

  static override styles = css`
    :host { display: block; }
    .filter-toolbar {
      display: flex;
      gap: var(--pages-space-4, 16px);
      padding: var(--pages-space-3, 12px);
      background: var(--pages-neutral-2, #f8f9fa);
      border-radius: var(--pages-radius-1, 4px);
      flex-wrap: wrap;
      align-items: center;
    }
    .filter-section {
      display: flex;
      align-items: center;
      gap: var(--pages-space-2, 8px);
    }
    .chip {
      padding: var(--pages-space-1, 4px) var(--pages-space-3, 12px);
      border: 1px solid var(--pages-neutral-6, #d1d5db);
      border-radius: 16px;
      background: var(--pages-neutral-1, #fff);
      color: var(--pages-neutral-12, #111);
      cursor: pointer;
      font-size: 13px;
      font-weight: 500;
      font-family: var(--pages-font-family, system-ui, sans-serif);
      transition: all 0.2s;
    }
    .chip[aria-checked="true"] {
      background: var(--pages-accent-9, #2563eb);
      color: white;
      border-color: var(--pages-accent-9, #2563eb);
    }
    .chip:hover { border-color: var(--pages-accent-7, #3b82f6); }
    .chip[aria-checked="true"]:hover { background: var(--pages-accent-10, #1d4ed8); }
    .dropdown-wrapper { position: relative; }
    .dropdown-trigger {
      padding: var(--pages-space-1, 4px) var(--pages-space-2, 8px);
      border: 1px solid var(--pages-neutral-5, #d4d4d4);
      border-radius: var(--pages-radius-1, 4px);
      background: var(--pages-neutral-1, #fff);
      color: var(--pages-neutral-12, #1a1a1a);
      font-size: 14px;
      font-family: var(--pages-font-family, system-ui, sans-serif);
      cursor: pointer;
      text-align: left;
      display: flex;
      align-items: center;
      gap: var(--pages-space-2, 8px);
      min-width: 120px;
    }
    .dropdown-trigger:hover { border-color: var(--pages-neutral-7, #a3a3a3); }
    .dropdown-arrow { font-size: 10px; color: var(--pages-neutral-8, #888); margin-left: auto; }
    .dropdown-panel {
      position: absolute;
      top: 100%;
      left: 0;
      right: 0;
      margin-top: 2px;
      background: var(--pages-neutral-1, #fff);
      border: 1px solid var(--pages-neutral-5, #d4d4d4);
      border-radius: var(--pages-radius-1, 4px);
      box-shadow: var(--pages-shadow-3, 0 4px 12px rgba(0,0,0,0.1));
      z-index: 10;
      max-height: 200px;
      overflow-y: auto;
      list-style: none;
      margin: 2px 0 0;
      padding: var(--pages-space-1, 4px);
    }
    .dropdown-option {
      padding: var(--pages-space-2, 8px);
      cursor: pointer;
      border-radius: var(--pages-radius-1, 4px);
      font-size: 14px;
    }
    .dropdown-option:hover { background: var(--pages-neutral-3, #f5f5f5); }
    .dropdown-option.selected { background: var(--pages-accent-3, #e0f2fe); }
    .dropdown-option.focused {
      outline: 2px solid var(--pages-accent-7, #818cf8);
      outline-offset: -2px;
    }
    .filter-label {
      font-weight: 500;
      font-size: 14px;
      font-family: var(--pages-font-family, system-ui, sans-serif);
      color: var(--pages-neutral-11, #333);
    }
    input[type="date"] {
      padding: var(--pages-space-1, 4px) var(--pages-space-2, 8px);
      border: 1px solid var(--pages-neutral-5, #d1d5db);
      border-radius: var(--pages-radius-1, 4px);
      font-size: 14px;
      font-family: var(--pages-font-family, system-ui, sans-serif);
      background: var(--pages-neutral-1, #fff);
      color: var(--pages-neutral-12, #111);
    }
  `;

  private get _resolvedChipValues(): string[] {
    if (this.chipValues) return this.chipValues;
    if (this.chipField && this.dataSet) {
      const unique = new Set<string>();
      for (const row of this.dataSet.rows) {
        const val = row.text(this.chipField);
        if (val) unique.add(val);
      }
      return [...unique].sort();
    }
    return [];
  }

  private get _resolvedEntityValues(): string[] {
    if (this.entityField && this.dataSet) {
      const unique = new Set<string>();
      for (const row of this.dataSet.rows) {
        const val = row.text(this.entityField);
        if (val) unique.add(val);
      }
      return [...unique].sort();
    }
    return [];
  }

  private get _resolvedEntityLabel(): string {
    if (this.entityLabel) return this.entityLabel;
    if (this.entityField && this.dataSet) {
      const col = this.dataSet.columns.find(c => c.id === this.entityField);
      if (col) return col.name;
    }
    return 'Entity';
  }

  private _emitFilterChange(): void {
    this.dispatchEvent(new CustomEvent<FilterState>('filter-change', {
      bubbles: true,
      composed: true,
      detail: {
        selectedChips: [...this._selectedChips],
        selectedEntity: this._selectedEntity,
        dateFrom: this._dateFrom,
        dateTo: this._dateTo,
      },
    }));
  }

  private _handleChipClick(value: string): void {
    const idx = this._selectedChips.indexOf(value);
    this._selectedChips = idx >= 0
      ? this._selectedChips.filter(v => v !== value)
      : [...this._selectedChips, value];
    this._emitFilterChange();
  }

  private _toggleDropdown(): void {
    this._dropdownOpen = !this._dropdownOpen;
    if (this._dropdownOpen) {
      const entities = this._resolvedEntityValues;
      const currentIdx = this._selectedEntity
        ? entities.indexOf(this._selectedEntity) + 1
        : 0;
      this._focusedIndex = currentIdx;
      document.addEventListener('click', this._closeDropdown);
    } else {
      document.removeEventListener('click', this._closeDropdown);
    }
  }

  private _closeDropdown = (): void => {
    this._dropdownOpen = false;
    this._focusedIndex = -1;
    document.removeEventListener('click', this._closeDropdown);
  };

  private _selectEntity(value: string | null): void {
    this._selectedEntity = value;
    this._dropdownOpen = false;
    document.removeEventListener('click', this._closeDropdown);
    this._emitFilterChange();
  }

  private _handleDropdownKeyDown(event: KeyboardEvent): void {
    const options = [null, ...this._resolvedEntityValues];
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        if (!this._dropdownOpen) { this._toggleDropdown(); return; }
        this._focusedIndex = Math.min(this._focusedIndex + 1, options.length - 1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        this._focusedIndex = Math.max(this._focusedIndex - 1, 0);
        break;
      case 'Enter':
        event.preventDefault();
        if (this._dropdownOpen) {
          this._selectEntity(options[this._focusedIndex] ?? null);
        } else {
          this._toggleDropdown();
        }
        break;
      case 'Escape':
        if (this._dropdownOpen) {
          event.preventDefault();
          this._closeDropdown();
        }
        break;
    }
  }

  private _handleDateFromChange(e: Event): void {
    this._dateFrom = (e.target as HTMLInputElement).value;
    this._emitFilterChange();
  }

  private _handleDateToChange(e: Event): void {
    this._dateTo = (e.target as HTMLInputElement).value;
    this._emitFilterChange();
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    document.removeEventListener('click', this._closeDropdown);
  }

  private _renderChips() {
    const values = this._resolvedChipValues;
    if (values.length === 0) return nothing;
    return html`
      <div class="filter-section" role="group" aria-label="Type filter">
        ${values.map(val => html`
          <button class="chip"
            role="checkbox"
            aria-checked="${this._selectedChips.includes(val)}"
            @click=${() => this._handleChipClick(val)}
          >${val}</button>
        `)}
      </div>
    `;
  }

  private _renderEntityDropdown() {
    if (!this.entityField) return nothing;
    const entities = this._resolvedEntityValues;
    const label = this._resolvedEntityLabel;
    const allLabel = `All ${label}s`;
    const triggerText = this._selectedEntity ?? allLabel;
    const options = [null, ...entities];

    return html`
      <div class="filter-section">
        <span class="filter-label">${label}:</span>
        <div class="dropdown-wrapper" @click=${(e: Event) => e.stopPropagation()}>
          <button class="dropdown-trigger"
            role="combobox"
            aria-expanded="${this._dropdownOpen}"
            aria-haspopup="listbox"
            aria-label="${label} filter"
            aria-activedescendant="${this._dropdownOpen && this._focusedIndex >= 0 ? `entity-option-${this._focusedIndex}` : ''}"
            @click=${() => this._toggleDropdown()}
            @keydown=${this._handleDropdownKeyDown}>
            <span>${triggerText}</span>
            <span class="dropdown-arrow">${this._dropdownOpen ? '▲' : '▼'}</span>
          </button>
          ${this._dropdownOpen ? html`
            <ul class="dropdown-panel" role="listbox" aria-label="${label} options">
              ${options.map((entity, index) => html`
                <li class="dropdown-option ${entity === this._selectedEntity ? 'selected' : ''} ${index === this._focusedIndex ? 'focused' : ''}"
                  role="option"
                  aria-selected="${entity === this._selectedEntity}"
                  id="entity-option-${index}"
                  @click=${() => this._selectEntity(entity)}>
                  ${entity ?? allLabel}
                </li>
              `)}
            </ul>
          ` : nothing}
        </div>
      </div>
    `;
  }

  private _renderDateRange() {
    if (!this.showDateRange) return nothing;
    return html`
      <div class="filter-section">
        <label class="filter-label" for="filter-date-from">${this.dateFromLabel}:</label>
        <input id="filter-date-from" type="date" .value=${this._dateFrom}
          @change=${this._handleDateFromChange} />
        <label class="filter-label" for="filter-date-to">${this.dateToLabel}:</label>
        <input id="filter-date-to" type="date" .value=${this._dateTo}
          @change=${this._handleDateToChange} />
      </div>
    `;
  }

  override render() {
    const hasContent = this._resolvedChipValues.length > 0
      || this.entityField
      || this.showDateRange;
    if (!hasContent) return nothing;

    return html`
      <div class="filter-toolbar" role="toolbar" aria-label="Filters">
        ${this._renderChips()}
        ${this._renderEntityDropdown()}
        ${this._renderDateRange()}
      </div>
    `;
  }
}
