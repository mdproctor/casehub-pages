import type { FieldSchema } from './types.js';

export function validateField(
  _key: string,
  schema: FieldSchema,
  value: unknown,
  required: boolean,
): string | null {
  if (schema.readOnly) return null;

  if (required && (value === null || value === undefined || value === '')) {
    return 'Required';
  }

  if (value === null || value === undefined || value === '') return null;

  if (schema.oneOf && typeof value === 'string') {
    if (!schema.oneOf.some(o => o.const === value)) {
      return 'Invalid selection';
    }
  }

  if (typeof value === 'string') {
    if (schema.pattern != null) {
      const re = new RegExp(schema.pattern);
      if (!re.test(value)) return 'Invalid format';
    }
    if (schema.minLength != null && value.length < schema.minLength) {
      return `Must be at least ${schema.minLength} characters`;
    }
    if (schema.maxLength != null && value.length > schema.maxLength) {
      return `Must be at most ${schema.maxLength} characters`;
    }
  }

  if (typeof value === 'number') {
    if (schema.minimum != null && value < schema.minimum) {
      return `Must be at least ${schema.minimum}`;
    }
    if (schema.maximum != null && value > schema.maximum) {
      return `Must be at most ${schema.maximum}`;
    }
  }

  if (schema.type === 'object' && schema.properties && typeof value === 'object' && value !== null) {
    const obj = value as Record<string, unknown>;
    const requiredSet = new Set(schema.required ?? []);
    for (const [k, subSchema] of Object.entries(schema.properties)) {
      const error = validateField(k, subSchema, obj[k], requiredSet.has(k));
      if (error) return `${k}: ${error}`;
    }
  }

  if (schema.type === 'array' && schema.items && Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      const item = value[i];
      if (schema.items.type === 'object' && schema.items.properties && typeof item === 'object' && item !== null) {
        const obj = item as Record<string, unknown>;
        const requiredSet = new Set(schema.items.required ?? []);
        for (const [k, subSchema] of Object.entries(schema.items.properties)) {
          const error = validateField(k, subSchema, obj[k], requiredSet.has(k));
          if (error) return `Item ${i + 1}: ${k}: ${error}`;
        }
      }
    }
  }

  return null;
}
