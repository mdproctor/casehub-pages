import { html, type TemplateResult } from 'lit';
import type { FieldSchema } from './types.js';

const dateFormatter = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' });
const dateTimeFormatter = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

function formatDateValue(value: unknown, format: string): string {
  if (value === null || value === undefined || value === '') return '';
  const date = new Date(String(value));
  if (isNaN(date.getTime())) return String(value);
  return format === 'date-time' ? dateTimeFormatter.format(date) : dateFormatter.format(date);
}

function toDateInputValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '';
  const date = new Date(String(value));
  if (isNaN(date.getTime())) return '';
  return date.toISOString().split('T')[0]!;
}

function toDateTimeInputValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '';
  const date = new Date(String(value));
  if (isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 16);
}

function defaultForType(schema: FieldSchema): unknown {
  if (schema.type === 'object') return {};
  if (schema.type === 'number' || schema.type === 'integer') return 0;
  if (schema.type === 'boolean') return false;
  return '';
}

export function renderDisplayField(
  key: string,
  schema: FieldSchema,
  value: unknown,
): TemplateResult {
  if (schema.oneOf) {
    const match = schema.oneOf.find(o => o.const === value);
    const displayValue = match ? match.title : (value ?? '—');
    return html`<div class="field"><span class="label">${schema.title ?? key}</span><span class="value${value == null ? ' muted' : ''}">${displayValue}</span>${schema.description ? html`<span class="description">${schema.description}</span>` : ''}</div>`;
  }

  if (value === null || value === undefined) {
    return html`<div class="field"><span class="label">${schema.title ?? key}</span><span class="value muted">—</span>${schema.description ? html`<span class="description">${schema.description}</span>` : ''}</div>`;
  }

  if (schema.format === 'time') {
    return html`<div class="field"><span class="label">${schema.title ?? key}</span><span class="value">${value ?? '—'}</span>${schema.description ? html`<span class="description">${schema.description}</span>` : ''}</div>`;
  }

  if (schema.format === 'date' || schema.format === 'date-time') {
    return html`<div class="field"><span class="label">${schema.title ?? key}</span><span class="value">${formatDateValue(value, schema.format)}</span>${schema.description ? html`<span class="description">${schema.description}</span>` : ''}</div>`;
  }

  if (schema.type === 'boolean') {
    return html`<div class="field"><span class="label">${schema.title ?? key}</span><span class="value">${value ? 'Yes' : 'No'}</span>${schema.description ? html`<span class="description">${schema.description}</span>` : ''}</div>`;
  }

  if (schema.type === 'object' && schema.properties) {
    const obj = value as Record<string, unknown>;
    return html`
      <div class="field nested">
        <span class="label">${schema.title ?? key}</span>
        <div class="nested-content">
          ${Object.entries(schema.properties).map(([k, s]) =>
            renderDisplayField(k, s, obj[k])
          )}
        </div>
      </div>`;
  }

  if (schema.type === 'array' && Array.isArray(value)) {
    if (schema.items?.type === 'object' && schema.items.properties) {
      const itemSchema = schema.items;
      return html`
        <div class="field nested">
          <span class="label">${schema.title ?? key}</span>
          <div class="nested-content">
            ${(value as Record<string, unknown>[]).map((item, i) => html`
              <div class="array-item">
                <span class="array-index">${i + 1}.</span>
                ${Object.entries(itemSchema.properties!).map(([k, s]) =>
                  renderDisplayField(k, s, item[k])
                )}
              </div>
            `)}
          </div>
        </div>`;
    }
    return html`<div class="field"><span class="label">${schema.title ?? key}</span><span class="value">${(value as unknown[]).join(', ')}</span>${schema.description ? html`<span class="description">${schema.description}</span>` : ''}</div>`;
  }

  return html`<div class="field"><span class="label">${schema.title ?? key}</span><span class="value">${String(value)}</span>${schema.description ? html`<span class="description">${schema.description}</span>` : ''}</div>`;
}

export function renderEditField(
  key: string,
  schema: FieldSchema,
  value: unknown,
  onChange: (key: string, value: unknown) => void,
  error?: string,
  onBlur?: (key: string) => void,
): TemplateResult {
  if (schema.oneOf) {
    const currentMatch = schema.oneOf.some(o => o.const === value);
    return html`
      <div class="field">
        <label for="${key}">${schema.title ?? key}</label>
        <select id="${key}" ?readonly=${schema.readOnly} @change=${(e: Event) => onChange(key, (e.target as HTMLSelectElement).value)} @blur=${() => onBlur?.(key)}>
          ${!currentMatch ? html`<option value="" disabled selected>Select ${schema.title ?? key}...</option>` : ''}
          ${schema.oneOf.map(opt => html`<option value=${opt.const} ?selected=${value === opt.const}>${opt.title}</option>`)}
        </select>
        ${schema.description ? html`<span class="description">${schema.description}</span>` : ''}
        ${error ? html`<span class="error">${error}</span>` : ''}
      </div>`;
  }

  if (schema.enum) {
    return html`
      <div class="field">
        <label for="${key}">${schema.title ?? key}</label>
        <select id="${key}" @change=${(e: Event) => onChange(key, (e.target as HTMLSelectElement).value)} @blur=${() => onBlur?.(key)}>
          ${schema.enum.map(opt => html`<option value=${opt} ?selected=${value === opt}>${opt}</option>`)}
        </select>
        ${schema.description ? html`<span class="description">${schema.description}</span>` : ''}
        ${error ? html`<span class="error">${error}</span>` : ''}
      </div>`;
  }

  if (schema.type === 'boolean') {
    return html`
      <div class="field">
        <label>
          <input type="checkbox" ?checked=${Boolean(value)} @change=${(e: Event) => onChange(key, (e.target as HTMLInputElement).checked)} @blur=${() => onBlur?.(key)} />
          ${schema.title ?? key}
        </label>
        ${schema.description ? html`<span class="description">${schema.description}</span>` : ''}
        ${error ? html`<span class="error">${error}</span>` : ''}
      </div>`;
  }

  if (schema.type === 'number' || schema.type === 'integer') {
    return html`
      <div class="field">
        <label for="${key}">${schema.title ?? key}</label>
        <input id="${key}" type="number" placeholder=${schema.placeholder ?? ''} .value=${String(value ?? '')} @input=${(e: Event) => onChange(key, Number((e.target as HTMLInputElement).value))} @blur=${() => onBlur?.(key)} />
        ${schema.description ? html`<span class="description">${schema.description}</span>` : ''}
        ${error ? html`<span class="error">${error}</span>` : ''}
      </div>`;
  }

  if (schema.format === 'date') {
    return html`
      <div class="field">
        <label for="${key}">${schema.title ?? key}</label>
        <input id="${key}" type="date" .value=${toDateInputValue(value)} @input=${(e: Event) => onChange(key, (e.target as HTMLInputElement).value)} @blur=${() => onBlur?.(key)} />
        ${schema.description ? html`<span class="description">${schema.description}</span>` : ''}
        ${error ? html`<span class="error">${error}</span>` : ''}
      </div>`;
  }

  if (schema.format === 'date-time') {
    return html`
      <div class="field">
        <label for="${key}">${schema.title ?? key}</label>
        <input id="${key}" type="datetime-local" .value=${toDateTimeInputValue(value)} @input=${(e: Event) => onChange(key, (e.target as HTMLInputElement).value)} @blur=${() => onBlur?.(key)} />
        ${schema.description ? html`<span class="description">${schema.description}</span>` : ''}
        ${error ? html`<span class="error">${error}</span>` : ''}
      </div>`;
  }

  if (schema.format === 'time') {
    return html`
      <div class="field">
        <label for="${key}">${schema.title ?? key}</label>
        <input id="${key}" type="time" .value=${String(value ?? '')} ?readonly=${schema.readOnly} @input=${(e: Event) => onChange(key, (e.target as HTMLInputElement).value)} @blur=${() => onBlur?.(key)} />
        ${schema.description ? html`<span class="description">${schema.description}</span>` : ''}
        ${error ? html`<span class="error">${error}</span>` : ''}
      </div>`;
  }

  if (schema.type === 'object' && schema.properties) {
    const obj = (value ?? {}) as Record<string, unknown>;
    const nestedChange = (nestedKey: string, nestedValue: unknown) => {
      onChange(key, { ...obj, [nestedKey]: nestedValue });
    };
    return html`
      <div class="field nested">
        <span class="label">${schema.title ?? key}</span>
        ${error ? html`<span class="error">${error}</span>` : ''}
        <div class="nested-content">
          ${Object.entries(schema.properties).map(([k, s]) =>
            renderEditField(k, s, obj[k], nestedChange)
          )}
        </div>
      </div>`;
  }

  if (schema.type === 'array' && schema.items) {
    const arr = Array.isArray(value) ? [...value] as unknown[] : [];
    return renderArrayEditor(key, schema.title ?? key, schema.items, arr, onChange);
  }

  if (schema.type === 'string' && (schema.maxLength ?? 0) > 200) {
    return html`
      <div class="field">
        <label for="${key}">${schema.title ?? key}</label>
        <textarea id="${key}" placeholder=${schema.placeholder ?? ''} .value=${String(value ?? '')} @input=${(e: Event) => onChange(key, (e.target as HTMLTextAreaElement).value)} @blur=${() => onBlur?.(key)}></textarea>
        ${schema.description ? html`<span class="description">${schema.description}</span>` : ''}
        ${error ? html`<span class="error">${error}</span>` : ''}
      </div>`;
  }

  return html`
    <div class="field">
      <label for="${key}">${schema.title ?? key}</label>
      <input id="${key}" type="text" placeholder=${schema.placeholder ?? ''} .value=${String(value ?? '')} ?readonly=${schema.readOnly} @input=${(e: Event) => onChange(key, (e.target as HTMLInputElement).value)} @blur=${() => onBlur?.(key)} />
      ${schema.description ? html`<span class="description">${schema.description}</span>` : ''}
      ${error ? html`<span class="error">${error}</span>` : ''}
    </div>`;
}

function renderArrayEditor(
  key: string,
  label: string,
  itemSchema: FieldSchema,
  items: unknown[],
  onChange: (key: string, value: unknown) => void,
): TemplateResult {
  const updateItem = (index: number, val: unknown) => {
    const updated = [...items];
    updated[index] = val;
    onChange(key, updated);
  };
  const removeItem = (index: number) => {
    onChange(key, items.filter((_, i) => i !== index));
  };
  const addItem = () => {
    onChange(key, [...items, defaultForType(itemSchema)]);
  };

  if (itemSchema.type === 'object' && itemSchema.properties) {
    return html`
      <div class="field nested">
        <span class="label">${label}</span>
        <div class="nested-content">
          ${items.map((item, i) => {
            const obj = (item ?? {}) as Record<string, unknown>;
            const nestedChange = (nestedKey: string, nestedValue: unknown) => {
              updateItem(i, { ...obj, [nestedKey]: nestedValue });
            };
            return html`
              <div class="array-item">
                <div class="array-item-header">
                  <span class="array-index">${i + 1}.</span>
                  <button type="button" class="array-remove" @click=${() => removeItem(i)}>✕</button>
                </div>
                ${Object.entries(itemSchema.properties!).map(([k, s]) =>
                  renderEditField(k, s, obj[k], nestedChange)
                )}
              </div>`;
          })}
          <button type="button" class="array-add" @click=${addItem}>+ Add ${label}</button>
        </div>
      </div>`;
  }

  return html`
    <div class="field nested">
      <span class="label">${label}</span>
      <div class="nested-content">
        ${items.map((item, i) => html`
          <div class="array-item-inline">
            <input type="text" .value=${String(item ?? '')} @input=${(e: Event) => updateItem(i, (e.target as HTMLInputElement).value)} />
            <button type="button" class="array-remove" @click=${() => removeItem(i)}>✕</button>
          </div>
        `)}
        <button type="button" class="array-add" @click=${addItem}>+ Add ${label}</button>
      </div>
    </div>`;
}
