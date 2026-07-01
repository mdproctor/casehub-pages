import { page, title, metric, barChart, timeseries, markdown, selector, tabs, div, columns, withStyle, dataset } from "@casehubio/ui";
import { createLookup } from "@casehubio/data";
import type { DataSetId, ColumnId } from "@casehubio/data";

// TypeScript companion to "Kepler Metrics.yaml"
// Kepler energy consumption metrics with multi-page navigation

// Note: The YAML uses navTree with multiple named pages (index, Monitoring, Joules by Node, Joules by Container).
// This translation presents components sequentially; a full implementation would require page/navigation support.

export default page(
  {
    kepler_url: "https://raw.githubusercontent.com/jesuino/melviz-yaml-samples/main/kepler",
    kepler_metrics_url: "metrics",
  },
  {
    mode: "dark",
    allowUrlProperties: true,
    displayer: {
      extraConfiguration: `{ ".color": ["#6f634b", "#7a745d", "#9a9381", "#b2a59b", "#cec0b8", "#dec0bf"], "title": { "top": "auto", "right": "" } }`,
      refresh: { interval: 1 },
      chart: { resizable: true, height: 400, legend: { show: true }, grid: { x: false } },
      html: {
        html: `<div style="width: 95%;height: auto;margin-top:0px;margin-right:0px;margin-bottom:0px;margin-left:0px;">
<div class="pf-v5-c-card pf-m-compact pf-m-rounded">
<div class="pf-v5-c-card__title"><div class="pf-v5-c-title pf-m-2xl">\${value}</div></div>
<div class="pf-v5-c-card__footer">\${title}</div></div></div>`
      },
    },
    dataset: { url: "metrics", cacheEnabled: true },
  },
  [
    dataset("metrics" as DataSetId, "metrics", { cacheEnabled: true }),
    dataset("joules_by_container" as DataSetId, "", {
      // Complex JSONata expression for container energy breakdown
      expression: `$ [$contains($[0], /kepler_container.*joules_total/) and $[2] != "0"].[$replace($[1], /(.+)container_name="([0-9a-zA-Z-_]+)",(.+)/, "$2"), $replace($[1], /(.+)pod_name="([0-9a-zA-Z-_]+)"/, "$2"), $[0] = "kepler_container_joules_total" ? $[2] : "0", $[0] = "kepler_container_core_joules_total" ? $[2] : "0", $[0] = "kepler_container_dram_joules_total" ? $[2] : "0", $[0] = "kepler_container_uncore_joules_total" ? $[2] : "0", $[0] = "kepler_container_package_joules_total" ? $[2] : "0", $[0] = "kepler_container_gpu_joules_total" ? $[2] : "0", $[0] = "kepler_container_other_host_components_joules_total" ? $[2] : "0"]`,
      columns: [
        { id: "Container" as ColumnId },
        { id: "Pod" as ColumnId },
        { id: "Total" as ColumnId, type: "NUMBER" },
        { id: "Core" as ColumnId, type: "NUMBER" },
        { id: "DRAM" as ColumnId, type: "NUMBER" },
        { id: "Uncore" as ColumnId, type: "NUMBER" },
        { id: "Package" as ColumnId, type: "NUMBER" },
        { id: "Other Host" as ColumnId, type: "NUMBER" },
        { id: "GPU" as ColumnId, type: "NUMBER" },
      ]
    }),
    dataset("joules_by_node" as DataSetId, "", {
      // Complex JSONata expression for node energy breakdown
      expression: `$ [$contains($[0], /kepler_node.*joules_total/) and $[2] != "0"].[$replace($[1], /instance="([0-9a-zA-Z-_]+)",(.+)/, "$1"), $[0] = "kepler_node_core_joules_total" ? $[2] : "0", $[0] = "kepler_node_dram_joules_total" ? $[2] : "0", $[0] = "kepler_node_uncore_joules_total" ? $[2] : "0", $[0] = "kepler_node_package_joules_total" ? $[2] : "0", $[0] = "kepler_node_gpu_joules_total" ? $[2] : "0", $[0] = "kepler_node_other_host_components_joules_total" ? $[2] : "0", $[2]]`,
      columns: [
        { id: "Node" as ColumnId },
        { id: "Core" as ColumnId, type: "NUMBER" },
        { id: "DRAM" as ColumnId, type: "NUMBER" },
        { id: "Uncore" as ColumnId, type: "NUMBER" },
        { id: "Package" as ColumnId, type: "NUMBER" },
        { id: "Other Host" as ColumnId, type: "NUMBER" },
        { id: "GPU" as ColumnId, type: "NUMBER" },
        { id: "Value" as ColumnId, type: "NUMBER" },
      ]
    }),
    dataset("monitoring" as DataSetId, "", {
      accumulate: true,
      expression: `($now := $now() ~> $toMillis(); $[$[0] = "kepler_container_joules_total" and $[2] != "0"].[$replace($[1], /(.+)container_namespace="([0-9a-zA-Z-_]+)",(.+)/, "$2"), $replace($[1], /(.+)container_name="([0-9a-zA-Z-_]+)",(.+)/, "$2"), $[2], $now])`,
      columns: [
        { id: "Namespace" as ColumnId },
        { id: "Container" as ColumnId },
        { id: "Total" as ColumnId, type: "NUMBER" },
        { id: "Timestamp" as ColumnId, type: "NUMBER" },
      ]
    }),
  ],
  [
    // Index page
    title("Kepler Metrics"),
    tabs({ navGroupId: "Metrics", targetDivId: "Metrics_Div" }),
    div({ divId: "Metrics_Div" }),

    // Monitoring page
    columns({ margin: "10px", "margin-top": "30px" }, ["12"],
      [
        timeseries({
          lookup: createLookup("monitoring" as DataSetId, [
            {
              type: "group",
              functions: [
                { source: "Container" as ColumnId },
                { source: "Timestamp" as ColumnId },
                { source: "Total" as ColumnId }
              ]
            }
          ]),
          filter: { listening: true },
          general: { title: "Joules by Container over time" },
        })
      ]
    ),

    // Joules by Node page
    markdown("### **Filter**"),
    withStyle({ width: "160px" },
      selector({
        lookup: createLookup("joules_by_node" as DataSetId, [
          {
            type: "group",
            groupingKey: { sourceId: "Node" as ColumnId },
            functions: [{ source: "Node" as ColumnId }]
          }
        ]),
        filter: { notification: true },
      })
    ),

    withStyle({ "margin-top": "30px", width: "330px", "text-align": "center" },
      metric({
        lookup: createLookup("joules_by_node" as DataSetId, [
          {
            type: "group",
            functions: [{ source: "Value" as ColumnId, function: "SUM" }]
          }
        ]),
        filter: { listening: true },
        general: { title: "Total Joules by Node" },
        columns: [{ id: "Total" as ColumnId, pattern: "###,###.000" }],
      })
    ),

    withStyle({ "margin-top": "80px" },
      barChart({
        lookup: createLookup("joules_by_node" as DataSetId, [
          {
            type: "group",
            groupingKey: { sourceId: "Node" as ColumnId },
            functions: [
              { source: "Node" as ColumnId },
              { source: "Package" as ColumnId, function: "SUM" },
              { source: "Core" as ColumnId, function: "SUM" },
              { source: "DRAM" as ColumnId, function: "SUM" },
              { source: "Uncore" as ColumnId, function: "SUM" },
              { source: "Other Host" as ColumnId, function: "SUM" },
              { source: "GPU" as ColumnId, function: "SUM" }
            ]
          }
        ]),
        filter: { listening: true },
        general: { title: "Joules by Node" },
        chart: { height: 400 },
      })
    ),

    // Joules by Container page
    markdown("### **Filter**"),
    withStyle({ width: "160px" },
      selector({
        lookup: createLookup("joules_by_container" as DataSetId, [
          {
            type: "group",
            groupingKey: { sourceId: "Container" as ColumnId },
            functions: [{ source: "Container" as ColumnId }]
          }
        ]),
        filter: { notification: true },
      })
    ),

    withStyle({ width: "160px", "margin-top": "10px" },
      selector({
        lookup: createLookup("joules_by_container" as DataSetId, [
          {
            type: "group",
            groupingKey: { sourceId: "Pod" as ColumnId },
            functions: [{ source: "Pod" as ColumnId }]
          }
        ]),
        filter: { notification: true, listening: true },
      })
    ),

    withStyle({ "margin-top": "30px" },
      metric({
        lookup: createLookup("joules_by_container" as DataSetId, [
          {
            type: "group",
            functions: [{ source: "Total" as ColumnId, function: "SUM" }]
          }
        ]),
        filter: { listening: true },
        general: { title: "Total Joules by Container" },
        columns: [{ id: "Total" as ColumnId, pattern: "###,###.000" }],
      })
    ),

    withStyle({ "margin-top": "80px" },
      barChart({
        lookup: createLookup("joules_by_container" as DataSetId, [
          {
            type: "group",
            groupingKey: { sourceId: "Container" as ColumnId },
            functions: [
              { source: "Container" as ColumnId },
              { source: "Package" as ColumnId, function: "SUM" },
              { source: "Core" as ColumnId, function: "SUM" },
              { source: "DRAM" as ColumnId, function: "SUM" },
              { source: "Uncore" as ColumnId, function: "SUM" },
              { source: "Other Host" as ColumnId, function: "SUM" },
              { source: "GPU" as ColumnId, function: "SUM" }
            ]
          }
        ]),
        filter: { listening: true },
        general: { title: "Joules by Container" },
        chart: { height: 400 },
      })
    )
  ]
);

// Note: The YAML defines a navTree with GROUP "Metrics" containing pages:
// - Joules by Node
// - Joules by Container
// - Monitoring
// This would require a navigation API in the DSL for proper multi-page support.
