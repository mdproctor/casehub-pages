import { page, html, metric, barChart, selector, columns, withStyle, dataset } from "@casehub/ui";
import { createLookup } from "@casehub/data";
import type { DataSetId, ColumnId } from "@casehub/data";

// TypeScript companion to "Triton Inference Server Model Metrics.dash.yaml"
// Triton inference server monitoring dashboard

export default page(
  {
    metricsUrl: "data/triton/metrics",
  },
  {
    displayer: {
      chart: { resizable: true },
      columns: [{ id: "label" as ColumnId, expression: `value.replace(/[a-z_]+="|"/g, '').replace(/,$/,'')` }],
    },
  },
  [
    dataset("metrics" as DataSetId, "${metricsUrl}", {
      columns: [
        { id: "metric" as ColumnId, type: "LABEL" },
        { id: "labels" as ColumnId, type: "LABEL" },
        { id: "value" as ColumnId, type: "NUMBER" },
      ]
    }),
  ],
  [
    // Header
    html("Triton Inference Server <hr />"),
    // Note: Original has properties: { "font-size": "x-large", margin: "13px" }

    // Metrics row
    columns({}, ["3", "3", "3", "3"],
      [
        metric({
          lookup: createLookup("metrics" as DataSetId, [
            { type: "filter", column: "metric" as ColumnId, function: "EQUALS_TO", args: ["nv_inference_count"] },
            { type: "group", functions: [{ source: "labels" as ColumnId, function: "COUNT" }] }
          ]),
          general: { title: "Running Models" },
          columns: [{ id: "labels" as ColumnId, pattern: "#" }],
        })
      ],
      [
        metric({
          lookup: createLookup("metrics" as DataSetId, [
            { type: "filter", column: "metric" as ColumnId, function: "EQUALS_TO", args: ["nv_inference_count"] },
            { type: "group", functions: [{ source: "value" as ColumnId, function: "SUM" }] }
          ]),
          general: { title: "Inference Count", visible: "true" },
          columns: [{ id: "value" as ColumnId, pattern: "#" }],
        })
      ],
      [
        metric({
          lookup: createLookup("metrics" as DataSetId, [
            { type: "filter", column: "metric" as ColumnId, function: "EQUALS_TO", args: ["nv_inference_request_success"] },
            { type: "group", functions: [{ source: "value" as ColumnId, function: "SUM" }] }
          ]),
          general: { title: "Inference Requests Success", visible: "true" },
          columns: [{ id: "value" as ColumnId, pattern: "#" }],
        })
      ],
      [
        metric({
          lookup: createLookup("metrics" as DataSetId, [
            { type: "filter", column: "metric" as ColumnId, function: "EQUALS_TO", args: ["nv_inference_request_failure"] },
            { type: "group", functions: [{ source: "value" as ColumnId, function: "SUM" }] }
          ]),
          general: { title: "Inference Requests Failure", visible: "true" },
          columns: [{ id: "value" as ColumnId, pattern: "#" }],
        })
      ]
    ),

    // Filter
    withStyle({ width: "220px", "margin-top": "20px" }, html("<strong>Filter by Model</strong>")),
    selector({
      lookup: createLookup("metrics" as DataSetId, [
        { type: "filter", column: "metric" as ColumnId, function: "EQUALS_TO", args: ["nv_inference_count"] },
        {
          type: "group",
          groupingKey: { sourceId: "labels" as ColumnId },
          functions: [{ source: "labels" as ColumnId, column: "model" as ColumnId }]
        }
      ]),
      filter: { notification: "true" },
      columns: [{
        id: "model" as ColumnId,
        expression: `value.replaceAll("\\"", "").replaceAll("model=", "").replaceAll("version=", "").replaceAll(",", " v")`
      }],
    }),

    // Charts row 1
    columns({ "margin-top": "20px" }, ["4", "4", "4"],
      [
        barChart({
          lookup: createLookup("metrics" as DataSetId, [
            { type: "filter", column: "metric" as ColumnId, function: "EQUALS_TO", args: ["nv_inference_count"] },
            { type: "filter", column: "value" as ColumnId, function: "GREATER_THAN", args: [0] },
            { type: "sort", column: "value" as ColumnId, sortOrder: "DESCENDING" },
            {
              type: "group",
              groupingKey: { sourceId: "labels" as ColumnId },
              functions: [
                { source: "labels" as ColumnId },
                { source: "value" as ColumnId, function: "SUM" }
              ]
            }
          ]),
          filter: { listening: "true" },
          general: { title: "Inference Count" },
          columns: [
            {
              id: "labels" as ColumnId,
              expression: `value.replaceAll("\\"", "").replaceAll("model=", "").replaceAll("version=", "").replaceAll(",", " v")`
            },
            { id: "value" as ColumnId, pattern: "#" }
          ],
        })
      ],
      [
        barChart({
          lookup: createLookup("metrics" as DataSetId, [
            { type: "filter", column: "metric" as ColumnId, function: "EQUALS_TO", args: ["nv_inference_request_success"] },
            { type: "filter", column: "value" as ColumnId, function: "GREATER_THAN", args: [0] },
            { type: "sort", column: "value" as ColumnId, sortOrder: "DESCENDING" },
            {
              type: "group",
              groupingKey: { sourceId: "labels" as ColumnId },
              functions: [
                { source: "labels" as ColumnId },
                { source: "value" as ColumnId, function: "SUM" }
              ]
            }
          ]),
          filter: { listening: "true" },
          general: { title: "Sucessful Inferences" },
          columns: [
            {
              id: "labels" as ColumnId,
              expression: `value.replaceAll("\\"", "").replaceAll("model=", "").replaceAll("version=", "").replaceAll(",", " v")`
            },
            { id: "value" as ColumnId, pattern: "#" }
          ],
        })
      ],
      [
        barChart({
          lookup: createLookup("metrics" as DataSetId, [
            { type: "filter", column: "metric" as ColumnId, function: "EQUALS_TO", args: ["nv_inference_request_failure"] },
            { type: "filter", column: "value" as ColumnId, function: "GREATER_THAN", args: [0] },
            { type: "sort", column: "value" as ColumnId, sortOrder: "DESCENDING" },
            {
              type: "group",
              groupingKey: { sourceId: "labels" as ColumnId },
              functions: [
                { source: "labels" as ColumnId },
                { source: "value" as ColumnId, function: "SUM" }
              ]
            }
          ]),
          filter: { listening: "true" },
          general: { title: "Failed Inferences" },
          columns: [
            {
              id: "labels" as ColumnId,
              expression: `value.replaceAll("\\"", "").replaceAll("model=", "").replaceAll("version=", "").replaceAll(",", " v")`
            },
            { id: "value" as ColumnId, pattern: "#" }
          ],
        })
      ]
    ),

    // Charts row 2 - Duration metrics
    columns({ "margin-top": "20px" }, ["4", "4", "4"],
      [
        barChart({
          lookup: createLookup("metrics" as DataSetId, [
            { type: "filter", column: "metric" as ColumnId, function: "EQUALS_TO", args: ["nv_inference_request_duration_us"] },
            { type: "sort", column: "value" as ColumnId, sortOrder: "DESCENDING" },
            {
              type: "group",
              groupingKey: { sourceId: "labels" as ColumnId },
              functions: [
                { source: "labels" as ColumnId },
                { source: "value" as ColumnId, column: "Duration" as ColumnId }
              ]
            }
          ]),
          filter: { listening: "true" },
          general: { title: "Inference Request Duration" },
          axis: { x: { labels_angle: 15 } },
          columns: [{
            id: "labels" as ColumnId,
            expression: `value.replaceAll("\\"", "").replaceAll("model=", "").replaceAll("version=", "").replaceAll(",", " v")`
          }],
        })
      ],
      [
        barChart({
          lookup: createLookup("metrics" as DataSetId, [
            { type: "filter", column: "metric" as ColumnId, function: "EQUALS_TO", args: ["nv_inference_compute_infer_duration_us"] },
            { type: "filter", column: "value" as ColumnId, function: "GREATER_THAN", args: [0] },
            { type: "sort", column: "value" as ColumnId, sortOrder: "DESCENDING" },
            {
              type: "group",
              groupingKey: { sourceId: "labels" as ColumnId },
              functions: [
                { source: "labels" as ColumnId },
                { source: "value" as ColumnId, column: "Duration" as ColumnId }
              ]
            }
          ]),
          filter: { listening: "true" },
          general: { title: "Inference Total Duration" },
          columns: [{
            id: "labels" as ColumnId,
            expression: `value.replaceAll("\\"", "").replaceAll("model=", "").replaceAll("version=", "").replaceAll(",", " v")`
          }],
        })
      ],
      [
        barChart({
          lookup: createLookup("metrics" as DataSetId, [
            { type: "filter", column: "metric" as ColumnId, function: "EQUALS_TO", args: ["nv_inference_queue_duration_us"] },
            { type: "filter", column: "value" as ColumnId, function: "GREATER_THAN", args: [0] },
            { type: "sort", column: "value" as ColumnId, sortOrder: "DESCENDING" },
            {
              type: "group",
              groupingKey: { sourceId: "labels" as ColumnId },
              functions: [
                { source: "labels" as ColumnId },
                { source: "value" as ColumnId, column: "Duration" as ColumnId }
              ]
            }
          ]),
          filter: { listening: "true" },
          general: { title: "Queue Wait" },
          columns: [{
            id: "labels" as ColumnId,
            expression: `value.replaceAll("\\"", "").replaceAll("model=", "").replaceAll("version=", "").replaceAll(",", " v")`
          }],
        })
      ]
    )
  ]
);
