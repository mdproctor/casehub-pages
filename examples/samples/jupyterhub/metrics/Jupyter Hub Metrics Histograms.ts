import { page, title, barChart, dataset } from "@casehubio/ui";
import { createLookup } from "@casehubio/data";
import type { DataSetId, ColumnId } from "@casehubio/data";

// TypeScript companion to "Jupyter Hub Metrics Histograms.dash.yaml"
// JupyterHub metrics histogram charts

export default page(
  {
    metricsUrl: "metrics",
  },
  {
    displayer: {
      axis: { x: { labels_angle: 15 } },
      chart: { resizable: true },
      columns: [{ id: "Label" as ColumnId, expression: `value.replace(/[a-z_]+="|"/g, '').replace(/,$/,'')` }],
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
    title("Jupyter Hub Metrics Histograms"),

    barChart({
      lookup: createLookup("metrics" as DataSetId, [
        { type: "filter", column: "Metric" as ColumnId, function: "EQUALS_TO", args: ["jupyterhub_proxy_add_duration_seconds_bucket"] },
        {
          type: "group",
          groupingKey: { sourceId: "Label" as ColumnId },
          functions: [{ source: "Label" as ColumnId }, { source: "Value" as ColumnId }]
        }
      ]),
      chart: { resizable: true },
    }),

    barChart({
      lookup: createLookup("metrics" as DataSetId, [
        { type: "filter", column: "Metric" as ColumnId, function: "EQUALS_TO", args: ["jupyterhub_proxy_delete_duration_seconds_bucket"] },
        {
          type: "group",
          groupingKey: { sourceId: "Label" as ColumnId },
          functions: [{ source: "Label" as ColumnId }, { source: "Value" as ColumnId }]
        }
      ]),
    }),

    barChart({
      lookup: createLookup("metrics" as DataSetId, [
        { type: "filter", column: "Metric" as ColumnId, function: "EQUALS_TO", args: ["jupyterhub_server_spawn_duration_seconds_bucket"] },
        {
          type: "group",
          groupingKey: { sourceId: "Label" as ColumnId },
          functions: [{ source: "Label" as ColumnId }, { source: "Value" as ColumnId }]
        }
      ]),
    })
  ]
);
