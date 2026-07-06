import { LitElement, html, css, type TemplateResult } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { renderDisplayField, renderEditField } from './field-renderers.js';
import { getFieldRenderer, hasFieldRenderer } from './field-registry.js';

interface SchemaObject {
  readonly type?: string;
  readonly properties?: Readonly<Record<string, SchemaObject>>;
  readonly required?: readonly string[];
  readonly format?: string;
  readonly enum?: readonly string[];
  readonly maxLength?: number;
  readonly items?: SchemaObject;
}

@customElement('pages-schema-form')
export class PagesSchemaForm extends LitElement {
  @property({ type: Object }) schema: SchemaObject | null = null;
  @property({ type: Object }) data: Record<string, unknown> | null = null;
  @property({ type: String }) mode: 'display' | 'edit' = 'display';

  @state() private _editData: Record<string, unknown> = {};

  static override styles = css`
    :host { display: block; font-family: var(--pages-font-family, system-ui); font-size: var(--pages-font-size-base, 14px); }
    .field { display: flex; gap: var(--pages-space-2, 8px); padding: var(--pages-space-1, 4px) 0; align-items: baseline; }
    .label { color: var(--pages-neutral-11, #666); font-size: var(--pages-font-size-sm, 12px); font-weight: var(--pages-font-weight-medium, 500); min-width: 120px; text-transform: capitalize; }
    .value { color: var(--pages-neutral-12, #111); }
    .muted { color: var(--pages-neutral-8, #999); }
    .nested { flex-direction: column; }
    .nested-content { padding-left: var(--pages-space-4, 16px); border-left: 2px solid var(--pages-neutral-5, #e0e0e0); }
    label { display: block; font-size: var(--pages-font-size-sm, 12px); font-weight: var(--pages-font-weight-medium, 500); margin-bottom: var(--pages-space-0-5, 2px); text-transform: capitalize; color: var(--pages-neutral-11, #666); }
    input, select, textarea { width: 100%; padding: var(--pages-space-1-5, 6px) var(--pages-space-2, 8px); border: 1px solid var(--pages-neutral-6, #ccc); border-radius: var(--pages-radius-sm, 4px); font-family: inherit; font-size: inherit; background: var(--pages-neutral-1, #fff); color: var(--pages-neutral-12, #111); }
    input:focus, select:focus, textarea:focus { outline: 2px solid var(--pages-accent-9, #2563eb); outline-offset: -1px; border-color: var(--pages-accent-9, #2563eb); }
    textarea { min-height: 80px; resize: vertical; }
    .error { color: var(--pages-danger-9, #dc2626); font-size: var(--pages-font-size-xs, 11px); margin-top: var(--pages-space-0-5, 2px); }
  `;

  override willUpdate(changed: Map<string, unknown>): void {
    if (changed.has('data') || changed.has('mode')) {
      this._editData = { ...(this.data ?? {}) };
    }
  }

  override render(): TemplateResult {
    if (!this.schema?.properties) {
      return html`<div class="empty">No schema provided</div>`;
    }

    const properties = this.schema.properties;
    const dataSource = this.mode === 'edit' ? this._editData : (this.data ?? {});

    return html`
      <div class="schema-form" role="${this.mode === 'edit' ? 'form' : 'group'}">
        ${Object.entries(properties).map(([key, fieldSchema]) => {
          if (fieldSchema.format && hasFieldRenderer(fieldSchema.format)) {
            const Renderer = getFieldRenderer(fieldSchema.format)!;
            const el = new Renderer();
            el.value = dataSource[key];
            el.schema = fieldSchema;
            el.mode = this.mode;
            return html`${el}`;
          }
          return this.mode === 'display'
            ? renderDisplayField(key, fieldSchema, dataSource[key])
            : renderEditField(key, fieldSchema, dataSource[key], this._handleFieldChange);
        })}
        ${this.mode === 'edit' ? html`<slot name="actions"></slot>` : html``}
      </div>
    `;
  }

  private _handleFieldChange = (key: string, value: unknown): void => {
    this._editData = { ...this._editData, [key]: value };
    this.dispatchEvent(new CustomEvent('pages-schema-form-change', {
      bubbles: true, composed: true,
      detail: { key, value, data: this._editData },
    }));
  };

  submit(): Record<string, unknown> | null {
    // Basic validation against required fields
    const required = new Set(this.schema?.required ?? []);
    for (const field of required) {
      const val = this._editData[field];
      if (val === null || val === undefined || val === '') return null;
    }
    this.dispatchEvent(new CustomEvent('pages-schema-form-submit', {
      bubbles: true, composed: true,
      detail: { data: { ...this._editData } },
    }));
    return { ...this._editData };
  }
}
