import { page, metric, barChart, table, title, dataset } from "@casehub/ui";
import { createLookup } from "@casehub/data";
import type { DataSetId, ColumnId } from "@casehub/data";

// TypeScript companion to "JVM Monitoring.yml"
// Monitoring JVM metrics with Micrometer format

export default page(
  {
    refreshInterval: 5,
    metricsUrl: "data/quarkus/metrics",
  },
  {
    displayer: {
      chart: { resizable: true, height: 300, margin: { left: 90 } },
      refresh: { interval: 5 }, // use -1 to cancel auto refresh
      lookup: { uuid: "pop" as DataSetId },
    },
  },
  [
    dataset("pop" as DataSetId, "${metricsUrl}", {
      columns: [
        { id: "Metric" as ColumnId, type: "LABEL" },
        { id: "Labels" as ColumnId, type: "LABEL" },
        { id: "Value" as ColumnId, type: "NUMBER" },
      ]
    }),
  ],
  [
    metric({
      lookup: createLookup("pop" as DataSetId, [
        {
          type: "filter",
          column: "Metric" as ColumnId,
          function: "EQUALS_TO",
          args: ["system_cpu_usage"]
        },
        {
          type: "sort",
          column: "Total" as ColumnId,
          order: "DESCENDING"
        },
        {
          type: "group",
          functions: [{ source: "Value" as ColumnId, function: "MAX", column: "Total" as ColumnId }]
        }
      ]),
      general: { title: "System CPU Usage" },
      chart: { height: 200, margin: { left: 10, bottom: "60" } },
      columns: [{ id: "Total" as ColumnId, expression: "value * 100" }],
    }),

    title("Threads"),

    barChart({
      lookup: createLookup("pop" as DataSetId, [
        {
          type: "filter",
          column: "Metric" as ColumnId,
          function: "EQUALS_TO",
          args: ["jvm_threads_states_threads"]
        },
        {
          type: "sort",
          column: "Total" as ColumnId,
          order: "DESCENDING"
        },
        {
          type: "group",
          groupingKey: { sourceId: "Labels" as ColumnId },
          functions: [
            { source: "Labels" as ColumnId },
            { source: "Value" as ColumnId, function: "MAX", column: "Total" as ColumnId }
          ]
        }
      ]),
      columns: [{ id: "Labels" as ColumnId, expression: `value.replaceAll('state="', '').replaceAll('",', '')` }],
    }),

    title("JVM Memory Used Bytes"),

    barChart({
      lookup: createLookup("pop" as DataSetId, [
        {
          type: "filter",
          column: "Metric" as ColumnId,
          function: "EQUALS_TO",
          args: ["jvm_memory_used_bytes"]
        },
        {
          type: "sort",
          column: "Total" as ColumnId,
          order: "DESCENDING"
        },
        {
          type: "group",
          groupingKey: { sourceId: "Labels" as ColumnId },
          functions: [
            { source: "Labels" as ColumnId },
            { source: "Value" as ColumnId, function: "MAX", column: "Total" as ColumnId }
          ]
        }
      ]),
      axis: { x: { labels_angle: 10 } },
      columns: [
        { id: "Total" as ColumnId, pattern: "#" },
        {
          id: "Labels" as ColumnId,
          expression: `value.replaceAll('id="', ' ').replaceAll('area="heap",', "").replaceAll('area="nonheap",', "").replaceAll('",', "").trim()`
        }
      ],
    }),

    title("All Metrics"),

    table({
      lookup: createLookup("pop" as DataSetId, []),
      chart: { height: 400 },
    })
  ]
);
