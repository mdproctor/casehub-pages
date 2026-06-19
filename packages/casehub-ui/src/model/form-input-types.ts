import type { DataSetId } from "@casehub/data/dist/dataset/types.js";

export interface FormInputCommon {
  readonly field: string;
  readonly label?: string;
  readonly required?: boolean;
  readonly readonly?: boolean;
}

export interface TextInputProps extends FormInputCommon {
  readonly placeholder?: string;
  readonly maxLength?: number;
}

export interface NumberInputProps extends FormInputCommon {
  readonly min?: number;
  readonly max?: number;
  readonly step?: number;
}

export interface FixedOptions {
  readonly values: readonly string[];
}

export interface DataSetOptions {
  readonly dataset: DataSetId;
  readonly labelColumn: string;
  readonly valueColumn: string;
}

export interface DropdownProps extends FormInputCommon {
  readonly options: FixedOptions | DataSetOptions;
}

export interface CheckboxProps extends FormInputCommon {}

export interface DatePickerProps extends FormInputCommon {
  readonly min?: string;
  readonly max?: string;
}

export interface TextareaProps extends FormInputCommon {
  readonly rows?: number;
  readonly maxLength?: number;
}

export function isFixedOptions(opts: FixedOptions | DataSetOptions): opts is FixedOptions {
  return "values" in opts;
}
