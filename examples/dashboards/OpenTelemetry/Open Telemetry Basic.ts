import { page, table, selector, bubbleChart, dataset } from "@casehub/ui";
import { createLookup } from "@casehub/data";
import type { DataSetId, ColumnId } from "@casehub/data";

// TypeScript companion to "Open Telemetry Basic.yaml"
// OpenTelemetry traces visualization

// Note: The YAML has some malformed syntax (`.displayer:` and `.columns:` with leading dots).
// This translation corrects those to valid DSL calls.

export default page(
  {},
  {},
  [
    dataset("traces" as DataSetId, "traces.json", {
      expression: `$.data.spans.[$.traceID, $.spanID, $.operationName, $.startTime / 1000, $.duration]`,
      columns: [
        { id: "Trace ID" as ColumnId },
        { id: "Span ID" as ColumnId },
        { id: "Operation" as ColumnId },
        { id: "Start Time" as ColumnId },
        { id: "Duration" as ColumnId, type: "NUMBER" },
      ]
    }),
  ],
  [
    // Note: Original YAML has `.displayer:` which is likely a typo
    table({
      lookup: createLookup("traces" as DataSetId, []),
    }),

    selector({
      lookup: createLookup("traces" as DataSetId, [
        {
          type: "group",
          groupingKey: { sourceId: "Column 2" as ColumnId },
          functions: [{ source: "Column 2" as ColumnId }]
        }
      ]),
      filter: { notification: true },
    }),

    bubbleChart({
      lookup: createLookup("traces" as DataSetId, [
        {
          type: "group",
          functions: [
            { source: "Column 3" as ColumnId },
            { source: "Column 4" as ColumnId },
            { source: "Column 4" as ColumnId },
            { source: "Column 2" as ColumnId }
          ]
        }
      ]),
      filter: { listening: true },
      axis: { x: { labels_show: false } },
      chart: { resizable: true, height: 700, zoom: true },
    })
  ]
);
