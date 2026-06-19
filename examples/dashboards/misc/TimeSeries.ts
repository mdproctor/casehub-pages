import { page, timeseries, dataset } from "@casehub/ui";
import { createLookup } from "@casehub/data";
import type { DataSetId } from "@casehub/data";

// TypeScript companion to "TimeSeries.dash.yaml"
// Simple timeseries example

export default page(
  {},
  {},
  [
    dataset("timeseries" as DataSetId, "data/sample_timeseries.json", {}),
  ],
  [
    timeseries({
      lookup: createLookup("timeseries" as DataSetId, []),
      chart: { resizable: true },
    })
  ]
);
