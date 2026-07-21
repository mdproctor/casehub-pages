import { LitElement, html, css, type TemplateResult } from 'lit';
import { property, state } from 'lit/decorators.js';
import { renderDisplayField, renderEditField } from './field-renderers.js';
import { getFieldRenderer, hasFieldRenderer } from './field-registry.js';
import type { FieldSchema, FieldRendererElement } from './types.js';
import { validateField } from './validation.js';

export class PagesSchemaForm extends LitElement {
  @property({ type: Object }) schema: FieldSchema | null = null;
  @property({ type: Object }) data: Record<string, unknown> | null = null;
  @property({ type: String }) mode: 'display' | 'edit' = 'display';
  @property({ type: Boolean }) validateOnBlur = false;

  @state() private _editData: Record<string, unknown> = {};
  @state() private _errors: Record<string, string> = {};

  static override styles = css`
    :host { display: block; font-family: var(--pages-font-family, system-ui, sans-serif); font-size: var(--pages-font-size-base, 14px); }
    .field { display: flex; flex-direction: column; gap: 6px; padding: var(--pages-space-1, 4px) 0; }
    .label { font-size: var(--pages-font-size-base, 14px); font-weight: 500; color: var(--pages-neutral-12, #333); text-transform: capitalize; }
    .value { color: var(--pages-neutral-12, #333); }
    .muted { color: var(--pages-neutral-8, #999); }
    .nested { flex-direction: column; }
    .nested-content { padding-left: var(--pages-space-4, 16px); border-left: 2px solid var(--pages-neutral-5, #e0e0e0); }
    label { display: block; font-size: var(--pages-font-size-base, 14px); font-weight: 500; margin-bottom: 6px; text-transform: capitalize; color: var(--pages-neutral-12, #333); }
    input, select, textarea { width: 100%; padding: 8px 12px; border: 1px solid var(--pages-neutral-6, #e0e0e0); border-radius: var(--pages-radius-sm, 4px); font-family: inherit; font-size: var(--pages-font-size-base, 14px); background: var(--pages-neutral-1, #fff); color: var(--pages-neutral-12, #333); box-sizing: border-box; }
    input:focus, select:focus, textarea:focus { outline: none; border-color: var(--pages-accent-9, #5470c6); }
    input:read-only { background: var(--pages-neutral-3, #f5f5f5); cursor: not-allowed; }
    textarea { min-height: 80px; resize: vertical; }
    .description { color: var(--pages-neutral-9, #888); font-size: var(--pages-font-size-xs, 11px); margin-top: var(--pages-space-0-5, 2px); }
    .error { color: var(--pages-danger-9, #dc2626); font-size: var(--pages-font-size-xs, 11px); margin-top: var(--pages-space-0-5, 2px); }
    .array-item { margin-bottom: var(--pages-space-3, 12px); padding-bottom: var(--pages-space-3, 12px); border-bottom: 1px solid var(--pages-neutral-4, #eee); }
    .array-item-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: var(--pages-space-1, 4px); }
    .array-index { font-size: var(--pages-font-size-sm, 12px); font-weight: var(--pages-font-weight-medium, 500); color: var(--pages-neutral-9, #888); }
    .array-item-inline { display: flex; gap: var(--pages-space-2, 8px); align-items: center; margin-bottom: var(--pages-space-1, 4px); }
    .array-item-inline input { flex: 1; }
    .array-remove { background: none; border: 1px solid var(--pages-danger-6, #fca5a5); color: var(--pages-danger-9, #dc2626); border-radius: var(--pages-radius-sm, 4px); padding: 2px 8px; cursor: pointer; font-size: var(--pages-font-size-xs, 11px); }
    .array-remove:hover { background: var(--pages-danger-2, #fee); }
    .array-add { background: none; border: 1px dashed var(--pages-neutral-6, #ccc); color: var(--pages-neutral-10, #666); border-radius: var(--pages-radius-sm, 4px); padding: var(--pages-space-1, 4px) var(--pages-space-3, 12px); cursor: pointer; font-size: var(--pages-font-size-sm, 12px); width: 100%; margin-top: var(--pages-space-2, 8px); }
    .array-add:hover { background: var(--pages-neutral-2, #f5f5f5); border-color: var(--pages-neutral-8, #999); }
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
            const renderer = el as FieldRendererElement;
            renderer.value = dataSource[key];
            renderer.schema = fieldSchema;
            renderer.mode = this.mode;
            return html`${el}`;
          }
          return this.mode === 'display'
            ? renderDisplayField(key, fieldSchema, dataSource[key])
            : renderEditField(key, fieldSchema, dataSource[key], this._handleFieldChange, this._errors[key], this._handleBlur);
        })}
        ${this.mode === 'edit' ? html`<slot name="actions"></slot>` : html``}
      </div>
    `;
  }

  private _handleFieldChange = (key: string, value: unknown): void => {
    this._editData = { ...this._editData, [key]: value };
    this.dispatchEvent(new CustomEvent('pages-form-change', {
      bubbles: true, composed: true,
      detail: { key, value, data: this._editData },
    }));
  };

  private _handleBlur = (key: string): void => {
    if (!this.validateOnBlur || !this.schema?.properties) return;
    const fieldSchema = this.schema.properties[key];
    if (!fieldSchema) return;
    const required = this.schema.required?.includes(key) ?? false;
    const error = validateField(key, fieldSchema, this._editData[key], required);
    if (error) {
      this._errors = { ...this._errors, [key]: error };
    } else {
      const { [key]: _, ...rest } = this._errors;
      this._errors = rest;
    }
  };

  submit(): Record<string, unknown> | null {
    if (!this.schema?.properties) return null;
    const requiredSet = new Set(this.schema.required ?? []);
    const errors: Record<string, string> = {};
    for (const [key, fieldSchema] of Object.entries(this.schema.properties)) {
      const error = validateField(key, fieldSchema, this._editData[key], requiredSet.has(key));
      if (error) errors[key] = error;
    }
    this._errors = errors;
    if (Object.keys(errors).length > 0) return null;
    this.dispatchEvent(new CustomEvent('pages-form-submit', {
      bubbles: true, composed: true,
      detail: { data: { ...this._editData } },
    }));
    return { ...this._editData };
  }
}

if (!customElements.get('pages-schema-form')) {
  customElements.define('pages-schema-form', PagesSchemaForm);
}

declare global {
  interface HTMLElementTagNameMap {
    'pages-schema-form': PagesSchemaForm;
  }
}
