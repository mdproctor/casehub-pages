import { page, html, barChart, table, inlineDataset } from "@casehubio/ui";
import { createLookup } from "@casehubio/data";
import type { DataSetId, ColumnId } from "@casehubio/data";

// TypeScript companion to "Most Spoken Languages.dash.yaml"
// Simple inline dataset example

export default page(
  {},
  {},
  [
    inlineDataset("langs" as DataSetId, JSON.stringify([
      ["English", "Hello World", 1132],
      ["Mandarin", "你好世界", 1117],
      ["Hindi", "नमस्ते दुनिया", 615],
      ["Spanish", "Hola Mundo", 534],
      ["French", "Bonjour le monde", 280]
    ]), {}),
  ],
  [
    html(`<p style="font-size: xx-large; margin-bottom: 30px"> Most spoken languages</p><hr style=""/>`),

    barChart({
      lookup: createLookup("langs" as DataSetId, [
        {
          type: "group",
          groupingKey: { sourceId: "Column 0" as ColumnId },
          functions: [
            { source: "Column 0" as ColumnId },
            { source: "Column 2" as ColumnId }
          ]
        }
      ]),
      chart: { resizable: true },
    }),

    table({
      lookup: createLookup("langs" as DataSetId, []),
      chart: { resizable: true },
    })
  ]
);
