import { page, timeseries, dataset } from "@casehubio/ui";
import { createLookup } from "@casehubio/data";
import type { DataSetId } from "@casehubio/data";

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
