import { page, timeseries, columns, table, dataset } from "@casehubio/ui";
import { createLookup } from "@casehubio/data";
import type { DataSetId, ColumnId } from "@casehubio/data";

// TypeScript companion to "Real Time JVM Monitoring.dash.yaml"
// Real-time accumulating JVM metrics with timeseries charts

// Note: The YAML uses `accumulate: true` on the metrics dataset, which buffers incoming
// data over time. The expression transforms incoming metrics and adds a timestamp.

export default page(
  {
    metricsUrl: "data/quarkus/metrics",
    historyUrl: "data/quarkus/history.json",
  },
  {
    displayer: {
      chart: { resizable: true },
      lookup: { uuid: "metrics" as DataSetId },
    },
  },
  [
    dataset("history" as DataSetId, "${historyUrl}", {}),
    dataset("metrics" as DataSetId, "${metricsUrl}", {
      accumulate: true,
      cacheMaxRows: 30000,
      refreshTime: "2second",
      expression: `$map($, function($v){ [$v[0], $v[1], $v[2] = 'NaN' ? -1 : $v[2], $now() ~> $toMillis()] })`,
      columns: [
        { id: "metric" as ColumnId, type: "label" },
        { id: "labels" as ColumnId, type: "label" },
        { id: "value" as ColumnId, type: "number" },
        { id: "register" as ColumnId, type: "number" },
      ]
    }),
  ],
  [
    // Row 1: Table showing accumulated metrics
    columns({ "margin-left": "10px" }, ["6"],
      [
        table({
          lookup: createLookup("metrics" as DataSetId, [
            {
              type: "group",
              groupingKey: { sourceId: "register" as ColumnId },
              functions: [
                { source: "metric" as ColumnId },
                { source: "register" as ColumnId },
                { source: "value" as ColumnId, function: "SUM" }
              ]
            }
          ]),
        })
      ]
    ),

    // Row 2: Heap Memory and Live Threads
    columns({}, ["6", "6"],
      [
        timeseries({
          lookup: createLookup("history" as DataSetId, [
            { type: "filter", column: "metric" as ColumnId, function: "EQUALS_TO", args: ["jvm_memory_used_bytes"] },
            { type: "filter", column: "labels" as ColumnId, function: "LIKE_TO", args: ['%heap%'] },
            {
              type: "group",
              functions: [
                { source: "labels" as ColumnId },
                { source: "timestamp" as ColumnId },
                { source: "value" as ColumnId }
              ]
            }
          ]),
          general: { title: "Heap Memory Usage" },
          chart: { height: 300 },
        })
      ],
      [
        timeseries({
          lookup: createLookup("history" as DataSetId, [
            { type: "filter", column: "metric" as ColumnId, function: "EQUALS_TO", args: ["jvm_threads_live_threads"] },
            {
              type: "group",
              functions: [
                { source: "metric" as ColumnId },
                { source: "timestamp" as ColumnId },
                { source: "value" as ColumnId }
              ]
            }
          ]),
          general: { title: "Live Threads" },
          chart: { height: 300 },
        })
      ]
    ),

    // Row 3: Loaded Classes and CPU Usage
    columns({ "margin-top": "20px" }, ["6", "6"],
      [
        timeseries({
          lookup: createLookup("history" as DataSetId, [
            { type: "filter", column: "metric" as ColumnId, function: "EQUALS_TO", args: ["jvm_classes_loaded_classes"] },
            {
              type: "group",
              functions: [
                { source: "metric" as ColumnId },
                { source: "timestamp" as ColumnId },
                { source: "value" as ColumnId }
              ]
            }
          ]),
          general: { title: "Loaded Classes" },
          chart: { height: 300 },
        })
      ],
      [
        timeseries({
          lookup: createLookup("history" as DataSetId, [
            { type: "filter", column: "metric" as ColumnId, function: "EQUALS_TO", args: ["system_cpu_usage"] },
            {
              type: "group",
              functions: [
                { source: "metric" as ColumnId },
                { source: "timestamp" as ColumnId },
                { source: "value" as ColumnId }
              ]
            }
          ]),
          general: { title: "CPU Usage" },
          chart: { height: 300 },
        })
      ]
    )
  ]
);
