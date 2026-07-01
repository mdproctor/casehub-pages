import { page, html, metric, columns, dataset } from "@casehubio/ui";
import { createLookup } from "@casehubio/data";
import type { DataSetId, ColumnId } from "@casehubio/data";

// TypeScript companion to "Ansible Metrics.dash.yaml"
// Ansible Tower metrics summary dashboard

export default page(
  {
    token: "your token here",
    authorizationHeader: "Basic ${token}",
    towerUrl: "your tower url here",
    proxyUrl: "a proxy to make HTTP requests if CORS is not enabled",
    subTitlesStyle: "font-size: large; margin: 15px 0 10px 0",
  },
  {
    displayer: {
      lookup: { uuid: "metrics" as DataSetId },
      columns: [{ id: "value" as ColumnId, pattern: "#" }],
    },
  },
  [
    dataset("metrics" as DataSetId, "data/metrics", {
      // url: ${towerUrl}?metrics  (commented in original YAML)
      cacheEnabled: true,
      refreshTime: "1minute",
      columns: [
        { id: "metric" as ColumnId, type: "LABEL" },
        { id: "labels" as ColumnId, type: "LABEL" },
        { id: "Value" as ColumnId, type: "Number" },
      ],
      headers: {
        Authorization: "${authorizationHeader}",
        "Content-Type": "text/plain",
        "Target-Url": "${towerUrl}/api/v2/metrics/?metrics"
      }
    }),
  ],
  [
    // Header
    html(`<p><a href="\${towerUrl}" style="font-size: xx-large">Ansible Tower</a><small>Metrics Summary</small></p> <hr />`),

    // Access section
    html(`<p style="\${subTitlesStyle}">Access</p>`),

    columns({}, ["3", "3", "3", "3"],
      [
        metric({
          lookup: createLookup("metrics" as DataSetId, [
            { type: "filter", column: "metric" as ColumnId, function: "EQUALS_TO", args: ["awx_sessions_total"] },
            { type: "filter", column: "labels" as ColumnId, function: "EQUALS_TO", args: ['type="all"'] },
            { type: "group", functions: [{ source: "value" as ColumnId }] }
          ]),
          general: { title: "Active Sessions" },
        })
      ],
      [
        metric({
          lookup: createLookup("metrics" as DataSetId, [
            { type: "filter", column: "metric" as ColumnId, function: "EQUALS_TO", args: ["awx_users_total"] },
            { type: "group", functions: [{ source: "value" as ColumnId }] }
          ]),
          general: { title: "Users" },
        })
      ],
      [
        metric({
          lookup: createLookup("metrics" as DataSetId, [
            { type: "filter", column: "metric" as ColumnId, function: "EQUALS_TO", args: ["awx_teams_total"] },
            { type: "group", functions: [{ source: "value" as ColumnId }] }
          ]),
          general: { title: "Teams" },
        })
      ],
      [
        metric({
          lookup: createLookup("metrics" as DataSetId, [
            { type: "filter", column: "metric" as ColumnId, function: "EQUALS_TO", args: ["awx_organizations_total"] },
            { type: "group", functions: [{ source: "value" as ColumnId }] }
          ]),
          general: { title: "Organizations" },
        })
      ]
    ),

    // Resources section
    html(`<p style="\${subTitlesStyle}">Resources</p>`),

    columns({}, ["3", "3", "3", "3"],
      [
        metric({
          lookup: createLookup("metrics" as DataSetId, [
            { type: "filter", column: "metric" as ColumnId, function: "EQUALS_TO", args: ["awx_inventories_total"] },
            { type: "group", functions: [{ source: "value" as ColumnId }] }
          ]),
          general: { title: "Inventories" },
        })
      ],
      [
        metric({
          lookup: createLookup("metrics" as DataSetId, [
            { type: "filter", column: "metric" as ColumnId, function: "EQUALS_TO", args: ["awx_projects_total"] },
            { type: "group", functions: [{ source: "value" as ColumnId }] }
          ]),
          general: { title: "Projects" },
        })
      ],
      [
        metric({
          lookup: createLookup("metrics" as DataSetId, [
            { type: "filter", column: "metric" as ColumnId, function: "EQUALS_TO", args: ["awx_job_templates_total"] },
            { type: "group", functions: [{ source: "value" as ColumnId }] }
          ]),
          general: { title: "Job Templates" },
        })
      ],
      [
        metric({
          lookup: createLookup("metrics" as DataSetId, [
            { type: "filter", column: "metric" as ColumnId, function: "EQUALS_TO", args: ["awx_inventory_scripts_total"] },
            { type: "group", functions: [{ source: "value" as ColumnId }] }
          ]),
          general: { title: "Inventory Scripts" },
        })
      ]
    ),

    // Misc section
    html(`<p style="\${subTitlesStyle}">Misc</p>`),

    columns({}, ["3", "3", "3", "3"],
      [
        metric({
          lookup: createLookup("metrics" as DataSetId, [
            { type: "filter", column: "metric" as ColumnId, function: "EQUALS_TO", args: ["awx_running_jobs_total"] },
            { type: "group", functions: [{ source: "value" as ColumnId }] }
          ]),
          general: { title: "Running Jobs" },
        })
      ],
      [
        metric({
          lookup: createLookup("metrics" as DataSetId, [
            { type: "filter", column: "metric" as ColumnId, function: "EQUALS_TO", args: ["awx_pending_jobs_total"] },
            { type: "group", functions: [{ source: "value" as ColumnId }] }
          ]),
          general: { title: "Pending Jobs" },
        })
      ],
      [
        metric({
          lookup: createLookup("metrics" as DataSetId, [
            { type: "filter", column: "metric" as ColumnId, function: "EQUALS_TO", args: ["awx_hosts_total"] },
            { type: "filter", column: "labels" as ColumnId, function: "EQUALS_TO", args: ['type="all"'] },
            { type: "group", functions: [{ source: "value" as ColumnId }] }
          ]),
          general: { title: "All Hosts" },
        })
      ],
      [
        metric({
          lookup: createLookup("metrics" as DataSetId, [
            { type: "filter", column: "metric" as ColumnId, function: "EQUALS_TO", args: ["awx_hosts_total"] },
            { type: "filter", column: "labels" as ColumnId, function: "EQUALS_TO", args: ['type="active"'] },
            { type: "group", functions: [{ source: "value" as ColumnId }] }
          ]),
          general: { title: "Active Hosts" },
        })
      ]
    ),

    columns({ "margin-top": "20px" }, ["3", "3", "3", "3"],
      [
        metric({
          lookup: createLookup("metrics" as DataSetId, [
            { type: "filter", column: "metric" as ColumnId, function: "EQUALS_TO", args: ["awx_schedules_total"] },
            { type: "group", functions: [{ source: "value" as ColumnId }] }
          ]),
          general: { title: "Schedules" },
        })
      ],
      [
        metric({
          lookup: createLookup("metrics" as DataSetId, [
            { type: "filter", column: "metric" as ColumnId, function: "EQUALS_TO", args: ["awx_custom_virtualenvs_total"] },
            { type: "group", functions: [{ source: "value" as ColumnId }] }
          ]),
          general: { title: "Virtual Envs" },
        })
      ],
      [
        metric({
          lookup: createLookup("metrics" as DataSetId, [
            { type: "filter", column: "metric" as ColumnId, function: "EQUALS_TO", args: ["awx_instance_capacity"] },
            { type: "group", functions: [{ source: "value" as ColumnId }] }
          ]),
          general: { title: "Instance Capacity" },
        })
      ],
      [
        metric({
          lookup: createLookup("metrics" as DataSetId, [
            { type: "filter", column: "metric" as ColumnId, function: "EQUALS_TO", args: ["awx_instance_remaining_capacity"] },
            { type: "group", functions: [{ source: "value" as ColumnId }] }
          ]),
          general: { title: "Remaining Capacity" },
        })
      ]
    )
  ]
);
