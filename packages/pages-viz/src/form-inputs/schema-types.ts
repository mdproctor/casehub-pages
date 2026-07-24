import type { TypedDataSet, Column } from "@casehubio/pages-data";
import { ColumnType } from "@casehubio/pages-data";

export interface FieldSchema {
  readonly type?: string;
  readonly format?: string;
  readonly title?: string;
  readonly description?: string;
  readonly placeholder?: string;
  readonly enum?: readonly string[];
  readonly pattern?: string;
  readonly minimum?: number;
  readonly maximum?: number;
  readonly minLength?: number;
  readonly maxLength?: number;
  readonly properties?: Readonly<Record<string, FieldSchema>>;
  readonly required?: readonly string[];
}

export interface SchemaFormProps {
  schema?: FieldSchema;
  mode?: "display" | "edit";
  forceCreate?: boolean;
  validateOnBlur?: boolean;
  excludeFields?: string[];
  fieldOrder?: string[];
  labels?: Record<string, string>;
}

export function deriveSchemaFromDataSet(dataset: TypedDataSet): FieldSchema {
  const properties: Record<string, FieldSchema> = {};
  for (const col of dataset.columns) {
    properties[col.id] = columnToFieldSchema(col, dataset);
  }
  return { properties };
}

function columnToFieldSchema(col: Column, dataset: TypedDataSet): FieldSchema {
  switch (col.type) {
    case ColumnType.NUMBER:
      return { type: "number" };
    case ColumnType.DATE:
      return { type: "string", format: "date" };
    case ColumnType.LABEL: {
      const seen = new Set<string>();
      for (const row of dataset.rows) {
        try {
          const cell = row.cell(col.id);
          if (cell.type !== "NULL") seen.add(String(cell.value));
        } catch { /* skip */ }
      }
      const values = [...seen].sort();
      return values.length > 0
        ? { type: "string", enum: values }
        : { type: "string" };
    }
    case ColumnType.TEXT:
    default:
      return { type: "string" };
  }
}

export function mapFieldToComponentType(fieldSchema: FieldSchema): string {
  if (fieldSchema.type === "boolean") return "checkbox";
  if (fieldSchema.type === "number") return "number-input";
  if (fieldSchema.type === "integer") return "number-input";
  if (fieldSchema.type === "string") {
    if (fieldSchema.enum && fieldSchema.enum.length > 0) return "select";
    if (fieldSchema.format === "date") return "date-picker";
    if (fieldSchema.format === "datetime-local") return "date-picker";
    if (fieldSchema.format === "textarea") return "textarea";
    return "input";
  }
  if (fieldSchema.enum && fieldSchema.enum.length > 0) return "select";
  return "input";
}

export function validateField(
  schema: FieldSchema,
  value: unknown,
  required: boolean,
): string | null {
  if (required && (value === null || value === undefined || value === "")) {
    return "Required";
  }
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "string") {
    if (schema.pattern != null) {
      const re = new RegExp(schema.pattern);
      if (!re.test(value)) return "Invalid format";
    }
    if (schema.minLength != null && value.length < schema.minLength) {
      return `Must be at least ${schema.minLength} characters`;
    }
    if (schema.maxLength != null && value.length > schema.maxLength) {
      return `Must be at most ${schema.maxLength} characters`;
    }
  }
  if (typeof value === "number") {
    if (schema.minimum != null && value < schema.minimum) {
      return `Must be at least ${schema.minimum}`;
    }
    if (schema.maximum != null && value > schema.maximum) {
      return `Must be at most ${schema.maximum}`;
    }
  }
  return null;
}
