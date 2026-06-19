import { page, selector, barChart, inlineDataset } from "@casehub/ui";
import { createLookup, groupOp } from "@casehub/data";

const testData = JSON.stringify([
  ["Asia", "China", 1412],
  ["Asia", "Japan", 125],
  ["America", "US", 331],
  ["America", "Brazil", 220]
]);

inlineDataset("test", testData);

export default page(
  selector({
    subtype: "labels",
    filter: { enabled: true, notification: true },
    lookup: createLookup("test", [
      groupOp("Column 0", [
        { source: "Column 0" }
      ])
    ])
  }),
  barChart({
    margin: { left: 100 },
    filter: { enabled: true, listening: true },
    lookup: createLookup("test", [
      groupOp(null, [
        { source: "Column 1" },
        { source: "Column 2" }
      ])
    ])
  })
);
