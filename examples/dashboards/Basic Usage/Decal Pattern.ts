import { page, barChart, inlineDataset } from "@casehub/ui";
import { createLookup, groupOp } from "@casehub/data";

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

const extraConfig = {
  color: ["gray", "gray"],
  series: [
    {
      itemStyle: {
        decal: {
          symbol: "rectangle"
        }
      }
    },
    {
      itemStyle: {
        decal: {
          symbol: "pin"
        }
      }
    }
  ]
};

export default page(
  barChart({
    extraConfiguration: JSON.stringify(extraConfig),
    lookup: createLookup("products", [
      groupOp("Product", [
        { source: "Product" },
        { source: "Quantity", function: "SUM" },
        { source: "Quantity2", function: "SUM" }
      ])
    ])
  })
);
