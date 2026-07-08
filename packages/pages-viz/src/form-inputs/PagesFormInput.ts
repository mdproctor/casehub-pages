import { PagesElement } from "../base/PagesElement.js";
import type { FormInputCommon } from "@casehubio/pages-component";
import type { TypedDataSet, ColumnId } from "@casehubio/pages-data/dist/dataset/types.js";
import type { DataSetLookup } from "@casehubio/pages-data/dist/dataset/lookup.js";
import type { ActionRequest, ActionCallbacks, SubmitConfig } from "@casehubio/pages-component/dist/model/action-types.js";

export interface PagesFieldChangeDetail {
  readonly field: string;
  readonly value: unknown;
  readonly committed: boolean;
}

export interface PagesActionRequestDetail {
  readonly config: ActionRequest & { readonly callbacks: ActionCallbacks };
  readonly resolve: (result: { readonly success: boolean; readonly error?: string }) => void;
}

/**
 * Abstract base for form input Web Components.
 *
 * Extends PagesElement with:
 * - `editable` property (set by runtime during activation)
 * - `extractFieldValue(dataset)` helper (reads field from first row)
 * - `emitFieldChange(value, committed)` (dispatches pages-field-change event)
 * - `submit` prop support: Enter key dispatches pages-action-request
 *
 * Form inputs do NOT have lookup in their props — the runtime injects it
 * separately during activation. We handle this by making props extend
 * FormInputCommon & { lookup?: DataSetLookup } so the base class's
 * requestDataIfNeeded() can access the lookup when it exists.
 */
export abstract class PagesFormInput<
  P extends FormInputCommon,
> extends PagesElement<P & { lookup?: DataSetLookup }> {
  protected _editable = false;
  protected inputElement: HTMLInputElement | HTMLTextAreaElement | null = null;
  private _observer: MutationObserver | null = null;

  set editable(value: boolean) {
    this._editable = value;
  }

  get editable(): boolean {
    return this._editable;
  }

  override connectedCallback(): void {
    super.connectedCallback();
    this.startObservingForInput();
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.cleanupSubmitListener();
    this.stopObservingForInput();
  }

  /**
   * Start observing for input element in shadow root.
   * When found and submit config exists, set up keydown listener.
   */
  private startObservingForInput(): void {
    this._observer = new MutationObserver(() => {
      this.setupSubmitListener();
    });

    this._observer.observe(this.shadowRoot, {
      childList: true,
      subtree: true,
    });

    // Try setup immediately in case input already exists
    this.setupSubmitListener();
  }

  /**
   * Stop observing for input element.
   */
  private stopObservingForInput(): void {
    if (this._observer) {
      this._observer.disconnect();
      this._observer = null;
    }
  }

  /**
   * Set up keydown listener for submit on Enter.
   * Called when input element is detected in shadow DOM.
   */
  protected setupSubmitListener(): void {
    // If already set up on the same element, skip
    if (this.inputElement && this.shadowRoot.contains(this.inputElement)) {
      return;
    }

    // Clean up any previous listener
    this.cleanupSubmitListener();

    const props = this.props;
    if (!props || !("submit" in props) || !props.submit) return;

    // Find the input element in the shadow root
    const input = this.shadowRoot.querySelector<HTMLInputElement | HTMLTextAreaElement>("input, textarea");
    if (!input) return;

    this.inputElement = input;
    this.inputElement.addEventListener("keydown", this.handleKeydown);
  }

  /**
   * Clean up submit listener.
   */
  protected cleanupSubmitListener(): void {
    if (this.inputElement) {
      this.inputElement.removeEventListener("keydown", this.handleKeydown);
      this.inputElement = null;
    }
  }

  /**
   * Handle keydown event for Enter key submit.
   */
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
        // On error, value is preserved (no action needed)
      },
    };

    this.dispatchEvent(
      new CustomEvent<PagesActionRequestDetail>("pages-action-request", {
        bubbles: true,
        composed: true,
        detail,
      }),
    );
  };

  /**
   * Extract the field value from the dataset's first row.
   * Returns undefined if field is missing or dataset is empty.
   */
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

  /**
   * Emit a pages-field-change event (only if editable).
   *
   * @param value - The new field value
   * @param committed - false = in-progress editing (input event), true = finalized (blur/change event)
   */
  /**
   * Type-safe access to props cast to the concrete form input type.
   * Useful in subclass render methods that receive the props parameter.
   */
  protected asFormProps(props: P & { lookup?: DataSetLookup }): P {
    return props;
  }

  protected emitFieldChange(value: unknown, committed: boolean): void {
    if (!this._editable) return;
    const field = this.props?.field;
    if (!field) return;
    this.dispatchEvent(
      new CustomEvent<PagesFieldChangeDetail>("pages-field-change", {
        bubbles: true,
        composed: true,
        detail: { field, value, committed },
      }),
    );
  }
}
