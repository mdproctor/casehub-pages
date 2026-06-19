import { page, barChart, table, inlineDataset } from "@casehub/ui";
import { createLookup } from "@casehub/data";

const histogramExpression = `
(
  $n := 1 + $count($) ~> $sqrt ~> $floor;
  $s := $max($) / $n;
  $t := $;
  [0..$n].(
    $lt := $s * $;
    $gt := ($ + 1) * $s;
    [[ $lt & "-" & $gt, $map($t, function($v) { $v >= $lt and $v < $gt ? 1 : 0}) ~> $sum]]
  )
)
`;

const rawData = JSON.stringify([
  5, 6, 7, 10, 3, 5, 11, 20, 6, 10, 5, 17,
  13, 22, 13, 50, 2, 4, 6, 10, 12, 5, 8, 10
]);

inlineDataset("histogram", rawData, {
  expression: histogramExpression
});

const extraConfig = {
  series: {
    barCategoryGap: "1%"
  }
};

export default page(
  barChart({
    extraConfiguration: JSON.stringify(extraConfig),
    lookup: createLookup("histogram", [])
  }),
  table({
    lookup: createLookup("histogram", [])
  })
);
