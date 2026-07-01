import { page, html, metric, timeseries, areaChart, barChart, pieChart, table, columns, withStyle, dataset } from "@casehubio/ui";
import { createLookup } from "@casehubio/data";
import type { DataSetId, ColumnId } from "@casehubio/data";

// TypeScript companion to "Prometheus Basic.yml"
// Demonstrates Prometheus metrics exploration with various visualizations

export default page(
  {
    prometheusUrl: "http://localhost:9090",
    query: "go_gc_heap_live_bytes[1m:1s]",
  },
  {
    displayer: {
      refresh: { interval: 1 },
      lookup: { uuid: "prometheus" as DataSetId },
      chart: { resizable: true },
    },
  },
  [
    dataset("prometheus" as DataSetId, "${prometheusUrl}/api/v1/query?query=${query}", { type: "prometheus" }),
    dataset("prometheus_instant" as DataSetId, "${prometheusUrl}/api/v1/query?query=prometheus_http_requests_total", { type: "prometheus" }),
  ],
  [
    // Row 1: Header
    withStyle({ "background-color": "#e65100", color: "white", padding: "16px 24px", "border-radius": "8px", "margin-bottom": "16px" },
      html(`<strong style="font-size: 20px; font-family: sans-serif;">Prometheus Metrics Explorer</strong><br/><span style="opacity: 0.8; font-size: 13px;">Query: <code>\${query}</code> &middot; Source: <code>\${prometheusUrl}</code></span>`)
    ),

    // Row 2: Summary metrics
    columns(
      { "margin-bottom": "24px" },
      ["3", "3", "3", "3"],
      [
        metric({
          lookup: createLookup("prometheus" as DataSetId, [
            { type: "group", functions: [{ source: "value" as ColumnId, function: "COUNT" }] }
          ]),
          general: { title: "Data Points" },
        })
      ],
      [
        withStyle({ color: "#e65100" },
          metric({
            lookup: createLookup("prometheus" as DataSetId, [
              { type: "group", functions: [{ source: "value" as ColumnId, function: "MAX" }] }
            ]),
            general: { title: "Max Value" },
            columns: [{ id: "value" as ColumnId, pattern: "#,000" }],
          })
        )
      ],
      [
        withStyle({ color: "#2e7d32" },
          metric({
            lookup: createLookup("prometheus" as DataSetId, [
              { type: "group", functions: [{ source: "value" as ColumnId, function: "MIN" }] }
            ]),
            general: { title: "Min Value" },
            columns: [{ id: "value" as ColumnId, pattern: "#,000" }],
          })
        )
      ],
      [
        withStyle({ color: "#1565c0" },
          metric({
            lookup: createLookup("prometheus" as DataSetId, [
              { type: "group", functions: [{ source: "value" as ColumnId, function: "AVERAGE" }] }
            ]),
            general: { title: "Average" },
            columns: [{ id: "value" as ColumnId, pattern: "#,000.00" }],
          })
        )
      ]
    ),

    // Row 3: Timeseries
    columns(
      { "margin-bottom": "24px" },
      ["12"],
      [
        timeseries({
          lookup: createLookup("prometheus" as DataSetId, [
            { type: "group", functions: [
              { source: "__name__" as ColumnId },
              { source: "timestamp" as ColumnId },
              { source: "value" as ColumnId }
            ]}
          ]),
          general: { title: "Metric Values Over Time" },
          chart: { height: 350 },
        })
      ]
    ),

    // Row 4: Area chart + Bar chart
    columns(
      { "margin-bottom": "24px" },
      ["6", "6"],
      [
        areaChart({
          lookup: createLookup("prometheus" as DataSetId, [
            { type: "group", functions: [
              { source: "handler" as ColumnId },
              { source: "timestamp" as ColumnId },
              { source: "value" as ColumnId }
            ]}
          ]),
          general: { title: "Value Distribution (Area)" },
          chart: { height: 280 },
        })
      ],
      [
        barChart({
          lookup: createLookup("prometheus_instant" as DataSetId, [
            {
              type: "group",
              groupingKey: { sourceId: "handler" as ColumnId },
              functions: [
                { source: "handler" as ColumnId },
                { source: "value" as ColumnId, function: "SUM" }
              ]
            }
          ]),
          general: { title: "Total by Endpoint" },
          chart: { height: 280 },
        })
      ]
    ),

    // Row 5: Pie chart + Table
    columns(
      {},
      ["4", "8"],
      [
        pieChart({
          lookup: createLookup("prometheus_instant" as DataSetId, [
            {
              type: "group",
              groupingKey: { sourceId: "method" as ColumnId },
              functions: [
                { source: "method" as ColumnId },
                { source: "value" as ColumnId, function: "SUM" }
              ]
            }
          ]),
          general: { title: "Request Share by Method" },
          chart: { height: 300 },
        })
      ],
      [
        table({
          lookup: createLookup("prometheus" as DataSetId, []),
          general: { title: "Raw Metrics" },
          table: { sort: { enabled: true }, show_column_picker: true },
        })
      ]
    )
  ]
);
