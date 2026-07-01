import { page, title, barChart, table, dataset } from "@casehubio/ui";
import { createLookup } from "@casehubio/data";
import type { DataSetId, ColumnId } from "@casehubio/data";

// TypeScript companion to "Github Repositories.dash.yaml"
// Top GitHub repositories by stars

export default page(
  {},
  {
    displayer: {
      chart: { resizable: true },
      lookup: { uuid: "github_repos" as DataSetId },
    },
  },
  [
    dataset("github_repos" as DataSetId, "https://api.github.com/search/repositories?q=stars:>1&s=stars", {
      cacheEnabled: "true",
      refreshTime: "10minute",
      expression: `$.items.[name, stargazers_count, forks, watchers_count, open_issues, owner.login, created_at, language ? language : '-', description ]`,
      columns: [
        { id: "name" as ColumnId, type: "label" },
        { id: "stars" as ColumnId, type: "number" },
        { id: "forks" as ColumnId, type: "number" },
        { id: "watchers" as ColumnId, type: "number" },
        { id: "open_issues" as ColumnId, type: "number" },
        { id: "owner_login" as ColumnId, type: "label" },
        { id: "created" as ColumnId, type: "label" },
        { id: "language" as ColumnId, type: "label" },
        { id: "description" as ColumnId, type: "text" },
      ]
    }),
  ],
  [
    title("Top 10 GitHub Repositories by Stars"),

    barChart({
      lookup: createLookup("github_repos" as DataSetId, [
        { type: "rowCount", count: 10 },
        {
          type: "group",
          groupingKey: { sourceId: "name" as ColumnId },
          functions: [
            { source: "name" as ColumnId },
            { source: "stars" as ColumnId }
          ]
        }
      ]),
      axis: { x: { labels_angle: -10 } },
    }),

    title("List of top repositories by stars"),

    table({
      lookup: createLookup("github_repos" as DataSetId, []),
    })
  ]
);
