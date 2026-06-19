import { page, html, selector, metric, timeseries, barChart, pieChart, table, columns, withStyle, dataset } from "@casehub/ui";
import { createLookup } from "@casehub/data";
import type { DataSetId, ColumnId } from "@casehub/data";

// TypeScript companion to "Prometheus HTTP Requests.yml"
// Real-time HTTP endpoint monitoring with filters and breakdowns

export default page(
  {
    prometheusUrl: "http://localhost:9090",
    refreshInterval: 2,
  },
  {
    displayer: {
      refresh: { interval: "${refreshInterval}" },
      chart: { resizable: true },
    },
  },
  [
    dataset("recent_http_requests" as DataSetId, "${prometheusUrl}/api/v1/query?query=prometheus_http_requests_total[1m:1s]", { type: "prometheus" }),
    dataset("http_requests" as DataSetId, "${prometheusUrl}/api/v1/query?query=prometheus_http_requests_total", { type: "prometheus" }),
  ],
  [
    // Row 1: Header
    withStyle({ "background-color": "#1a1a2e", color: "white", padding: "16px 24px", "border-radius": "8px", "margin-bottom": "16px" },
      html(`<strong style="font-size: 20px; font-family: sans-serif;">Prometheus HTTP Requests</strong><br/><span style="opacity: 0.7; font-size: 13px;">Real-time HTTP endpoint monitoring</span>`)
    ),

    // Row 1b: Filter
    columns(
      { "margin-bottom": "12px" },
      ["3"],
      [
        html("Filter by Handler"),
        withStyle({ "font-weight": "bolder", "font-size": "13px", "margin-bottom": "4px" },
          html("")
        ),
        withStyle({ width: "100%" },
          selector({
            lookup: createLookup("http_requests" as DataSetId, [
              {
                type: "group",
                groupingKey: { sourceId: "handler" as ColumnId },
                functions: [{ source: "handler" as ColumnId }]
              }
            ]),
            filter: { notification: "true" },
          })
        )
      ]
    ),

    // Row 2: Metric cards
    columns(
      { "margin-bottom": "24px" },
      ["3", "3", "3", "3"],
      [
        metric({
          lookup: createLookup("http_requests" as DataSetId, [
            { type: "group", functions: [{ source: "value" as ColumnId, function: "SUM" }] }
          ]),
          filter: { listening: "true" },
          general: { title: "Total Requests" },
          chart: { height: "90" },
          columns: [{ id: "value" as ColumnId, pattern: "#,000" }],
        })
      ],
      [
        withStyle({ color: "#2e7d32" },
          metric({
            lookup: createLookup("http_requests" as DataSetId, [
              {
                type: "filter",
                column: "code" as ColumnId,
                function: "EQUALS_TO",
                args: [200]
              },
              { type: "group", functions: [{ source: "value" as ColumnId, function: "SUM" }] }
            ]),
            filter: { listening: "true" },
            general: { title: "Success (2xx)" },
            columns: [{ id: "value" as ColumnId, pattern: "#,000" }],
          })
        )
      ],
      [
        withStyle({ color: "#d32f2f" },
          metric({
            lookup: createLookup("http_requests" as DataSetId, [
              {
                type: "filter",
                column: "code" as ColumnId,
                function: "GREATER_THAN",
                args: [399]
              },
              { type: "group", functions: [{ source: "value" as ColumnId, function: "SUM" }] }
            ]),
            filter: { listening: "true" },
            general: { title: "Errors (4xx/5xx)" },
            columns: [{ id: "value" as ColumnId, pattern: "#,000" }],
          })
        )
      ],
      [
        withStyle({ color: "#1565c0" },
          metric({
            lookup: createLookup("http_requests" as DataSetId, [
              {
                type: "group",
                groupingKey: { sourceId: "handler" as ColumnId },
                functions: [{ source: "handler" as ColumnId, function: "COUNT" }]
              }
            ]),
            filter: { listening: "true" },
            general: { title: "Endpoints" },
          })
        )
      ]
    ),

    // Row 3: Timeseries + Donut chart
    columns(
      { "margin-bottom": "24px" },
      ["8", "4"],
      [
        timeseries({
          lookup: createLookup("recent_http_requests" as DataSetId, [
            {
              type: "filter",
              column: "value" as ColumnId,
              function: "GREATER_THAN",
              args: [0]
            },
            {
              type: "group",
              functions: [
                { source: "handler" as ColumnId },
                { source: "timestamp" as ColumnId },
                { source: "value" as ColumnId }
              ]
            }
          ]),
          filter: { listening: "true" },
          general: { title: "Request Volume Over Time" },
          chart: { height: 350 },
        })
      ],
      [
        pieChart({
          type: "DONUT",
          lookup: createLookup("http_requests" as DataSetId, [
            {
              type: "group",
              groupingKey: { sourceId: "handler" as ColumnId },
              functions: [
                { source: "handler" as ColumnId },
                { source: "value" as ColumnId, function: "SUM" }
              ]
            }
          ]),
          filter: { listening: "true" },
          general: { title: "Requests by Endpoint" },
          chart: { height: 350 },
        })
      ]
    ),

    // Row 4: Bar charts - Handlers and Status codes
    columns(
      { "margin-bottom": "24px" },
      ["6", "6"],
      [
        barChart({
          lookup: createLookup("http_requests" as DataSetId, [
            {
              type: "group",
              groupingKey: { sourceId: "handler" as ColumnId },
              functions: [
                { source: "handler" as ColumnId },
                { source: "value" as ColumnId, function: "SUM" }
              ]
            }
          ]),
          filter: { listening: "true" },
          general: { title: "Requests by Handler" },
          chart: { height: 300 },
        })
      ],
      [
        barChart({
          subtype: "BAR",
          lookup: createLookup("http_requests" as DataSetId, [
            {
              type: "group",
              groupingKey: { sourceId: "code" as ColumnId },
              functions: [
                { source: "code" as ColumnId },
                { source: "value" as ColumnId, function: "SUM" }
              ]
            }
          ]),
          filter: { listening: "true" },
          general: { title: "Requests by Status Code" },
          chart: { height: 300, margin: { left: 80 } },
        })
      ]
    ),

    // Row 5: Detail table
    table({
      lookup: createLookup("http_requests" as DataSetId, []),
      filter: { listening: "true" },
      general: { title: "Request Details" },
      table: { sort: { enabled: true }, show_column_picker: true },
    })
  ]
);
