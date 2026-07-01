import { page, html, markdown, barChart, table, columns, selector, tabs, div, withStyle, dataset } from "@casehubio/ui";
import { createLookup } from "@casehubio/data";
import type { DataSetId, ColumnId } from "@casehubio/data";

// TypeScript companion to "Podman Stats.dash.yaml"
// Podman container and image statistics dashboard with tabs and navigation

// Note: This dashboard uses navTree for navigation structure. In the TypeScript DSL,
// navigation would typically be configured separately or via a navigation builder.
// The YAML specifies:
// navTree:
//   root_items:
//     - id: podman_nav_group
//       type: GROUP
//       name: Podman Dashboard
//       children:
//         - page: Containers
//         - page: Images

export default page(
  {
    baseUrl: "http://localhost:8000",
  },
  {
    displayer: {
      chart: { resizable: true },
      table: { sort: { enabled: true } },
    },
  },
  [
    dataset("images" as DataSetId, "${baseUrl}/images/json", {
      expression: `$.[Id, Names[0], $fromMillis(Created * 1000), Size, Containers]`,
      columns: [
        { id: "ID" as ColumnId, type: "label" },
        { id: "name" as ColumnId, type: "label" },
        { id: "created" as ColumnId, type: "date" },
        { id: "size" as ColumnId, type: "number" },
        { id: "containers" as ColumnId, type: "number" },
      ]
    }),
    dataset("containers" as DataSetId, "${baseUrl}/containers/json?filters={%22status%22:%20[%22created%22,%22running%22,%22paused%22,%22exited%22]}", {
      expression: `$.[Id, Names[0], Image, $fromMillis(Created * 1000), State, Status]`,
      columns: [
        { id: "ID" as ColumnId, type: "label" },
        { id: "name" as ColumnId, type: "label" },
        { id: "image" as ColumnId, type: "label" },
        { id: "created" as ColumnId, type: "date" },
        { id: "State" as ColumnId, type: "label" },
        { id: "Status" as ColumnId, type: "label" },
      ]
    }),
  ],
  [
    // Index page (entry point)
    // Page name: "index"
    html(`<h1><strong>Podman Dashboard</strong></h1> <p> This is a dashboard to provide basic information about Podman</p> <p> It uses <a href="https://docs.podman.io/en/latest/_static/api.html">Podman REST API</a>, so make sure podman service is running on localhost on port 8000 with CORS enabled</p> <p> The following command starts the podman service: </p> <p><em>podman system service tcp:localhost:8000 --cors https://jesuino.github.io  -t 0 </em></strong></p>`),

    // Tabs navigation
    // Note: DSL would use tabs() with navGroupId and targetDivId
    tabs({ navGroupId: "podman_nav_group", targetDivId: "podman_tabs_div" }),

    div({ divId: "podman_tabs_div", width: "100%" }),

    // Images page (name: "Images")
    // Row 1: Two bar charts
    columns({}, ["6", "6"],
      [
        markdown("**Images by Size**"),
        barChart({
          subtype: "BAR",
          extraConfiguration: `"series": { "label": { "position": "top" } }`,
          lookup: createLookup("images" as DataSetId, [
            { type: "rowCount", count: 7 },
            {
              type: "group",
              groupingKey: { sourceId: "name" as ColumnId },
              functions: [
                { source: "name" as ColumnId },
                { source: "size" as ColumnId, column: "Total Size" as ColumnId }
              ]
            },
            { type: "sortOps", column: "Total Size" as ColumnId, sortOrder: "DESCENDING" }
          ]),
          chart: { height: "350", margin: { left: "120" } },
        })
      ],
      [
        markdown("**Containers by Image**"),
        barChart({
          subtype: "BAR",
          lookup: createLookup("images" as DataSetId, [
            { type: "rowCount", count: 7 },
            {
              type: "filter",
              column: "containers" as ColumnId,
              function: "GREATER_THAN",
              args: [0]
            },
            {
              type: "group",
              groupingKey: { sourceId: "name" as ColumnId },
              functions: [
                { source: "name" as ColumnId },
                { source: "containers" as ColumnId, column: "containers total" as ColumnId }
              ]
            },
            { type: "sort", column: "containers total" as ColumnId, sortOrder: "DESCENDING" }
          ]),
          chart: { width: "500", height: "350", margin: { left: "120" } },
          columns: [{ id: "containers total" as ColumnId, pattern: "#" }],
        })
      ]
    ),

    // Images table
    markdown("**Images List**"),
    table({
      lookup: createLookup("images" as DataSetId, []),
    }),

    // Containers page (name: "Containers")
    markdown("**Filters**"),
    withStyle({ "font-size": "small" }, html("")),

    // Filter selectors
    columns({}, ["2", "2"],
      [
        withStyle({ width: "200px" },
          selector({
            lookup: createLookup("containers" as DataSetId, [
              {
                type: "groupOps",
                groupingKey: { sourceId: "image" as ColumnId },
                functions: [{ source: "image" as ColumnId, column: "image" as ColumnId }]
              }
            ]),
            filter: { notification: "true" },
          })
        )
      ],
      [
        withStyle({ width: "200px" },
          selector({
            lookup: createLookup("containers" as DataSetId, [
              {
                type: "groupOps",
                groupingKey: { sourceId: "state" as ColumnId },
                functions: [{ source: "state" as ColumnId, column: "state" as ColumnId }]
              }
            ]),
            filter: { notification: true },
          })
        )
      ]
    ),

    // Container charts
    columns({ "margin-top": "20px" }, ["5", "6"],
      [
        withStyle({ "font-size": "medium" }, html("<strong>Containers by State</strong>")),
        barChart({
          subtype: "BAR",
          lookup: createLookup("containers" as DataSetId, [
            { type: "rowCount", count: 7 },
            {
              type: "group",
              groupingKey: { sourceId: "state" as ColumnId },
              functions: [
                { source: "state" as ColumnId },
                { source: "state" as ColumnId, function: "COUNT", column: "total" as ColumnId }
              ]
            }
          ]),
          filter: { listening: true },
          chart: { width: "500", height: "350", margin: { left: "70" } },
          columns: [{ id: "total" as ColumnId, pattern: "#" }],
        })
      ],
      [
        markdown("**Containers by Image**"),
        withStyle({ "font-size": "medium" }, html("")),
        barChart({
          subtype: "BAR",
          lookup: createLookup("containers" as DataSetId, [
            { type: "rowCount", count: 7 },
            {
              type: "group",
              groupingKey: { sourceId: "image" as ColumnId },
              functions: [
                { source: "image" as ColumnId },
                { source: "image" as ColumnId, function: "Count", column: "Total" as ColumnId }
              ]
            },
            { type: "sort", column: "Total" as ColumnId, sortOrder: "DESCENDING" }
          ]),
          filter: { listening: true },
          chart: { width: "500", height: "350", margin: { left: "120" } },
        })
      ]
    ),

    // Containers table
    withStyle({ size: "xl" }, html("")),
    // title("Containers List"),  // Alternatively
    table({
      lookup: createLookup("containers" as DataSetId, []),
    })
  ]
);

// Note: The YAML defines three named pages (index, Images, Containers) with a navigation tree.
// The TypeScript DSL as written here represents all components sequentially. A full translation
// would require multi-page support or a navigation API to properly separate these pages.
