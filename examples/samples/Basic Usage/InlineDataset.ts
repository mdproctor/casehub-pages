import { page, barChart } from "@casehubio/ui";

export default page(
  barChart({
    title: "Hello World",
    dataSet: '["Hello World", 42]'
  })
);
