import { page, bind, restSource, html, metric, barChart, columns, lookup, filterBy, groupBy, col } from "@casehubio/pages-ui";
import type { ColumnId } from "@casehubio/pages-data";
import { ColumnType, dataSetId } from "@casehubio/pages-data";

const cardTemplate = `<div id="\${this}" class="card-pf card-pf-aggregate-status" style="background-color: \${bgColor}; width: 90%; height: 90px;margin: 10px; border-radius: 10px">
<h2 style="font-weight: 600; font-size: x-large" id="\${this}Value">\${value} <span id="\${this}Suffix" class=""></span></h2>
<p style="font-weight: 400; font-size: large" id="\${this}Title"><em id="\${this}Icon" class=""></em> \${title}</p>
</div>`;

const metricsDs = bind("metrics", restSource("${modelMeshMetricsUrl}", dataSetId("metrics"), {
  columns: [
    { id: "metric" as ColumnId, type: ColumnType.LABEL },
    { id: "labels" as ColumnId, type: ColumnType.LABEL },
    { id: "value" as ColumnId, type: ColumnType.NUMBER },
  ],
}));

const requestResponseSizeDs = bind("request_response_size", restSource("${modelMeshMetricsUrl}", dataSetId("request_response_size"), {
  expression: `($requestSize := $number($[$[0] = "modelmesh_request_size_bytes_sum"][0][2]); $requestCount := $number($[$[0] = "modelmesh_request_size_bytes_count"][0][2]); $responseSize := $number($[$[0] = "modelmesh_response_size_bytes_sum"][0][2]); $responseCount := $number($[$[0] = "modelmesh_response_size_bytes_count"][0][2]); [ "Size", $requestSize / $requestCount,  $responseSize / $responseCount])`,
  columns: [
    { id: "Metric" as ColumnId, type: ColumnType.LABEL },
    { id: "Request" as ColumnId, type: ColumnType.NUMBER },
    { id: "Response" as ColumnId, type: ColumnType.NUMBER },
  ],
}));

const jvmMemoryDs = bind("jvm_memory", restSource("${modelMeshMetricsUrl}", dataSetId("jvm_memory"), {
  expression: `($metrics := $[$[0] in ["jvm_memory_pool_bytes_used", "jvm_memory_pool_bytes_committed"]].[ { "metric": $[0], "label": $[1], "value": $[2] } ]; $map($distinct($metrics.label), function($l) { ($used := $metrics[label = $l and metric = "jvm_memory_pool_bytes_used"].value; $committed := $metrics[label = $l and metric = "jvm_memory_pool_bytes_committed"].value; [$l, $used ?  $used : "-1", $committed ?  $committed : -1]) }))`,
  columns: [
    { id: "Pool" as ColumnId, type: ColumnType.LABEL },
    { id: "Used" as ColumnId, type: ColumnType.NUMBER },
    { id: "Committed" as ColumnId, type: ColumnType.NUMBER },
  ],
}));

export default page("ModelMesh Metrics",
  html(`<p>Model Mesh Metrics</p> <hr />`),

  columns([3, 3, 3, 3],
    [
      metric({
        lookup: lookup("metrics",
          filterBy("metric", "EQUALS_TO", "modelmesh_models_managed_total"),
          groupBy(null, col("value"))),
        title: "Managed Models",
        html: { template: cardTemplate },
      }),
    ],
    [
      metric({
        lookup: lookup("metrics",
          filterBy("metric", "EQUALS_TO", "modelmesh_models_with_failure_total"),
          groupBy(null, col("value"))),
        title: "Models with Failure",
        html: { template: cardTemplate },
      }),
    ],
    [
      metric({
        lookup: lookup("metrics",
          filterBy("metric", "EQUALS_TO", "modelmesh_loadmodel_milliseconds_sum"),
          groupBy(null, col("value"))),
        title: "Load Model (ms)",
        html: { template: cardTemplate },
      }),
    ],
    [
      metric({
        lookup: lookup("metrics",
          filterBy("metric", "EQUALS_TO", "modelmesh_loaded_model_size_bytes_sum"),
          groupBy(null, col("value"))),
        title: "Models Size (kb)",
        html: { template: cardTemplate },
      }),
    ]
  ),

  html("<hr />"),

  html(`<p style="font-size: 25px; font-weight: 600"> JVM Memory </p>`),

  barChart({
    lookup: lookup("jvm_memory",
      groupBy("Pool", col("Pool"), col("Used"), col("Committed"))),
    resizable: true,
    height: "400",
    grid: { x: false },
  }),
  {
    properties: {
      modelMeshMetricsUrl: "metrics",
      titleFontSize: "40px",
    },
    datasets: [metricsDs, requestResponseSizeDs, jvmMemoryDs],
  }
);
