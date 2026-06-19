import { page, barChart } from "@casehub/ui";

export default page(
  barChart({
    title: "Hello World",
    dataSet: '["Hello World", 42]'
  })
);
