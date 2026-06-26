import {
  page,
  grid,
  at,
  panel,
  selector,
  pieChart,
  barChart,
  scatterChart,
  table,
  inlineDataset,
  lookup,
  groupBy,
  sortBy,
  col,
  avg,
  count,
} from "@casehubio/ui";
import type { DataSetId, ColumnId } from "@casehubio/data";

// TypeScript companion to "Workforce Analytics.dash.yaml"
// Single-page grid layout with workforce analytics - first example using grid()/at()/panel()

const employees = "employees" as DataSetId;

const employeeDataset = inlineDataset(
  "employees",
  JSON.stringify([
    [1, "Emma Wilson", "Engineering", "Senior", 5.2, 125000, 4, "London", "F", "2021-03-15"],
    [2, "James Chen", "Engineering", "Lead", 7.8, 155000, 5, "London", "M", "2018-09-01"],
    [3, "Sofia Rodriguez", "Product", "Mid", 2.1, 85000, 3, "New York", "F", "2024-05-20"],
    [4, "Amir Patel", "Engineering", "Junior", 0.8, 65000, 3, "London", "M", "2025-10-10"],
    [5, "Li Wei", "Design", "Senior", 6.3, 115000, 4, "Singapore", "M", "2020-04-01"],
    [6, "Priya Sharma", "Marketing", "Mid", 3.5, 78000, 4, "London", "F", "2023-01-15"],
    [7, "Tom Baker", "Sales", "Director", 12.0, 180000, 5, "New York", "M", "2014-06-01"],
    [8, "Yuki Tanaka", "Engineering", "Senior", 4.9, 130000, 4, "Singapore", "F", "2021-08-15"],
    [9, "Maria Santos", "HR", "Mid", 3.2, 72000, 3, "London", "F", "2023-04-20"],
    [10, "David Kim", "Engineering", "Mid", 2.5, 95000, 3, "New York", "M", "2024-01-08"],
    [11, "Anna Müller", "Finance", "Lead", 8.1, 145000, 5, "London", "F", "2018-05-15"],
    [12, "Carlos Ruiz", "Operations", "Senior", 5.5, 105000, 4, "New York", "M", "2021-01-10"],
    [13, "Sarah O'Brien", "Product", "Lead", 6.7, 140000, 4, "London", "F", "2019-11-01"],
    [14, "Raj Gupta", "Engineering", "Junior", 1.0, 62000, 2, "Singapore", "M", "2025-06-15"],
    [15, "Emily Chang", "Design", "Mid", 3.8, 88000, 4, "New York", "F", "2022-09-01"],
    [16, "Michael Brown", "Sales", "Senior", 5.0, 110000, 3, "London", "M", "2021-06-20"],
    [17, "Fatima Al-Rashid", "Engineering", "Senior", 4.2, 128000, 5, "London", "F", "2022-04-01"],
    [18, "Lucas Martin", "Marketing", "Junior", 0.5, 52000, 3, "New York", "M", "2026-01-15"],
    [19, "Mei Lin", "Engineering", "Director", 10.5, 195000, 5, "Singapore", "F", "2016-02-01"],
    [20, "Patrick Kelly", "Operations", "Mid", 2.8, 76000, 3, "London", "M", "2023-08-10"],
    [21, "Olga Ivanova", "Finance", "Senior", 4.5, 118000, 4, "London", "F", "2022-01-20"],
    [22, "Hassan Ahmed", "Engineering", "Mid", 3.0, 98000, 4, "London", "M", "2023-06-01"],
    [23, "Julia Costa", "Product", "Junior", 0.7, 58000, 3, "New York", "F", "2025-11-15"],
    [24, "Ben Thompson", "Design", "Lead", 7.2, 138000, 5, "London", "M", "2019-03-01"],
    [25, "Ling Zhang", "Engineering", "Senior", 5.8, 132000, 4, "Singapore", "NB", "2020-10-15"],
    [26, "Grace Okafor", "HR", "Senior", 6.0, 95000, 4, "New York", "F", "2020-06-01"],
    [27, "Alex Rivera", "Sales", "Mid", 2.3, 82000, 3, "London", "NB", "2024-03-10"],
    [28, "Nina Kowalski", "Marketing", "Senior", 4.8, 98000, 4, "London", "F", "2021-09-01"],
    [29, "Oscar Eriksson", "Engineering", "Lead", 8.5, 160000, 5, "London", "M", "2018-01-15"],
    [30, "Amara Diallo", "Operations", "Junior", 0.9, 55000, 2, "New York", "F", "2025-08-01"],
    [31, "Ryan Mitchell", "Finance", "Mid", 2.6, 82000, 3, "London", "M", "2023-11-15"],
    [32, "Sakura Hayashi", "Design", "Junior", 1.2, 60000, 3, "Singapore", "F", "2025-04-20"],
    [33, "Daniel Murphy", "Engineering", "Junior", 1.5, 68000, 4, "New York", "M", "2025-01-10"],
    [34, "Isabel Ferreira", "Product", "Senior", 5.3, 120000, 4, "London", "F", "2021-02-15"],
    [35, "Kevin Ng", "Sales", "Lead", 9.0, 165000, 5, "Singapore", "M", "2017-08-01"],
    [36, "Zara Hussein", "HR", "Junior", 0.4, 48000, 3, "London", "F", "2026-02-10"],
    [37, "Pierre Leclerc", "Marketing", "Lead", 7.0, 130000, 4, "New York", "M", "2019-05-15"],
    [38, "Tanya Reddy", "Engineering", "Mid", 2.9, 96000, 3, "Singapore", "F", "2023-07-01"],
    [39, "Chris Anderson", "Operations", "Lead", 8.3, 140000, 5, "London", "M", "2018-03-20"],
    [40, "Elena Popov", "Finance", "Junior", 1.1, 56000, 2, "London", "F", "2025-05-01"],
  ]),
  {
    columns: [
      { id: "id" as ColumnId, type: "NUMBER" },
      { id: "name" as ColumnId, type: "TEXT" },
      { id: "department" as ColumnId, type: "LABEL" },
      { id: "level" as ColumnId, type: "LABEL" },
      { id: "tenure" as ColumnId, type: "NUMBER" },
      { id: "salary" as ColumnId, type: "NUMBER" },
      { id: "rating" as ColumnId, type: "NUMBER" },
      { id: "location" as ColumnId, type: "LABEL" },
      { id: "gender" as ColumnId, type: "LABEL" },
      { id: "startDate" as ColumnId, type: "DATE" },
    ],
  }
);

export default page(
  { displayer: { chart: { resizable: true } } },
  [employeeDataset],
  [
    grid(
      3,
      // Row 0: Department selector (full width)
      at(
        0,
        0,
        3,
        1,
        selector({
          subtype: "labels",
          filter: { enabled: true, notification: true },
          lookup: lookup(employees, groupBy("department", col("department"))),
        })
      ),

      // Row 1: Three panels
      at(
        0,
        1,
        1,
        1,
        panel(
          "Headcount",
          pieChart({
            subtype: "donut",
            filter: { listening: true },
            lookup: lookup(
              employees,
              groupBy("department", col("department"), count("department"))
            ),
          })
        )
      ),
      at(
        1,
        1,
        1,
        1,
        panel(
          "Level Distribution",
          barChart({
            subtype: "column-stacked",
            filter: { listening: true },
            lookup: lookup(employees, groupBy("level", col("level"), count("level"))),
          })
        )
      ),
      at(
        2,
        1,
        1,
        1,
        panel(
          "Avg Salary by Level",
          barChart({
            subtype: "bar",
            filter: { listening: true },
            chart: { margin: { left: 80 } },
            lookup: lookup(
              employees,
              sortBy("Salary" as ColumnId, "ASCENDING"),
              groupBy("level", col("level"), {
                kind: "aggregate" as const,
                sourceId: "salary" as ColumnId,
                columnId: "Salary" as ColumnId,
                fn: Object.freeze({ fn: "AVERAGE" as const }),
              })
            ),
          })
        )
      ),

      // Row 2: Scatter (wide) + Pie
      at(
        0,
        2,
        2,
        1,
        panel(
          "Tenure vs Salary",
          scatterChart({
            filter: { listening: true },
            lookup: lookup(
              employees,
              groupBy("name", col("name"), col("tenure"), col("salary"))
            ),
          })
        )
      ),
      at(
        2,
        2,
        1,
        1,
        panel(
          "Rating Distribution",
          pieChart({
            filter: { listening: true },
            lookup: lookup(employees, groupBy("rating", col("rating"), count("rating"))),
          })
        )
      ),

      // Row 3: Table (full width)
      at(
        0,
        3,
        3,
        1,
        table({
          table: { pageSize: 15, sortable: true },
          filter: { listening: true },
          csvExport: true,
          columns: [{ id: "salary" as ColumnId, pattern: "$#,###" }],
          lookup: lookup(employees),
        })
      )
    ),
  ]
);
