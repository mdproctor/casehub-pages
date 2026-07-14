import { page, bind, restSource, selector, barChart, lookup, groupBy, col} from "@casehubio/pages-ui";
import { dataSetId } from "@casehubio/pages-data";

const sheetId = "1XuyPTyrjMFXQ1ey6Bg9AEcrpwZ60CnLQVEs4-DEDrcc";

const sheetDs = bind("sheet", restSource(`https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv`, dataSetId("sheet")));

export default page(
  "Google Spreadsheet",
  selector({
    filter: { notification: true },
    lookup: lookup("sheet", )
  }),
  barChart({
    filter: { listening: true },
    lookup: lookup("sheet", groupBy("A", col("A")))
  }),
  { datasets: [sheetDs] });
