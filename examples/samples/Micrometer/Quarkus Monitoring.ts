import { page, metric, barChart, columns, dataset } from "@casehubio/ui";
import { createLookup } from "@casehubio/data";
import type { DataSetId, ColumnId } from "@casehubio/data";

// TypeScript companion to "Quarkus Monitoring.dash.yaml"
// Dark mode Quarkus JVM monitoring dashboard

export default page(
  {
    refreshInterval: 10,
    metricsUrl: "data/quarkus/metrics",
  },
  {
    mode: "dark",
    displayer: {
      refresh: { interval: "${refreshInterval}" },
      chart: { resizable: true, height: 350, grid: { x: false } },
      columns: [
        { id: "Total" as ColumnId, pattern: "#" },
        { id: "Value" as ColumnId, pattern: "#" }
      ],
      lookup: { uuid: "all_metrics" as DataSetId },
    },
  },
  [
    dataset("all_metrics" as DataSetId, "${metricsUrl}", {
      cacheEnabled: true,
      refreshTime: "5second",
      columns: [
        { id: "Metric" as ColumnId, type: "LABEL" },
        { id: "Labels" as ColumnId, type: "LABEL" },
        { id: "Value" as ColumnId, type: "NUMBER" },
      ]
    }),
  ],
  [
    // Row 1: Four metric cards
    columns({}, ["3", "3", "3", "3"],
      [
        metric({
          lookup: createLookup("all_metrics" as DataSetId, [
            { type: "filter", column: "Metric" as ColumnId, function: "EQUALS_TO", args: ["system_cpu_usage"] },
            { type: "group", functions: [{ source: "Value" as ColumnId, function: "MAX", column: "CPU" as ColumnId }] }
          ]),
          general: { title: "CPU Usage" },
          columns: [{ id: "CPU" as ColumnId, expression: "value * 100", pattern: "#" }],
        })
      ],
      [
        metric({
          lookup: createLookup("all_metrics" as DataSetId, [
            { type: "filter", column: "Metric" as ColumnId, function: "EQUALS_TO", args: ["process_files_open_files"] },
            { type: "group", functions: [{ source: "Value" as ColumnId, function: "MAX", column: "Total" as ColumnId }] }
          ]),
          general: { title: "Open Files" },
        })
      ],
      [
        metric({
          lookup: createLookup("all_metrics" as DataSetId, [
            { type: "filter", column: "Metric" as ColumnId, function: "EQUALS_TO", args: ["process_uptime_seconds"] },
            { type: "group", functions: [{ source: "Value" as ColumnId, function: "MAX", column: "UPTIME" as ColumnId }] }
          ]),
          general: { visible: true, title: "Uptime" },
          columns: [{ id: "UPTIME" as ColumnId, pattern: "#", expression: "value / 60" }],
        })
      ],
      [
        metric({
          lookup: createLookup("all_metrics" as DataSetId, [
            { type: "filter", column: "Metric" as ColumnId, function: "EQUALS_TO", args: ["jvm_threads_peak_threads"] },
            { type: "group", functions: [{ source: "Value" as ColumnId }] }
          ]),
          general: { title: "Peak Threads" },
        })
      ]
    ),

    // Row 2: Heap and nonheap memory
    columns({ "margin-top": "50px" }, ["6", "6"],
      [
        barChart({
          lookup: createLookup("all_metrics" as DataSetId, [
            { type: "filter", column: "Metric" as ColumnId, function: "EQUALS_TO", args: ["jvm_memory_used_bytes"] },
            { type: "filter", column: "labels" as ColumnId, function: "LIKE_TO", args: ['area="heap"%'] },
            { type: "sort", column: "Total" as ColumnId, sortOrder: "DESCENDING" },
            {
              type: "group",
              groupingKey: { sourceId: "Labels" as ColumnId },
              functions: [
                { source: "Labels" as ColumnId },
                { source: "Value" as ColumnId, function: "MAX", column: "Total" as ColumnId }
              ]
            }
          ]),
          extraConfiguration: `{ "color" : ["#5ec962"] }`,
          general: { title: "JVM Memory Used Bytes (heap)" },
          columns: [{ id: "Labels" as ColumnId, expression: `value.replaceAll("area=\\"heap\\",id=\\"", "").replace("\\",", "")` }],
        })
      ],
      [
        barChart({
          lookup: createLookup("all_metrics" as DataSetId, [
            { type: "filter", column: "Metric" as ColumnId, function: "EQUALS_TO", args: ["jvm_memory_used_bytes"] },
            { type: "filter", column: "labels" as ColumnId, function: "LIKE_TO", args: ['area="nonheap"%'] },
            { type: "sort", column: "Total" as ColumnId, sortOrder: "DESCENDING" },
            {
              type: "group",
              groupingKey: { sourceId: "Labels" as ColumnId },
              functions: [
                { source: "Labels" as ColumnId },
                { source: "Value" as ColumnId, function: "MAX", column: "Total" as ColumnId }
              ]
            }
          ]),
          extraConfiguration: `{ "color" : ["#5ec962"] }`,
          general: { title: "JVM Memory Used Bytes (nonheap)" },
          columns: [{ id: "Labels" as ColumnId, expression: `value.replaceAll("area=\\"nonheap\\",id=\\"", "").replace("\\",", "")` }],
        })
      ]
    ),

    // Row 3: Threads
    columns({ "margin-top": "20px" }, ["12"],
      [
        barChart({
          lookup: createLookup("all_metrics" as DataSetId, [
            { type: "filter", column: "Metric" as ColumnId, function: "EQUALS_TO", args: ["jvm_threads_states_threads"] },
            { type: "sort", column: "Total" as ColumnId, sortOrder: "DESCENDING" },
            {
              type: "group",
              groupingKey: { sourceId: "Labels" as ColumnId },
              functions: [
                { source: "Labels" as ColumnId },
                { source: "Value" as ColumnId, function: "MAX", column: "Total" as ColumnId }
              ]
            }
          ]),
          extraConfiguration: `{ "color" : ["#4695EB"] }`,
          general: { title: "Threads" },
          columns: [{ id: "Labels" as ColumnId, expression: `value.replaceAll("state=\\"", "").replace("\\",", "")` }],
        })
      ]
    )
  ]
);
