import { CasehubElement } from "../base/CasehubElement.js";
import type { FormInputCommon } from "@casehub/pages-ui";
import type { TypedDataSet, ColumnId } from "@casehub/pages-data/dist/dataset/types.js";
import type { DataSetLookup } from "@casehub/pages-data/dist/dataset/lookup.js";

export interface CasehubFieldChangeDetail {
  readonly field: string;
  readonly value: unknown;
  readonly committed: boolean;
}

/**
 * Abstract base for form input Web Components.
 *
 * Extends CasehubElement with:
 * - `editable` property (set by runtime during activation)
 * - `extractFieldValue(dataset)` helper (reads field from first row)
 * - `emitFieldChange(value, committed)` (dispatches casehub-field-change event)
 *
 * Form inputs do NOT have lookup in their props — the runtime injects it
 * separately during activation. We handle this by making props extend
 * FormInputCommon & { lookup?: DataSetLookup } so the base class's
 * requestDataIfNeeded() can access the lookup when it exists.
 */
export abstract class CasehubFormInput<
  P extends FormInputCommon,
> extends CasehubElement<P & { lookup?: DataSetLookup }> {
  protected _editable = false;

  set editable(value: boolean) {
    this._editable = value;
  }

  get editable(): boolean {
    return this._editable;
  }

  /**
   * Extract the field value from the dataset's first row.
   * Returns undefined if field is missing or dataset is empty.
   */
  protected extractFieldValue(dataset: TypedDataSet): unknown {
    const field = this.props?.field;
    if (!field || !dataset.rows.length) return undefined;
    const row = dataset.rows[0]!;
    try {
      const cell = row.cell(field as ColumnId);
      if (cell.type === "NULL") return undefined;
      return cell.value;
    } catch {
      return undefined;
    }
  }

  /**
   * Emit a casehub-field-change event (only if editable).
   *
   * @param value - The new field value
   * @param committed - false = in-progress editing (input event), true = finalized (blur/change event)
   */
  protected emitFieldChange(value: unknown, committed: boolean): void {
    if (!this._editable) return;
    const field = this.props?.field;
    if (!field) return;
    this.dispatchEvent(
      new CustomEvent<CasehubFieldChangeDetail>("casehub-field-change", {
        bubbles: true,
        composed: true,
        detail: { field, value, committed },
      }),
    );
  }
}
