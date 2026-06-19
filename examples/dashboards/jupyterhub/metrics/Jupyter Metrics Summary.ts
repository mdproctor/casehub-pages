import { page, title, metric, barChart, columns, dataset } from "@casehub/ui";
import { createLookup } from "@casehub/data";
import type { DataSetId, ColumnId } from "@casehub/data";

// TypeScript companion to "Jupyter Metrics Summary.dash.yaml"
// JupyterHub summary metrics with charts

export default page(
  {
    metricsUrl: "metrics",
  },
  {
    displayer: {
      chart: { resizable: true },
      axis: { x: { labels_angle: 15 } },
      columns: [{ id: "Label" as ColumnId, expression: `value.replace(/[a-z_]+="|"/g, '').replace(/,$/,'')` }],
      lookup: { uuid: "metrics" as DataSetId },
    },
  },
  [
    dataset("metrics" as DataSetId, "${metricsUrl}", {
      columns: [
        { id: "Metric" as ColumnId, type: "LABEL" },
        { id: "Label" as ColumnId, type: "LABEL" },
        { id: "Value" as ColumnId, type: "NUMBER" },
      ]
    }),
  ],
  [
    title("Jupyter Hub Metrics Summary"),

    columns({}, ["3", "3", "3", "3"],
      [
        metric({
          lookup: createLookup("metrics" as DataSetId, [
            { type: "filter", column: "metric" as ColumnId, function: "EQUALS_TO", args: ["jupyterhub_total_users"] },
            { type: "group", functions: [{ source: "value" as ColumnId }] }
          ]),
          general: { title: "Users" },
          columns: [{ id: "value" as ColumnId, pattern: "#" }],
        })
      ],
      [
        metric({
          lookup: createLookup("metrics" as DataSetId, [
            { type: "filter", column: "metric" as ColumnId, function: "EQUALS_TO", args: ["jupyterhub_running_servers"] },
            { type: "group", functions: [{ source: "value" as ColumnId }] }
          ]),
          general: { title: "Running Servers" },
          columns: [{ id: "value" as ColumnId, pattern: "#" }],
        })
      ],
      [
        metric({
          lookup: createLookup("metrics" as DataSetId, [
            { type: "filter", column: "metric" as ColumnId, function: "EQUALS_TO", args: ["process_resident_memory_bytes"] },
            { type: "group", functions: [{ source: "value" as ColumnId }] }
          ]),
          general: { title: "Memory (mb)" },
          columns: [{ id: "value" as ColumnId, expression: "value / 1014 / 1024", pattern: "#" }],
        })
      ],
      [
        metric({
          lookup: createLookup("metrics" as DataSetId, [
            { type: "filter", column: "metric" as ColumnId, function: "EQUALS_TO", args: ["jupyterhub_hub_startup_duration_seconds_sum"] },
            { type: "group", functions: [{ source: "value" as ColumnId }] }
          ]),
          general: { title: "Startup (seconds)" },
          columns: [{ id: "value" as ColumnId, pattern: "#" }],
        })
      ]
    ),

    columns({}, ["4", "4", "4"],
      [
        barChart({
          lookup: createLookup("metrics" as DataSetId, [
            { type: "filter", column: "Metric" as ColumnId, function: "EQUALS_TO", args: ["jupyterhub_server_spawn_duration_seconds_count"] },
            {
              type: "group",
              groupingKey: { sourceId: "Label" as ColumnId },
              functions: [{ source: "Label" as ColumnId }, { source: "Value" as ColumnId }]
            }
          ]),
          filter: { listening: "true" },
        })
      ],
      [
        barChart({
          lookup: createLookup("metrics" as DataSetId, [
            { type: "filter", column: "Metric" as ColumnId, function: "EQUALS_TO", args: ["jupyterhub_server_stop_seconds_count"] },
            {
              type: "group",
              groupingKey: { sourceId: "Label" as ColumnId },
              functions: [{ source: "Label" as ColumnId }, { source: "Value" as ColumnId }]
            }
          ]),
          filter: { listening: "true" },
        })
      ],
      [
        barChart({
          lookup: createLookup("metrics" as DataSetId, [
            { type: "filter", column: "Metric" as ColumnId, function: "EQUALS_TO", args: ["jupyterhub_proxy_add_duration_seconds_count"] },
            {
              type: "group",
              groupingKey: { sourceId: "Label" as ColumnId },
              functions: [{ source: "Label" as ColumnId }, { source: "Value" as ColumnId }]
            }
          ]),
        })
      ]
    ),

    barChart({
      lookup: createLookup("metrics" as DataSetId, [
        { type: "filter", column: "Metric" as ColumnId, function: "EQUALS_TO", args: ["jupyterhub_request_duration_seconds_count"] },
        { type: "sort", column: "value" as ColumnId, sortOrder: "DESCENDING" },
        {
          type: "group",
          groupingKey: { sourceId: "Label" as ColumnId },
          functions: [{ source: "Label" as ColumnId }, { source: "Value" as ColumnId }]
        }
      ]),
      columns: [{
        id: "Label" as ColumnId,
        expression: `value.replaceAll("code=", "").replaceAll("handler=", "").replaceAll("method=", "").replaceAll("\\"", "")`
      }],
    })
  ]
);
