import { page, table, lineChart, barChart, rows, columns, inlineDataset } from "@casehubio/ui";
import { createLookup, filterOp, sortOp } from "@casehubio/data";

const globalData = JSON.stringify([
  ["A", 3],
  ["B", 2],
  ["C", 1],
  ["D", 0],
  ["E", -1],
  ["F", -2],
  ["G", -3]
]);

inlineDataset("global", globalData);

const baseOps = [
  filterOp("Column 1", "GREATER_THAN", [-3]),
  filterOp("Column 1", "LOWER_THAN", [3]),
  sortOp("Column 0", "DESCENDING")
];

export default page(
  rows(
    columns(
      [12],
      [
        table({
          resizable: true,
          lookup: createLookup("global", [...baseOps], { rowCount: 3 })
        })
      ]
    ),
    columns(
      [4],
      [
        lineChart({
          title: "Global Lookup with all rows",
          resizable: true,
          lookup: createLookup("global", [...baseOps], { rowCount: 10 })
        })
      ],
      [4],
      [
        barChart({
          title: "Values > 0",
          resizable: true,
          lookup: createLookup("global", [
            ...baseOps,
            filterOp("Column 1", "GREATER_THAN", [0])
          ])
        })
      ],
      [4],
      [
        barChart({
          subtype: "bar",
          title: "Values < 0",
          resizable: true,
          lookup: createLookup("global", [
            ...baseOps,
            filterOp("Column 1", "LOWER_THAN", [0])
          ])
        })
      ]
    )
  )
);
