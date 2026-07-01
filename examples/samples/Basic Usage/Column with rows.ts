import { page, barChart, pieChart, meter, html, inlineDataset, withStyle, columns, rows } from "@casehubio/ui";
import { createLookup } from "@casehubio/data";

inlineDataset("a", JSON.stringify([
  ["A", 1],
  ["B", 2],
  ["C", 3]
]));

export default page(
  rows(
    columns(
      [6],
      [
        withStyle(
          { border: "solid 1px" },
          barChart({
            height: 300,
            resizable: true,
            lookup: createLookup("a", [])
          })
        )
      ],
      [6],
      [
        rows(
          withStyle(
            { border: "solid 1px", margin: "1px" },
            columns(
              [12],
              [
                pieChart({
                  height: 150,
                  resizable: true,
                  lookup: createLookup("a", [])
                })
              ]
            )
          ),
          withStyle(
            { border: "solid 1px", margin: "1px" },
            columns(
              [12],
              [
                meter({
                  height: 150,
                  resizable: true,
                  lookup: createLookup("a", [])
                })
              ]
            )
          )
        )
      ]
    ),
    withStyle(
      { border: "solid blue" },
      columns(
        [12],
        [html("ROW 2")]
      )
    )
  )
);
