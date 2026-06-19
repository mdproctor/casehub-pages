import { page, table, barChart, inlineDataset } from "@casehub/ui";
import { createLookup } from "@casehub/data";

inlineDataset("test", "['ABC', 1]");

const globalColumns = [
  { id: "Column 0", expression: 'value + " - Global Change"' }
];

const localColumns = [
  { id: "Column 0", expression: 'value + " - Local Change"' }
];

export default page(
  table({
    height: 200,
    columns: globalColumns,
    lookup: createLookup("test", [])
  }),
  barChart({
    height: 200,
    columns: globalColumns,
    lookup: createLookup("test", [])
  }),
  table({
    height: 200,
    columns: localColumns,
    lookup: createLookup("test", [])
  })
);
