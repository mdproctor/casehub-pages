import { page, html, barChart, inlineDataset } from "@casehub/ui";
import { createLookup, groupOp } from "@casehub/data";

const helloData = JSON.stringify([
  ["John", 33],
  ["Mark", 42],
  ["Mary", 29]
]);

inlineDataset("hello", helloData);

export default page(
  html("<h1>Person by Age</h1>"),
  barChart({
    resizable: true,
    lookup: createLookup("hello", [
      groupOp("Column 0", [
        { source: "Column 0" },
        { source: "Column 1" }
      ])
    ])
  })
);
