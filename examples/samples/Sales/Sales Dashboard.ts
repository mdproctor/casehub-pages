import {
  page,
  sidebar,
  columns,
  metric,
  barChart,
  pieChart,
  lineChart,
  selector,
  table,
  inlineDataset,
  lookup,
  groupBy,
  groupByCalendar,
  filterBy,
  sortBy,
  col,
  sum,
  avg,
  count,
} from "@casehubio/ui";
import type { DataSetId, ColumnId } from "@casehubio/data";

// TypeScript companion to "Sales Dashboard.dash.yaml"
// 4-page sidebar dashboard with sales transactions and pipeline data

const salesTransactions = "sales_transactions" as DataSetId;
const pipeline = "pipeline" as DataSetId;

const salesDataset = inlineDataset(
  "sales_transactions",
  JSON.stringify([
    [1, "2025-07-15", "EMEA", "Sarah Chen", "CloudSync Pro", "Platform", 42000, 1, "Won"],
    [2, "2025-07-22", "APAC", "James Park", "DevOps Suite", "Platform", 38500, 1, "Won"],
    [3, "2025-08-03", "Americas", "Maria Garcia", "Support Basic", "Support", 2400, 12, "Lost"],
    [4, "2025-08-10", "EMEA", "Sarah Chen", "Consulting 5-day", "Services", 15000, 5, "Won"],
    [5, "2025-08-18", "ANZ", "Liam Walsh", "CloudSync Pro", "Platform", 39000, 1, "Lost"],
    [6, "2025-09-02", "Americas", "David Kim", "Support Premium", "Support", 4800, 6, "Won"],
    [7, "2025-09-14", "EMEA", "Anna Müller", "DevOps Suite", "Platform", 41000, 1, "Won"],
    [8, "2025-09-20", "APAC", "James Park", "Migration Workshop", "Services", 22000, 3, "Won"],
    [9, "2025-10-01", "Americas", "Maria Garcia", "CloudSync Pro", "Platform", 45000, 1, "Pending"],
    [10, "2025-10-08", "EMEA", "Thomas Dubois", "Support Basic", "Support", 1800, 9, "Lost"],
    [11, "2025-10-15", "ANZ", "Liam Walsh", "Consulting 5-day", "Services", 15000, 5, "Lost"],
    [12, "2025-10-28", "APAC", "Yuki Tanaka", "DevOps Suite", "Platform", 37500, 1, "Won"],
    [13, "2025-11-05", "Americas", "David Kim", "CloudSync Pro", "Platform", 44000, 1, "Won"],
    [14, "2025-11-12", "EMEA", "Sarah Chen", "Support Premium", "Support", 5200, 8, "Lost"],
    [15, "2025-11-19", "ANZ", "Liam Walsh", "Migration Workshop", "Services", 18000, 2, "Won"],
    [16, "2025-11-25", "APAC", "James Park", "CloudSync Pro", "Platform", 40000, 1, "Lost"],
    [17, "2025-12-03", "Americas", "Maria Garcia", "Consulting 10-day", "Services", 28000, 10, "Won"],
    [18, "2025-12-10", "EMEA", "Anna Müller", "Support Basic", "Support", 2100, 7, "Pending"],
    [19, "2025-12-15", "EMEA", "Thomas Dubois", "DevOps Suite", "Platform", 43000, 1, "Pending"],
    [20, "2025-12-22", "APAC", "Yuki Tanaka", "Support Premium", "Support", 3600, 4, "Won"],
    [21, "2026-01-08", "Americas", "David Kim", "CloudSync Pro", "Platform", 46000, 1, "Won"],
    [22, "2026-01-14", "ANZ", "Liam Walsh", "DevOps Suite", "Platform", 38000, 1, "Lost"],
    [23, "2026-01-20", "EMEA", "Sarah Chen", "Migration Workshop", "Services", 20000, 4, "Won"],
    [24, "2026-01-28", "APAC", "James Park", "Support Basic", "Support", 2400, 12, "Lost"],
    [25, "2026-02-04", "Americas", "Maria Garcia", "Consulting 5-day", "Services", 15000, 5, "Won"],
    [26, "2026-02-11", "EMEA", "Anna Müller", "CloudSync Pro", "Platform", 47000, 1, "Pending"],
    [27, "2026-02-18", "ANZ", "Liam Walsh", "Support Premium", "Support", 4200, 6, "Lost"],
    [28, "2026-02-25", "APAC", "Yuki Tanaka", "DevOps Suite", "Platform", 39500, 1, "Pending"],
    [29, "2026-03-05", "Americas", "David Kim", "Migration Workshop", "Services", 25000, 5, "Won"],
    [30, "2026-03-12", "EMEA", "Thomas Dubois", "Support Basic", "Support", 1500, 5, "Won"],
    [31, "2026-03-18", "EMEA", "Sarah Chen", "CloudSync Pro", "Platform", 48000, 1, "Won"],
    [32, "2026-03-25", "APAC", "James Park", "Consulting 10-day", "Services", 30000, 10, "Lost"],
    [33, "2026-04-02", "Americas", "Maria Garcia", "DevOps Suite", "Platform", 41500, 1, "Lost"],
    [34, "2026-04-10", "ANZ", "Liam Walsh", "CloudSync Pro", "Platform", 43000, 1, "Won"],
    [35, "2026-04-15", "EMEA", "Anna Müller", "Support Premium", "Support", 5800, 10, "Won"],
    [36, "2026-04-22", "APAC", "Yuki Tanaka", "Migration Workshop", "Services", 16000, 2, "Won"],
    [37, "2026-05-01", "Americas", "David Kim", "Support Basic", "Support", 2700, 9, "Won"],
    [38, "2026-05-08", "EMEA", "Thomas Dubois", "CloudSync Pro", "Platform", 44500, 1, "Pending"],
    [39, "2026-05-14", "ANZ", "Liam Walsh", "Consulting 5-day", "Services", 15000, 5, "Lost"],
    [40, "2026-05-20", "APAC", "James Park", "DevOps Suite", "Platform", 42000, 1, "Won"],
    [41, "2026-05-28", "Americas", "Maria Garcia", "Support Premium", "Support", 4800, 8, "Won"],
    [42, "2026-06-03", "EMEA", "Sarah Chen", "DevOps Suite", "Platform", 45000, 1, "Won"],
    [43, "2026-06-10", "EMEA", "Anna Müller", "Consulting 5-day", "Services", 15000, 5, "Lost"],
    [44, "2026-06-15", "APAC", "Yuki Tanaka", "CloudSync Pro", "Platform", 41000, 1, "Pending"],
    [45, "2026-06-20", "Americas", "David Kim", "DevOps Suite", "Platform", 43500, 1, "Won"],
    [46, "2025-08-25", "EMEA", "Thomas Dubois", "CloudSync Pro", "Platform", 40000, 1, "Won"],
    [47, "2025-09-28", "Americas", "Maria Garcia", "DevOps Suite", "Platform", 36000, 1, "Lost"],
    [48, "2025-11-02", "APAC", "Yuki Tanaka", "Support Basic", "Support", 1200, 4, "Won"],
    [49, "2025-12-28", "ANZ", "Liam Walsh", "CloudSync Pro", "Platform", 42500, 1, "Won"],
    [50, "2026-01-30", "EMEA", "Sarah Chen", "Support Basic", "Support", 2100, 7, "Won"],
    [51, "2026-02-28", "Americas", "David Kim", "CloudSync Pro", "Platform", 47500, 1, "Pending"],
    [52, "2026-03-30", "APAC", "James Park", "Support Premium", "Support", 3900, 6, "Lost"],
    [53, "2026-04-28", "EMEA", "Anna Müller", "Migration Workshop", "Services", 22000, 4, "Won"],
    [54, "2026-05-30", "ANZ", "Liam Walsh", "DevOps Suite", "Platform", 40000, 1, "Won"],
    [55, "2026-06-25", "Americas", "Maria Garcia", "CloudSync Pro", "Platform", 49000, 1, "Won"],
    [56, "2025-07-30", "APAC", "Yuki Tanaka", "Consulting 5-day", "Services", 15000, 5, "Lost"],
    [57, "2025-09-08", "ANZ", "Liam Walsh", "Support Basic", "Support", 1800, 6, "Lost"],
    [58, "2025-10-20", "EMEA", "Thomas Dubois", "Migration Workshop", "Services", 20000, 4, "Won"],
    [59, "2025-12-08", "Americas", "David Kim", "Consulting 10-day", "Services", 32000, 10, "Won"],
    [60, "2026-04-05", "APAC", "James Park", "CloudSync Pro", "Platform", 38500, 1, "Pending"],
  ]),
  {
    columns: [
      { id: "id" as ColumnId, type: "NUMBER" },
      { id: "date" as ColumnId, type: "DATE" },
      { id: "region" as ColumnId, type: "LABEL" },
      { id: "rep" as ColumnId, type: "LABEL" },
      { id: "product" as ColumnId, type: "LABEL" },
      { id: "category" as ColumnId, type: "LABEL" },
      { id: "amount" as ColumnId, type: "NUMBER" },
      { id: "quantity" as ColumnId, type: "NUMBER" },
      { id: "status" as ColumnId, type: "LABEL" },
    ],
  }
);

const pipelineDataset = inlineDataset(
  "pipeline",
  JSON.stringify([
    ["Acme Corp Migration", "Acme Corp", "Negotiation", 85000, 75, "Sarah Chen", "2026-07-15"],
    ["GlobalTech Platform", "GlobalTech Inc", "Proposal", 120000, 40, "David Kim", "2026-08-01"],
    ["StartupX DevOps", "StartupX", "Qualified", 35000, 25, "James Park", "2026-09-10"],
    ["MegaBank Support", "MegaBank", "Closed", 52000, 95, "Anna Müller", "2026-07-01"],
    ["HealthCo Cloud", "HealthCo", "Prospect", 95000, 10, "Maria Garcia", "2026-10-15"],
    ["RetailPro Consulting", "RetailPro", "Proposal", 28000, 50, "Thomas Dubois", "2026-08-20"],
    ["EduNet Platform", "EduNet", "Negotiation", 67000, 70, "Yuki Tanaka", "2026-07-30"],
    ["LogiMove Suite", "LogiMove", "Qualified", 43000, 30, "Liam Walsh", "2026-09-01"],
    ["DataVault Migration", "DataVault", "Prospect", 110000, 15, "Sarah Chen", "2026-11-01"],
    ["CityGov Support", "CityGov", "Proposal", 38000, 55, "David Kim", "2026-08-15"],
    ["MediaFlow DevOps", "MediaFlow", "Negotiation", 72000, 65, "James Park", "2026-07-25"],
    ["AgriTech Cloud", "AgriTech Co", "Closed", 48000, 90, "Maria Garcia", "2026-07-05"],
    ["FinServ Consulting", "FinServ Ltd", "Qualified", 55000, 20, "Anna Müller", "2026-09-20"],
    ["TravelEx Platform", "TravelEx", "Prospect", 88000, 5, "Yuki Tanaka", "2026-12-01"],
    ["BuildCo Support", "BuildCo", "Proposal", 31000, 45, "Liam Walsh", "2026-08-10"],
  ]),
  {
    columns: [
      { id: "deal" as ColumnId, type: "TEXT" },
      { id: "account" as ColumnId, type: "TEXT" },
      { id: "stage" as ColumnId, type: "LABEL" },
      { id: "value" as ColumnId, type: "NUMBER" },
      { id: "probability" as ColumnId, type: "NUMBER" },
      { id: "rep" as ColumnId, type: "LABEL" },
      { id: "closeDate" as ColumnId, type: "DATE" },
    ],
  }
);

export default page(
  { GoalsFunction: "SUM" },
  { displayer: { chart: { resizable: true } } },
  [salesDataset, pipelineDataset],
  [
    // Index page: Sidebar navigation
    sidebar({ navGroupId: "SalesNav" }),

    // === Page 1: Overview ===
    page(
      "Overview",
      // Row 1: Four metrics
      columns({}, ["3", "3", "3", "3"], [
        metric({
          lookup: lookup(
            salesTransactions,
            filterBy("status" as ColumnId, "EQUALS_TO", "Won"),
            groupBy(null, sum("amount"))
          ),
          general: { title: "Total Revenue" },
          columns: [{ id: "amount" as ColumnId, pattern: "$#,###" }],
        }),
      ], [
        metric({
          lookup: lookup(
            salesTransactions,
            filterBy("status" as ColumnId, "EQUALS_TO", "Won"),
            groupBy(null, count("amount"))
          ),
          general: { title: "Won Deals" },
          columns: [{ id: "amount" as ColumnId, pattern: "#" }],
        }),
      ], [
        metric({
          lookup: lookup(salesTransactions, groupBy(null, avg("amount"))),
          general: { title: "Avg Deal Size" },
          columns: [{ id: "amount" as ColumnId, pattern: "$#,###" }],
        }),
      ], [
        metric({
          lookup: lookup(salesTransactions, groupBy(null, count("amount"))),
          general: { title: "Total Deals" },
          columns: [{ id: "amount" as ColumnId, pattern: "#" }],
        }),
      ]),

      // Row 2: Stacked bar chart and donut
      columns({}, ["8", "4"], [
        barChart({
          subtype: "column-stacked",
          lookup: lookup(
            salesTransactions,
            filterBy("status" as ColumnId, "EQUALS_TO", "Won"),
            groupBy("region", col("region"), sum("amount"))
          ),
          general: { title: "Revenue by Region" },
          filter: { listening: true },
        }),
      ], [
        pieChart({
          subtype: "donut",
          lookup: lookup(
            salesTransactions,
            filterBy("status" as ColumnId, "EQUALS_TO", "Won"),
            groupBy("category", col("category"), sum("amount"))
          ),
          general: { title: "Revenue by Category" },
          filter: { listening: true },
        }),
      ]),

      // Row 3: Region selector with selfApply
      selector({
        subtype: "labels",
        lookup: lookup(salesTransactions, groupBy("region", col("region"))),
        filter: { selfApply: true, notification: true },
      }),

      // Row 4: Monthly revenue line chart and top reps bar chart
      columns({}, ["6", "6"], [
        lineChart({
          lookup: lookup(
            salesTransactions,
            filterBy("status" as ColumnId, "EQUALS_TO", "Won"),
            groupByCalendar("date", "MONTH", col("date"), sum("amount"))
          ),
          general: { title: "Monthly Revenue" },
          filter: { listening: true },
        }),
      ], [
        barChart({
          lookup: lookup(
            salesTransactions,
            filterBy("status" as ColumnId, "EQUALS_TO", "Won"),
            groupBy("rep", col("rep"), {
              kind: "aggregate" as const,
              sourceId: "amount" as ColumnId,
              columnId: "Revenue" as ColumnId,
              fn: Object.freeze({ fn: "SUM" as const }),
            }),
            sortBy("Revenue" as ColumnId, "DESCENDING")
          ),
          general: { title: "Top Reps" },
          filter: { listening: true },
        }),
      ])
    ),

    // === Page 2: Pipeline ===
    page(
      "Pipeline",
      // Row 1: Three metrics
      columns({}, ["4", "4", "4"], [
        metric({
          lookup: lookup(pipeline, groupBy(null, sum("value"))),
          general: { title: "Pipeline Value" },
          columns: [{ id: "value" as ColumnId, pattern: "$#,###" }],
        }),
      ], [
        metric({
          lookup: lookup(pipeline, groupBy(null, avg("probability"))),
          general: { title: "Avg Probability" },
          columns: [{ id: "probability" as ColumnId, pattern: "#" }],
        }),
      ], [
        metric({
          lookup: lookup(pipeline, groupBy(null, count("value"))),
          general: { title: "Active Deals" },
          columns: [{ id: "value" as ColumnId, pattern: "#" }],
        }),
      ]),

      // Row 2: Pipeline table
      table({
        lookup: lookup(pipeline),
        table: { pageSize: 10, sortable: true },
      }),

      // Row 3: Pipeline by stage (horizontal bar) and pipeline by rep (donut)
      columns({}, ["6", "6"], [
        barChart({
          subtype: "bar",
          lookup: lookup(pipeline, groupBy("stage", col("stage"), sum("value"))),
          general: { title: "Pipeline by Stage" },
          chart: { margin: { left: 100 } },
        }),
      ], [
        pieChart({
          subtype: "donut",
          lookup: lookup(pipeline, groupBy("rep", col("rep"), sum("value"))),
          general: { title: "Pipeline by Rep" },
        }),
      ])
    ),

    // === Page 3: Trends ===
    page(
      "Trends",
      // Row 1: Revenue trend (smooth line with zoom)
      lineChart({
        subtype: "smooth",
        lookup: lookup(
          salesTransactions,
          filterBy("status" as ColumnId, "EQUALS_TO", "Won"),
          groupByCalendar("date", "MONTH", col("date"), sum("amount"))
        ),
        general: { title: "Revenue Trend" },
        chart: { zoom: true },
      }),

      // Row 2: Quarterly revenue and category trend
      columns({}, ["6", "6"], [
        barChart({
          lookup: lookup(
            salesTransactions,
            filterBy("status" as ColumnId, "EQUALS_TO", "Won"),
            groupByCalendar("date", "QUARTER", col("date"), sum("amount"))
          ),
          general: { title: "Quarterly Revenue" },
        }),
      ], [
        barChart({
          subtype: "column-stacked",
          lookup: lookup(
            salesTransactions,
            filterBy("status" as ColumnId, "EQUALS_TO", "Won"),
            groupBy("category", col("category"), sum("amount"))
          ),
          general: { title: "Category Trend" },
        }),
      ])
    ),

    // === Page 4: Deals ===
    page(
      "Deals",
      table({
        lookup: lookup(salesTransactions),
        table: { pageSize: 15, sortable: true },
        filter: { enabled: true, notification: true },
        columns: [{ id: "amount" as ColumnId, pattern: "$#,###" }],
      })
    ),
  ]
);
