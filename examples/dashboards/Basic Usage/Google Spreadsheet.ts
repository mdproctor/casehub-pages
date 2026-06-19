import { page, selector, barChart, dataset } from "@casehub/ui";
import { createLookup, groupOp } from "@casehub/data";

const sheetId = "1XuyPTyrjMFXQ1ey6Bg9AEcrpwZ60CnLQVEs4-DEDrcc";

dataset(
  "sheet",
  `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv`
);

export default page(
  selector({
    filter: { notification: true },
    lookup: createLookup("sheet", [])
  }),
  barChart({
    filter: { listening: true },
    lookup: createLookup("sheet", [
      groupOp("A", [
        { source: "A" },
        { source: "B", function: "SUM" },
        { source: "C", function: "SUM" }
      ])
    ])
  })
);
