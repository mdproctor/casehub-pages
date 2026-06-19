import { page, barChart, inlineDataset } from "@casehub/ui";
import { createLookup, groupOp } from "@casehub/data";

inlineDataset("test", JSON.stringify([
  ["Hello", 20, 12],
  ["World", 10, 25]
]));

export default page(
  barChart({
    mode: "dark",
    resizable: true,
    lookup: createLookup("test", [
      groupOp("Column 0", [
        { source: "Column 0" },
        { source: "Column 1" },
        { source: "Column 2" }
      ])
    ])
  })
);
