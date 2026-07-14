import { page, bind, restSource, timeseries, lookup } from "@casehubio/pages-ui";
import { dataSetId } from "@casehubio/pages-data";

const timeseriesDs = bind("timeseries", restSource("data/sample_timeseries.json", dataSetId("timeseries")));

export default page("TimeSeries",
  timeseries({
    lookup: lookup("timeseries"),
    resizable: true,
  }),
  { datasets: [timeseriesDs] }
);
