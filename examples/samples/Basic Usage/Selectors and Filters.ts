import {
  page, html, selector, barChart, table, tabs, inlineDataset
} from "@casehubio/ui";
import { createLookup, groupOp } from "@casehubio/data";

// Dataset
const productsData = JSON.stringify([
  ["Computers", "Scanner", 5, 3],
  ["Computers", "Printer", 7, 4],
  ["Computers", "Laptop", 3, 2],
  ["Electronics", "Camera", 10, 7],
  ["Electronics", "Headphones", 5, 9]
]);

inlineDataset("products", productsData, {
  columns: [
    { id: "Section", type: "LABEL" },
    { id: "Product", type: "LABEL" },
    { id: "Quantity", type: "NUMBER" },
    { id: "Quantity2", type: "NUMBER" }
  ]
});

function sectionLookup() {
  return createLookup("products", [
    groupOp("Section", [
      { source: "Section" }
    ])
  ]);
}

function selectorsPage() {
  return [
    html(`<p>Melviz Displayers can filter each other. For filtering only we have selectors components. You can enable filter using the filter section, the component that filter others:<br /> <pre> filter:
    notification: true</pre>
</p><p>
  Then on the component that will be filtered:<pre>
filter:
    listening: true</pre>
</p>`),
    html("<strong> Default Selector </strong>"),
    selector({
      filter: { enabled: true, notification: true, listening: false, selfapply: false },
      lookup: sectionLookup()
    }),
    html("<br /><strong>subtype SELECTOR_LABELS (used only with LABEL column types)</strong>"),
    selector({
      subtype: "labels",
      filter: { notification: true },
      lookup: sectionLookup()
    }),
    barChart({
      filter: { listening: true },
      resizable: true,
      lookup: createLookup("products", [
        groupOp("Product", [
          { source: "Product" },
          { source: "Quantity" },
          { source: "Quantity2" }
        ])
      ])
    })
  ];
}

function filterWithChartPage() {
  return [
    selector({
      filter: { enabled: true, notification: true },
      lookup: sectionLookup()
    }),
    barChart({
      filter: { listening: true },
      resizable: true,
      lookup: createLookup("products", [
        groupOp("Product", [
          { source: "Product" },
          { source: "Quantity", function: "SUM" },
          { source: "Quantity2", function: "SUM" }
        ])
      ])
    })
  ];
}

function filterWithTablePage() {
  return [
    selector({
      subtype: "labels",
      filter: { notification: true },
      lookup: sectionLookup()
    }),
    table({
      filter: { listening: true },
      lookup: createLookup("products", [])
    })
  ];
}

export default page(
  tabs(
    ["Selectors", selectorsPage()],
    ["Filter with Chart", filterWithChartPage()],
    ["Filter with Table", filterWithTablePage()]
  )
);
