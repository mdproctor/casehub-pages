import { page, metric, barChart, table, columns, dataset } from "@casehub/ui";
import { createLookup } from "@casehub/data";
import type { DataSetId, ColumnId } from "@casehub/data";

// TypeScript companion to "Backstage Metrics.dash.yaml"
// Node.js Backstage metrics with screens/panels navigation

// Note: The YAML uses screens and panels (Cards, Charts, Metrics Table).
// This translation presents all components sequentially.

export default page(
  {},
  {
    displayer: {
      extraConfiguration: `{ "series": [{ "type": "bar", "itemStyle": { "normal": { "label": { "show": true, "position": "top", "fontSize": 10 } } } }] }`,
      chart: { resizable: true },
      columns: [{ id: "labels" as ColumnId, expression: `value.split(",")[0].replaceAll("version=", "").replaceAll("\\"", "").replaceAll("type=", "")` }],
      lookup: { uuid: "metrics" as DataSetId },
    },
  },
  [
    dataset("metrics" as DataSetId, "metrics", { cacheEnabled: true }),
  ],
  [
    // Cards (screen: Cards)
    columns({ "margin-top": "10px" }, ["3", "3", "3", "3"],
      [
        metric({
          lookup: createLookup("metrics" as DataSetId, [
            { type: "filter", column: "metric" as ColumnId, function: "EQUALS_TO", args: ["nodejs_version_info"] },
            { type: "group", functions: [{ source: "labels" as ColumnId }] }
          ]),
          general: { title: "Node Version" },
        })
      ],
      [
        metric({
          lookup: createLookup("metrics" as DataSetId, [
            { type: "filter", column: "metric" as ColumnId, function: "EQUALS_TO", args: ["process_start_time_seconds"] },
            { type: "group", functions: [{ source: "value" as ColumnId }] }
          ]),
          general: { title: "Started" },
          columns: [{ id: "value" as ColumnId, expression: `new Date(value * 1000).toISOString().substring(0, 19).replace("T", " ")` }],
        })
      ],
      [
        metric({
          lookup: createLookup("metrics" as DataSetId, [
            { type: "filter", column: "metric" as ColumnId, function: "EQUALS_TO", args: ["process_heap_bytes"] },
            { type: "group", functions: [{ source: "value" as ColumnId }] }
          ]),
          general: { title: "Heap Bytes" },
          columns: [{ id: "value" as ColumnId, expression: `parseInt(value / (1024 * 1024)) + " MB"` }],
        })
      ],
      [
        metric({
          lookup: createLookup("metrics" as DataSetId, [
            { type: "filter", column: "metric" as ColumnId, function: "EQUALS_TO", args: ["process_open_fds"] },
            { type: "group", functions: [{ source: "value" as ColumnId }] }
          ]),
          general: { title: "Open Files" },
          columns: [{ id: "value" as ColumnId, pattern: "#" }],
        })
      ]
    ),

    // Charts (screen: Charts)
    columns({}, ["4", "4", "4"],
      [
        barChart({
          lookup: createLookup("metrics" as DataSetId, [
            { type: "filter", column: "metric" as ColumnId, function: "EQUALS_TO", args: ["nodejs_active_resources"] },
            { type: "sort", column: "value" as ColumnId, order: "DESCENDING" },
            { type: "group", functions: [{ source: "labels" as ColumnId }, { source: "value" as ColumnId }] }
          ]),
          general: { title: "Active Resources" },
          axis: { x: { labels_angle: -10 } },
          columns: [{ id: "value" as ColumnId, pattern: "#" }],
        })
      ],
      [
        barChart({
          lookup: createLookup("metrics" as DataSetId, [
            {
              type: "filter",
              column: "metric" as ColumnId,
              function: "EQUALS_TO",
              args: ["nodejs_eventloop_lag_min_seconds", "nodejs_eventloop_lag_max_seconds", "nodejs_eventloop_lag_mean_seconds"]
            },
            { type: "sort", column: "metric" as ColumnId, order: "DESCENDING" },
            { type: "group", functions: [{ source: "metric" as ColumnId }, { source: "value" as ColumnId }] }
          ]),
          general: { title: "Event Loop Lag (seconds)" },
          columns: [{
            id: "metric" as ColumnId,
            expression: `lbl = "Mean"; if (value === "nodejs_eventloop_lag_min_seconds") lbl = "Min"; if (value === "nodejs_eventloop_lag_max_seconds") lbl = "Max"; lbl;`
          }],
        })
      ],
      [
        barChart({
          lookup: createLookup("metrics" as DataSetId, [
            {
              type: "filter",
              column: "metric" as ColumnId,
              function: "EQUALS_TO",
              args: ["nodejs_heap_size_total_bytes", "nodejs_heap_size_used_bytes"]
            },
            { type: "sort", column: "value" as ColumnId, order: "DESCENDING" },
            { type: "group", functions: [{ source: "metric" as ColumnId }, { source: "value" as ColumnId }] }
          ]),
          general: { title: "Used Bytes (MB)" },
          columns: [
            { id: "metric" as ColumnId, expression: `value.replaceAll("nodejs_heap_size_", "").replaceAll("_bytes", "")` },
            { id: "value" as ColumnId, expression: `parseInt(value / (1024 * 1024))`, pattern: "#" }
          ],
        })
      ]
    ),

    // Metrics Table (screen: Metrics Table)
    table({
      lookup: createLookup("metrics" as DataSetId, [
        {
          type: ".filter",  // Note: original YAML has typo ".filter" instead of "filter"
          column: "metric" as ColumnId,
          function: "NOT_EQUALS_TO",
          args: [
            "process_open_fds", "process_max_fds", "process_start_time_seconds",
            "nodejs_active_resources", "nodejs_version_info", "process_heap_bytes",
            "nodejs_eventloop_lag_min_seconds", "nodejs_eventloop_lag_max_seconds",
            "nodejs_eventloop_lag_mean_seconds", "nodejs_heap_size_total_bytes",
            "nodejs_heap_space_size_used_bytes", "nodejs_external_memory_bytes", "up"
          ]
        },
        {
          type: "group",
          groupingKey: { sourceId: "metric" as ColumnId },
          functions: [{ source: "metric" as ColumnId }, { source: "value" as ColumnId }]
        }
      ]),
    })
  ]
);
