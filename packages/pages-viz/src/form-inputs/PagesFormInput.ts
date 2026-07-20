import { type PropertyValues } from "lit";
import { PagesElement } from "../base/PagesElement.js";
import type { FormInputCommon } from "@casehubio/pages-component";
import type { TypedDataSet, ColumnId } from "@casehubio/pages-data";
import type { DataSetLookup } from "@casehubio/pages-data";
import type { ActionRequest, ActionCallbacks, SubmitConfig } from "@casehubio/pages-component";

export interface PagesFieldChangeDetail {
  readonly field: string;
  readonly value: unknown;
  readonly committed: boolean;
}

export interface PagesActionRequestDetail {
  readonly config: ActionRequest & { readonly callbacks: ActionCallbacks };
  readonly resolve: (result: { readonly success: boolean; readonly error?: string }) => void;
}

export abstract class PagesFormInput<
  P extends FormInputCommon,
> extends PagesElement<P & { lookup?: DataSetLookup }> {
  protected _editable = false;
  protected inputElement: HTMLInputElement | HTMLTextAreaElement | null = null;

  set editable(value: boolean) {
    this._editable = value;
  }

  get editable(): boolean {
    return this._editable;
  }

  override updated(changed: PropertyValues): void {
    super.updated(changed);
    this.setupSubmitListener();
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.cleanupSubmitListener();
  }

  protected setupSubmitListener(): void {
    if (this.inputElement && this.shadowRoot!.contains(this.inputElement)) {
      return;
    }
    this.cleanupSubmitListener();

    const props = this.props;
    if (!props || !("submit" in props) || !props.submit) return;

    const input = this.shadowRoot!.querySelector<HTMLInputElement | HTMLTextAreaElement>("input, textarea");
    if (!input) return;

    this.inputElement = input;
    this.inputElement.addEventListener("keydown", this.handleKeydown);
  }

  protected cleanupSubmitListener(): void {
    if (this.inputElement) {
      this.inputElement.removeEventListener("keydown", this.handleKeydown);
      this.inputElement = null;
    }
  }

  private handleKeydown = (e: Event): void => {
    if (!(e instanceof KeyboardEvent)) return;
    if (e.key !== "Enter") return;

    const props = this.props as (P & { lookup?: DataSetLookup; submit?: SubmitConfig });
    if (!props?.submit) return;

    e.preventDefault();

    const submit = props.submit;
    const field = props.field;
    const inputElement = this.inputElement;
    if (!inputElement) return;

    const value = inputElement.value;
    const fieldName = submit.fieldName ?? field;
    const body = { [fieldName]: value };

    const callbacks: ActionCallbacks = {
      ...(submit.onSuccess && { onSuccess: submit.onSuccess }),
      ...(submit.onError && { onError: submit.onError }),
    };

    const config: ActionRequest & { readonly callbacks: ActionCallbacks } = {
      url: submit.url,
      method: submit.method ?? "POST",
      body,
      callbacks,
    };

    const detail: PagesActionRequestDetail = {
      config,
      resolve: (result) => {
        if (result.success && submit.clearOnSubmit) {
          inputElement.value = "";
        }
      },
    };

    this.dispatchEvent(
      new CustomEvent<PagesActionRequestDetail>("pages-action-request", {
        bubbles: true, composed: true, detail,
      }),
    );
  };

  protected extractFieldValue(dataset: TypedDataSet): unknown {
    const field = this.props?.field;
    if (!field || !dataset.rows.length) return undefined;
    const row = dataset.rows[0];
    if (!row) return undefined;
    try {
      const cell = row.cell(field as ColumnId);
      if (cell.type === "NULL") return undefined;
      return cell.value;
    } catch {
      return undefined;
    }
  }

  protected asFormProps(props: P & { lookup?: DataSetLookup }): P {
    return props;
  }

  protected emitFieldChange(value: unknown, committed: boolean): void {
    if (!this._editable) return;
    const field = this.props?.field;
    if (!field) return;
    this.dispatchEvent(
      new CustomEvent<PagesFieldChangeDetail>("pages-field-change", {
        bubbles: true, composed: true,
        detail: { field, value, committed },
      }),
    );
  }
}
