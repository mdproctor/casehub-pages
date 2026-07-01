import { page, iframePlugin, inlineDataset } from "@casehubio/ui";
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

const echartsOption = {
  toolbox: {
    feature: {
      dataZoom: {},
      magicType: {
        type: ["line", "bar", "stack"]
      },
      saveAsImage: {}
    }
  },
  series: [
    {
      type: "bar",
      markLine: {
        data: [{ type: "max" }]
      }
    },
    {
      type: "bar",
      markLine: {
        data: [{ type: "max" }]
      }
    }
  ]
};

export default page(
  iframePlugin({
    componentId: "echarts",
    width: "100%",
    height: "400px",
    properties: {
      "echarts.title": JSON.stringify({ text: "Products", left: "center" }),
      "echarts.option": JSON.stringify(echartsOption)
    },
    lookup: createLookup("products", [
      groupOp("product", [
        { source: "product" },
        { source: "quantity" },
        { source: "quantity2" }
      ])
    ])
  })
);
