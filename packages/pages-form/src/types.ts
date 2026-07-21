export interface FieldSchema {
  readonly type?: string;
  readonly format?: string;
  readonly title?: string;
  readonly description?: string;
  readonly placeholder?: string;
  readonly enum?: readonly string[];
  readonly oneOf?: readonly { readonly const: string; readonly title: string }[];
  readonly readOnly?: boolean;
  readonly pattern?: string;
  readonly minimum?: number;
  readonly maximum?: number;
  readonly minLength?: number;
  readonly maxLength?: number;
  readonly properties?: Readonly<Record<string, FieldSchema>>;
  readonly items?: FieldSchema;
  readonly required?: readonly string[];
}

export interface ValidationError {
  readonly field: string;
  readonly message: string;
}

export interface FieldRendererElement extends HTMLElement {
  value: unknown;
  schema: FieldSchema;
  mode: 'display' | 'edit';
}
