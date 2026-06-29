import {
  page,
  site,
  pills,
  tree,
  tabs,
  menu,
  sidebar,
  tiles,
  carousel,
  accordion,
  appGrid,
  html,
  metric,
  barChart,
  lineChart,
  pieChart,
  table,
  inlineDataset,
} from "@casehubio/ui";
import { createLookup } from "@casehubio/data";
import type { DataSetId } from "@casehubio/data";

// TypeScript companion to "Navigation Rebinding.dash.yml"
// Same three-level content hierarchy, different navigation wrappers — switch pills to compare

const sales = "sales" as DataSetId;
const inventory = "inventory" as DataSetId;
const errors = "errors" as DataSetId;
const latency = "latency" as DataSetId;
const reportRuns = "report-runs" as DataSetId;

// Datasets
const salesDataset = inlineDataset("sales",
  JSON.stringify([
    ["North", "Q1", 45000, 52],
    ["North", "Q2", 48000, 55],
    ["South", "Q1", 38000, 45],
    ["South", "Q2", 41000, 48],
    ["East", "Q1", 51000, 60],
    ["East", "Q2", 54000, 63],
    ["West", "Q1", 42000, 49],
    ["West", "Q2", 45000, 52],
  ]),
  {
    columns: [
      { id: "Region", type: "LABEL" },
      { id: "Quarter", type: "LABEL" },
      { id: "Revenue", type: "NUMBER" },
      { id: "Orders", type: "NUMBER" },
    ],
  },
);

const inventoryDataset = inlineDataset("inventory",
  JSON.stringify([
    ["Laptops", 340, 400, 85],
    ["Monitors", 520, 600, 87],
    ["Keyboards", 780, 800, 98],
    ["Mice", 890, 900, 99],
    ["Headsets", 210, 300, 70],
  ]),
  {
    columns: [
      { id: "Item", type: "LABEL" },
      { id: "Stock", type: "NUMBER" },
      { id: "Capacity", type: "NUMBER" },
      { id: "Utilization", type: "NUMBER" },
    ],
  },
);

const errorsDataset = inlineDataset("errors",
  JSON.stringify([
    ["Login", 12],
    ["Payment", 8],
    ["Search", 5],
    ["Checkout", 15],
    ["Profile", 3],
  ]),
  {
    columns: [
      { id: "Metric", type: "LABEL" },
      { id: "Count", type: "NUMBER" },
    ],
  },
);

const latencyDataset = inlineDataset("latency",
  JSON.stringify([
    ["API Gateway", 45],
    ["Auth Service", 120],
    ["Database", 320],
    ["Cache", 5],
    ["CDN", 15],
  ]),
  {
    columns: [
      { id: "Component", type: "LABEL" },
      { id: "Latency", type: "NUMBER" },
    ],
  },
);

const reportRunsDataset = inlineDataset("report-runs",
  JSON.stringify([
    ["Sales Q2 Summary", "2026-06-21 08:00", "Completed", 2140],
    ["Ops Weekly Digest", "2026-06-20 23:00", "Completed", 4520],
    ["Revenue Forecast", "2026-06-20 18:30", "Completed", 8930],
    ["Inventory Alert", "2026-06-20 12:00", "Failed", 0],
    ["Customer Churn", "2026-06-19 09:00", "Completed", 5670],
    ["Pipeline Health", "2026-06-19 06:00", "Completed", 3100],
    ["Monthly KPIs", "2026-06-18 00:00", "Completed", 12400],
    ["SLA Compliance", "2026-06-17 23:00", "Completed", 6780],
  ]),
  {
    columns: [
      { id: "Report", type: "LABEL" },
      { id: "RunTime", type: "LABEL" },
      { id: "Status", type: "LABEL" },
      { id: "Duration", type: "NUMBER" },
    ],
  },
);

// Shared content pages (three-level hierarchy)
const dashboardPage = page("Dashboard",
  metric({
    title: "Total Revenue",
    pattern: "$#,##0",
    lookup: createLookup(sales, [
      { type: "GROUP", functions: [{ source: "Revenue", function: "SUM" }] },
    ]),
  }),
  metric({
    title: "Total Orders",
    pattern: "#,##0",
    lookup: createLookup(sales, [
      { type: "GROUP", functions: [{ source: "Orders", function: "SUM" }] },
    ]),
  }),
  barChart({
    title: "Revenue by Region",
    lookup: createLookup(sales, []),
    chart: { resizable: true, height: 300 },
  }),
);

const inventoryPage = page("Inventory",
  table({
    lookup: createLookup(inventory, []),
  }),
);

const reportsPage = page("Reports",
  table({
    lookup: createLookup(reportRuns, []),
  }),
  page("Errors",
    pieChart({
      title: "Error Distribution",
      lookup: createLookup(errors, []),
      chart: { resizable: true, height: 300 },
    }),
  ),
  page("Performance",
    lineChart({
      title: "Latency by Component",
      lookup: createLookup(latency, []),
      chart: { resizable: true, height: 300 },
    }),
  ),
);

// Navigation variants
const treeView = page("Tree View",
  tree(
    ["Dashboard", dashboardPage],
    ["Inventory", inventoryPage],
    ["Reports", reportsPage],
  ),
);

const tabsView = page("Tabs View",
  tabs(
    ["Dashboard", dashboardPage],
    ["Inventory", inventoryPage],
    ["Reports", reportsPage],
  ),
);

const menuView = page("Menu View",
  menu(
    ["Dashboard", dashboardPage],
    ["Inventory", inventoryPage],
    ["Reports", reportsPage],
  ),
);

const sidebarView = page("Sidebar View",
  sidebar(
    ["Dashboard", dashboardPage],
    ["Inventory", inventoryPage],
    ["Reports", reportsPage],
  ),
);

const tilesView = page("Tiles View",
  tiles(
    ["Dashboard", dashboardPage],
    ["Inventory", inventoryPage],
    ["Reports", reportsPage],
  ),
);

const carouselView = page("Carousel View",
  carousel(
    ["Dashboard", dashboardPage],
    ["Inventory", inventoryPage],
    ["Reports", reportsPage],
  ),
);

const accordionView = page("Accordion View",
  accordion(
    ["Dashboard", dashboardPage],
    ["Inventory", inventoryPage],
    ["Reports", reportsPage],
  ),
);

const appGridView = page("App Grid View",
  appGrid(
    ["Dashboard", dashboardPage],
    ["Inventory", inventoryPage],
    ["Reports", reportsPage],
  ),
);

// Top-level selector
export default site(
  page("index",
    html(
      `<div style="padding: 12px 20px; background: linear-gradient(135deg, #1a1a2e, #16213e); color: #e0e0e0; margin-bottom: 16px; border-radius: 8px">
        <strong style="font-size: 1.3em">Navigation Rebinding</strong>
        <span style="margin-left: 12px; opacity: 0.7">Same three-level content hierarchy, different navigation wrappers — switch pills to compare</span>
      </div>`
    ),
    pills(
      ["Tree View", treeView],
      ["Tabs View", tabsView],
      ["Menu View", menuView],
      ["Sidebar View", sidebarView],
      ["Tiles View", tilesView],
      ["Carousel View", carouselView],
      ["Accordion View", accordionView],
      ["App Grid View", appGridView],
    ),
  ),
  {
    datasets: [salesDataset, inventoryDataset, errorsDataset, latencyDataset, reportRunsDataset],
    displayer: {
      chart: { resizable: true, height: 300 },
    },
  },
);
