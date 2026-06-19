import { page, html, metric, lineChart, barChart, bubbleChart, table, columns, dataset } from "@casehub/ui";
import { createLookup } from "@casehub/data";
import type { DataSetId, ColumnId } from "@casehub/data";

// TypeScript companion to "FIFA 2022 Goals.dash.yaml"
// FIFA World Cup Qatar 2022 Goals Score Statistics

export default page(
  {
    GoalsFunction: "AVERAGE",
    SeriesColor: "cyan",
  },
  {
    mode: "dark",
    displayer: {
      extraConfiguration: `{ "color": "\${SeriesColor}" }`,
      axis: { y: { title: "AVG Goals" } },
      chart: { resizable: true, height: 300, grid: { y: false, x: false } },
      html: {
        html: `<div style="width: 95%;height: auto;margin-top:0px;margin-right:0px;margin-bottom:0px;margin-left:0px;">
<div class="pf-v5-c-card pf-m-compact pf-m-rounded">
<div class="pf-v5-c-card__title"><div class="pf-v5-c-title pf-m-2xl">\${value}</div></div>
<div class="pf-v5-c-card__footer">\${title}</div></div></div>`
      },
      export: { png: true },
    },
  },
  [
    dataset("fifa_matches" as DataSetId, "https://api.fifa.com/api/v3/calendar/matches?from=2022-11-20T00%3A00%3A00Z&to=2022-12-20T23%3A59%3A59Z&language=en&count=500&idSeason=255711", {
      cacheEnabled: true,
      // Complex JSONata expression transforms match data
      expression: `$.Results.[ ( $.MatchStatus = 0 ? [$.IdMatch, $.LocalDate = null ? "" : $.LocalDate, $toMillis($.LocalDate) ~>  $fromMillis('[D]-[M]-[Y]'), $toMillis($.LocalDate) ~>  $fromMillis('[H]:[m]'), $.Weather.Humidity != null ? $.Weather.Humidity : "-1", $.Weather.Temperature != null ? $.Weather.Temperature : "-1", $.Weather.WindSpeed != null ? $.Weather.WindSpeed :  "-1", $.Weather.TypeLocalized[0].Description != null ? $.Weather.TypeLocalized[0].Description :  "", $.Home.IdCountry != null ? $.Home.IdCountry : "", $.Home.ShortClubName != null ? $.Home.ShortClubName : "", $.HomeTeamScore != null ? $.HomeTeamScore : "-1", $.Away.IdCountry != null ? $.Away.IdCountry : "", $.Away.ShortClubName != null ? $.Away.ShortClubName : "", $.Away.Score != null ? $.Away.Score : "-1", $.Stadium.Name[0].Description, $.Stadium.CityName[0].Description, $.Attendance != null ? $.Attendance :  "-1", $.HomeTeamScore + $.AwayTeamScore, $join([$.Home.ShortClubName, $.Away.ShortClubName], ' vs ')] ) ]`,
      columns: [
        { id: "ID" as ColumnId, type: "LABEL" },
        { id: "Date" as ColumnId, type: "LABEL" },
        { id: "Day" as ColumnId, type: "LABEL" },
        { id: "Hour" as ColumnId, type: "LABEL" },
        { id: "Humidity" as ColumnId, type: "NUMBER" },
        { id: "Temperature" as ColumnId, type: "NUMBER" },
        { id: "WindSpeed" as ColumnId, type: "NUMBER" },
        { id: "Weather" as ColumnId, type: "LABEL" },
        { id: "Team 1 Country" as ColumnId, type: "LABEL" },
        { id: "Team 1 Name" as ColumnId, type: "LABEL" },
        { id: "Team 1 Score" as ColumnId, type: "NUMBER" },
        { id: "Team 2 Country" as ColumnId, type: "LABEL" },
        { id: "Team 2 Name" as ColumnId, type: "LABEL" },
        { id: "Team 2 Score" as ColumnId, type: "NUMBER" },
        { id: "Stadium Name" as ColumnId, type: "LABEL" },
        { id: "Stadium Location Name" as ColumnId, type: "LABEL" },
        { id: "Attendance" as ColumnId, type: "NUMBER" },
        { id: "Total Goals" as ColumnId, type: "NUMBER" },
        { id: "Match Name" as ColumnId, type: "LABEL" },
      ]
    }),
  ],
  [
    // Header
    html(`<p><p style="font-size: xx-large">FIFA World Cup Qatar 2022™</p><small>Goals Score Statistics</small><hr /></p>`),

    // Row: Four metric cards
    columns({ "margin-bottom": "100px", "margin-top": "50px" }, ["3", "3", "3", "3"],
      [
        metric({
          lookup: createLookup("fifa_matches" as DataSetId, [
            { type: "group", functions: [{ source: "Total Goals" as ColumnId, function: "SUM" }] }
          ]),
          general: { title: "Total Goals" },
          columns: [{ id: "Total Goals" as ColumnId, pattern: "#" }],
        })
      ],
      [
        metric({
          lookup: createLookup("fifa_matches" as DataSetId, [
            { type: "group", functions: [{ source: "Total Goals" as ColumnId, function: "AVERAGE" }] }
          ]),
          general: { title: "Average Goals by Match" },
        })
      ],
      [
        metric({
          lookup: createLookup("fifa_matches" as DataSetId, [
            { type: "group", functions: [{ source: "Temperature" as ColumnId, function: "AVERAGE" }] }
          ]),
          general: { title: "Average Temperature" },
        })
      ],
      [
        metric({
          lookup: createLookup("fifa_matches" as DataSetId, [
            { type: "group", functions: [{ source: "Attendance" as ColumnId, function: "AVERAGE" }] }
          ]),
          general: { title: "Average Attendance" },
        })
      ]
    ),

    // Row: Line and Bar charts
    columns({}, ["6", "6"],
      [
        lineChart({
          lookup: createLookup("fifa_matches" as DataSetId, [
            {
              type: "group",
              groupingKey: { sourceId: "Day" as ColumnId },
              functions: [
                { source: "Day" as ColumnId },
                { source: "Total Goals" as ColumnId, column: "Goals" as ColumnId, function: "${GoalsFunction}" }
              ]
            }
          ]),
          general: { title: "Goals by Day" },
          axis: { x: { labels_angle: 30 } },
        })
      ],
      [
        barChart({
          lookup: createLookup("fifa_matches" as DataSetId, [
            { type: "sort", column: "Goals" as ColumnId, order: "DESCENDING" },
            {
              type: "group",
              groupingKey: { sourceId: "Stadium Name" as ColumnId },
              functions: [
                { source: "Stadium Name" as ColumnId },
                { source: "Total Goals" as ColumnId, function: "${GoalsFunction}", column: "Goals" as ColumnId }
              ]
            }
          ]),
          general: { title: "Goals by Stadium" },
          axis: { x: { labels_angle: 15 } },
        })
      ]
    ),

    // Row: Bubble charts
    columns({ "margin-top": "20px" }, ["6", "6"],
      [
        bubbleChart({
          lookup: createLookup("fifa_matches" as DataSetId, [
            { type: "sort", column: "TOTAL MATCHES" as ColumnId, order: "ASCENDING" },
            {
              type: "group",
              groupingKey: { sourceId: "Weather" as ColumnId },
              functions: [
                { source: "Weather" as ColumnId },
                { source: "Total Goals" as ColumnId, function: "${GoalsFunction}", column: "Goals" as ColumnId },
                { source: "Weather" as ColumnId, function: "COUNT", column: "TOTAL MATCHES" as ColumnId },
                { source: "Weather" as ColumnId, function: "COUNT", column: "TOTAL MATCHES" as ColumnId }
              ]
            }
          ]),
          general: { title: "Goals by Weather", subtitle: "Bubble shows total matches" },
        })
      ],
      [
        bubbleChart({
          lookup: createLookup("fifa_matches" as DataSetId, [
            {
              type: "group",
              groupingKey: { sourceId: "Match Name" as ColumnId },
              functions: [
                { source: "Match Name" as ColumnId },
                { source: "Attendance" as ColumnId, column: "Attendance" as ColumnId },
                { source: "Total Goals" as ColumnId, column: "Goals" as ColumnId },
                { source: "Total Goals" as ColumnId, column: "Goals" as ColumnId }
              ]
            }
          ]),
          general: { title: "Goals by Attendance", subtitle: "Bubble shows total goals" },
          chart: { zoom: true },
          axis: { x: { labels_show: false }, y: { title: "Attendance" } },
        })
      ]
    ),

    // All Matches Table
    html(`<hr style="width: 2px; border: dashed 1px" /><p style="margin: 1px 10px 30px 10px; font-size: x-large"><strong>All Matches</strong></p>`),

    table({
      lookup: createLookup("fifa_matches" as DataSetId, [
        {
          type: "group",
          functions: [
            { source: "Temperature" as ColumnId },
            { source: "ID" as ColumnId },
            { source: "Date" as ColumnId },
            { source: "Team 1 Score" as ColumnId },
            { source: "Match Name" as ColumnId },
            { source: "Team 2 Score" as ColumnId },
            { source: "Weather" as ColumnId },
            { source: "Stadium Name" as ColumnId },
            { source: "Attendance" as ColumnId }
          ]
        }
      ]),
      chart: { resizable: true },
      columns: [
        { id: "Date" as ColumnId, expression: `new Date(value).toLocaleDateString() + " " + new Date(value).toLocaleTimeString()` },
        { id: "Team 1 Score" as ColumnId, pattern: "#" },
        { id: "Team 2 Score" as ColumnId, pattern: "#" }
      ],
    })
  ]
);
