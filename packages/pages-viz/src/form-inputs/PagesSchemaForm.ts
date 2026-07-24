import { html, css, type TemplateResult } from "lit";
import { PagesElement } from "../base/PagesElement.js";
import type { TypedDataSet, ColumnId } from "@casehubio/pages-data";
import type { DataSetLookup } from "@casehubio/pages-data";
import type { PagesFormInput } from "./PagesFormInput.js";
import type { SchemaFormProps, FieldSchema } from "./schema-types.js";
import {
  deriveSchemaFromDataSet,
  mapFieldToComponentType,
  validateField,
} from "./schema-types.js";
import { cellToRaw } from "../base/cell-extract.js";

import "./PagesNumberInput.js";
import "./PagesDatePicker.js";
import "@casehubio/pages-ui-components/input";
import "@casehubio/pages-ui-components/select";
import "@casehubio/pages-ui-components/checkbox";
import "@casehubio/pages-ui-components/textarea";

const STANDALONE_TYPES = new Set(["input", "select", "checkbox", "textarea"]);

export class PagesSchemaForm extends PagesElement<SchemaFormProps & { lookup?: DataSetLookup }> {
  private _children: Map<string, HTMLElement> = new Map();
  private _childTypes: Map<string, string> = new Map();
  private _resolvedSchema: FieldSchema | null = null;
  private _editable = false;
  private _liveRegion: HTMLElement | null = null;

  static override styles = css`
      :host { display: block; font-family: var(--pages-font-family, system-ui, sans-serif); }
      .schema-form-fields { display: flex; flex-direction: column; gap: var(--pages-space-2, 8px); }
      .submit-bar { margin-top: var(--pages-space-3, 12px); }
      .submit-btn {
        padding: 8px 16px; border: 1px solid var(--pages-accent-9, #5470c6);
        border-radius: var(--pages-radius-sm, 4px); background: var(--pages-accent-9, #5470c6);
        color: white; cursor: pointer; font-size: var(--pages-font-size-base, 14px);
      }
      .submit-btn:hover { opacity: 0.9; }
  `;

  set editable(value: boolean) {
    this._editable = value;
  }

  get editable(): boolean {
    return this._editable;
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this._liveRegion?.remove();
    this._liveRegion = null;
  }

  private announce(message: string, priority: "polite" | "assertive" = "polite"): void {
    if (!this._liveRegion) {
      this._liveRegion = document.createElement("div");
      this._liveRegion.setAttribute("aria-live", priority);
      this._liveRegion.setAttribute("aria-atomic", "true");
      this._liveRegion.setAttribute("role", "status");
      Object.assign(this._liveRegion.style, {
        position: "absolute", width: "1px", height: "1px",
        overflow: "hidden", clip: "rect(0,0,0,0)", whiteSpace: "nowrap",
      });
      document.body.appendChild(this._liveRegion);
    }
    this._liveRegion.setAttribute("aria-live", priority);
    this._liveRegion.textContent = "";
    void this._liveRegion.offsetHeight;
    this._liveRegion.textContent = message;
  }

  get currentValue(): Record<string, unknown> {
    const record: Record<string, unknown> = {};
    for (const [field, child] of this._children) {
      const ct = this._childTypes.get(field) ?? "input";
      record[field] = this.getChildValue(child, ct);
    }
    return record;
  }

  private getChildValue(child: HTMLElement, componentType: string): unknown {
    if (STANDALONE_TYPES.has(componentType)) {
      return componentType === "checkbox" ? (child as any).checked : (child as any).value;
    }
    return (child as unknown as PagesFormInput<any>).currentValue;
  }

  private setChildError(child: HTMLElement, componentType: string, error: string | undefined): void {
    if (STANDALONE_TYPES.has(componentType)) {
      (child as any).error = error;
    } else {
      (child as unknown as PagesFormInput<any>).errorMessage = error;
    }
  }

  protected override renderContent(
    props: SchemaFormProps & { lookup?: DataSetLookup },
    dataset: TypedDataSet,
  ): TemplateResult {
    const schema = props.schema ?? deriveSchemaFromDataSet(dataset);
    this._resolvedSchema = schema;
    const schemaProps = schema.properties ?? {};
    const requiredSet = new Set(schema.required ?? []);

    const excludeSet = new Set(props.excludeFields ?? []);
    const fieldOrder = props.fieldOrder ?? Object.keys(schemaProps);
    const fields = fieldOrder.filter((f) => !excludeSet.has(f) && f in schemaProps);

    const isCreateMode = props.forceCreate === true || dataset.rows.length === 0;
    const isDisplay = props.mode === "display" || !this._editable;

    const staleKeys = new Set(this._children.keys());

    for (const field of fields) {
      staleKeys.delete(field);
      const fieldSchema = schemaProps[field]!;
      const componentType = mapFieldToComponentType(fieldSchema);
      const tagName = `pages-${componentType}`;

      const label = props.labels?.[field]
        ?? fieldSchema.title
        ?? field.replace(/([A-Z])/g, " $1").replace(/^./, (s) => s.toUpperCase());

      let child = this._children.get(field);
      if (!child || child.tagName.toLowerCase() !== tagName) {
        child = document.createElement(tagName);
        this._children.set(field, child);
      }
      this._childTypes.set(field, componentType);

      const isStandalone = STANDALONE_TYPES.has(componentType);
      if (isStandalone) {
        (child as any).label = label;
        (child as any).disabled = isDisplay || !this._editable;
        (child as any).required = requiredSet.has(field);
        if (dataset.rows.length > 0) {
          const row = dataset.rows[0]!;
          try {
            const cell = row.cell(field as ColumnId);
            if (cell.type !== "NULL") {
              if (componentType === "checkbox") {
                const v = typeof cell.value === "boolean" ? cell.value : String(cell.value).toLowerCase() === "true";
                (child as any).checked = v;
              } else {
                (child as any).value = String(cell.value);
              }
            }
          } catch { /* column not found */ }
        }
        if (componentType === "select") {
          const childProps = this.buildChildProps(field, fieldSchema, componentType, label, dataset);
          const opts = childProps.options as { values?: string[] } | undefined;
          if (opts?.values) {
            (child as any).options = opts.values.map((v: string) => ({ value: v, label: v }));
          }
        }
        if (componentType === "input") {
          if (fieldSchema.maxLength !== undefined) (child as any).maxlength = fieldSchema.maxLength;
          if (fieldSchema.placeholder !== undefined) (child as any).placeholder = fieldSchema.placeholder;
        }
        if (componentType === "textarea") {
          if (fieldSchema.maxLength !== undefined) (child as any).maxlength = fieldSchema.maxLength;
        }
      } else {
        const formInput = child as unknown as PagesFormInput<any>;
        const childProps = this.buildChildProps(field, fieldSchema, componentType, label, dataset);
        formInput.props = childProps;
        formInput.dataSet = dataset;
        formInput.editable = !isDisplay && this._editable;
        formInput.required = requiredSet.has(field);
      }
    }

    for (const key of staleKeys) {
      this._children.get(key)?.remove();
      this._children.delete(key);
    }

    return html`
      <div class="schema-form-fields" role="${isDisplay ? "group" : "form"}">
        ${fields.map((field) => this._children.get(field)!)}
        ${isCreateMode && !isDisplay ? html`
          <div class="submit-bar">
            <button class="submit-btn" @click=${() => this.submit()}>Submit</button>
          </div>
        ` : ""}
      </div>
    `;
  }

  private buildChildProps(
    field: string,
    fieldSchema: FieldSchema,
    componentType: string,
    label: string,
    dataset: TypedDataSet,
  ): Record<string, unknown> {
    const base: Record<string, unknown> = { field, label };

    if (componentType === "number-input") {
      if (fieldSchema.minimum !== undefined) base.min = fieldSchema.minimum;
      if (fieldSchema.maximum !== undefined) base.max = fieldSchema.maximum;
      if (fieldSchema.type === "integer") base.step = 1;
    }

    if (componentType === "select") {
      if (fieldSchema.enum && fieldSchema.enum.length > 0) {
        base.options = { values: [...fieldSchema.enum] };
      } else {
        const distinctValues = this.extractDistinctValues(field, dataset);
        base.options = { values: distinctValues };
      }
    }

    if (componentType === "input") {
      if (fieldSchema.maxLength !== undefined) base.maxLength = fieldSchema.maxLength;
      if (fieldSchema.placeholder !== undefined) base.placeholder = fieldSchema.placeholder;
    }

    if (componentType === "textarea") {
      if (fieldSchema.maxLength !== undefined) base.maxLength = fieldSchema.maxLength;
    }

    return base;
  }

  private extractDistinctValues(field: string, dataset: TypedDataSet): string[] {
    const seen = new Set<string>();
    for (const row of dataset.rows) {
      try {
        const cell = row.cell(field as ColumnId);
        const raw = cellToRaw(cell);
        if (raw !== null) seen.add(String(raw));
      } catch {
        // Column not found
      }
    }
    return [...seen].sort();
  }

  submit(): Record<string, unknown> | null {
    if (!this._resolvedSchema?.properties) return null;

    const requiredSet = new Set(this._resolvedSchema.required ?? []);
    const errors: Record<string, string> = {};
    const record: Record<string, unknown> = {};

    for (const [field, child] of this._children) {
      const fieldSchema = this._resolvedSchema.properties[field];
      if (!fieldSchema) continue;

      const ct = this._childTypes.get(field) ?? "input";
      const value = this.getChildValue(child, ct);
      record[field] = value;

      const error = validateField(fieldSchema, value, requiredSet.has(field));
      if (error) {
        errors[field] = error;
        this.setChildError(child, ct, error);
      } else {
        this.setChildError(child, ct, undefined);
      }
    }

    if (Object.keys(errors).length > 0) {
      const count = Object.keys(errors).length;
      this.announce(
        `${String(count)} validation error${count > 1 ? "s" : ""} — please correct before submitting`,
        "assertive",
      );
      return null;
    }

    this.dispatchEvent(
      new CustomEvent("pages-record-create", {
        bubbles: true, composed: true,
        detail: { record },
      }),
    );

    this.announce("Record submitted successfully");
    return record;
  }
}

if (!customElements.get("pages-schema-form")) {
  customElements.define("pages-schema-form", PagesSchemaForm);
}
