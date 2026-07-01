import { page, html, mapChart, rows, columns, inlineDataset } from "@casehubio/ui";
import { createLookup, groupOp } from "@casehubio/data";

// Dataset
const countriesData = JSON.stringify([
  ["Brazil", 6],
  ["USA", 3],
  ["China", 5],
  ["India", 5],
  ["Russia", 6],
  ["Canada", 6],
  ["Australia", 9],
  ["Mali", 4],
  ["South Africa", 11]
]);

inlineDataset("countries", countriesData, {
  columns: [
    { id: "Country", type: "LABEL" },
    { id: "Value", type: "NUMBER" }
  ]
});

function countryLookup() {
  return createLookup("countries", [
    groupOp("Country", [
      { source: "Country" },
      { source: "Value" }
    ])
  ]);
}

export default page(
  rows(
    columns(
      [6],
      [
        html("<h4><strong>subtype MAP_REGIONS (default)</strong></h4><br />"),
        mapChart({
          resizable: true,
          lookup: countryLookup()
        })
      ],
      [6],
      [
        html("<h4><strong>subtype MAP_MARKERS</strong></h4><br />"),
        mapChart({
          subtype: "markers",
          resizable: true,
          lookup: countryLookup()
        })
      ]
    )
  )
);
