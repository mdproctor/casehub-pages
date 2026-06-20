import type { DataSetLookup } from "@casehub/pages-data/dist/dataset/lookup.js";
import type { ColumnSettings } from "@casehub/pages-data/dist/dataset/types.js";
import type {
  FilterSettings,
  RefreshSettings,
} from "@casehub/pages-ui/dist/model/component-props.js";

export interface VizComponentProps {
  readonly lookup?: DataSetLookup;
  readonly filter?: FilterSettings;
  readonly refresh?: RefreshSettings;
  readonly columns?: readonly ColumnSettings[];
}
