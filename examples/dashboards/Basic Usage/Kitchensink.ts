import {
  page, html, markdown, title, barChart, lineChart, areaChart, pieChart,
  bubbleChart, timeseries, table, metric, meter, selector, mapChart,
  iframePlugin, tabs, rows, columns, withStyle, textInput, numberInput,
  dropdown, inlineDataset, dataset
} from "@casehub/ui";
import { createLookup, groupOp } from "@casehub/data";

// Datasets
const productsData = JSON.stringify([
  ["Computers", "Scanner", 5, 3],
  ["Computers", "Printer", 7, 4],
  ["Computers", "Laptop", 3, 2],
  ["Electronics", "Camera", 10, 7],
  ["Electronics", "Headphones", 5, 9]
]);

inlineDataset("products", productsData, {
  columns: [
    { id: "Section", type: "LABEL" },
    { id: "Product", type: "LABEL" },
    { id: "Quantity", type: "NUMBER" },
    { id: "Quantity2", type: "NUMBER" }
  ]
});

const countriesData = JSON.stringify([
  ["Brazil", 6],
  ["USA", 3],
  ["China", 5],
  ["India", 5],
  ["Russia", 6],
  ["Canada", 6],
  ["Australia", 9],
  ["Mali", 4],
  ["South Africa", 11]
]);

inlineDataset("countries", countriesData, {
  columns: [
    { id: "Country", type: "LABEL" },
    { id: "Value", type: "NUMBER" }
  ]
});

const svgData = JSON.stringify([
  ["svg_1", 1],
  ["svg_2", 2],
  ["svg_3", 3],
  ["svg_4", 4],
  ["svg_5", 5],
  ["svg_6", 6]
]);

inlineDataset("svg-data", svgData, {
  columns: [
    { id: "id", type: "LABEL" },
    { id: "v", type: "NUMBER" }
  ]
});

const memoryData = JSON.stringify([
  ["Server 1", 2512],
  ["Server 2", 1900],
  ["Server 3", 3200],
  ["Server 4", 1200]
]);

inlineDataset("memory_usage", memoryData, {
  columns: [
    { id: "Server", type: "LABEL" },
    { id: "Usage", type: "NUMBER" }
  ]
});

dataset("timeseries", "https://raw.githubusercontent.com/jesuino/melviz-data/master/samples/timeseries.json");

// Main page with navigation
export default page(
  withStyle(
    {
      backgroundColor: "blue",
      opacity: "0.5",
      color: "white",
      fontWeight: "bolder",
      padding: "20px",
      marginBottom: "20px"
    },
    html('<strong style="font-size: xx-large; font-weight: bolder; font-family: sans-serif"> Melviz Components </strong><br />')
  ),

  // Main content tabs
  tabs(
    ["Displayers", displayersPage()],
    ["Layout", layoutPage()],
    ["HTML & CSS", htmlCssPage()],
    ["Data Sets", dataSetsPage()],
    ["External Components", externalComponentsPage()],
    ["Forms", formsPage()],
    ["Navigation", navigationPage()],
    ["Settings and Global", settingsPage()]
  )
);

function displayersPage() {
  return [
    withStyle(
      { marginBottom: "20px" },
      markdown(`Data can be displayed using *Displayers*. The usual charts types are supported and Melviz internally use [ECharts library](https://echarts.apache.org/en/index.html) to render them.`)
    ),
    tabs(
      ["Bar Chart", barChartExamples()],
      ["Line Chart", lineChartExamples()],
      ["Area Chart", areaChartExamples()],
      ["Pie Chart", pieChartExamples()],
      ["Bubble Chart", bubbleChartExample()],
      ["Meter", meterExample()],
      ["Metric", metricExamples()],
      ["Selectors", selectorsExample()],
      ["Timeseries", timeseriesExample()],
      ["Table", tableExample()]
    )
  ];
}

function barChartExamples() {
  return rows(
    columns(
      [6],
      [
        barChart({
          title: "subtype COLUMN (default)",
          resizable: true,
          lookup: createLookup("products", [
            groupOp("Product", [
              { source: "Product" },
              { source: "Quantity" },
              { source: "Quantity2" }
            ])
          ])
        })
      ],
      [6],
      [
        barChart({
          subtype: "bar",
          title: "subtype BAR",
          margin: { left: 80 },
          resizable: true,
          lookup: createLookup("products", [
            groupOp("Product", [
              { source: "Product" },
              { source: "Quantity" },
              { source: "Quantity2" }
            ])
          ])
        })
      ]
    ),
    columns(
      [6],
      [
        barChart({
          subtype: "column_stacked",
          title: "Column Stacked",
          resizable: true,
          lookup: createLookup("products", [
            groupOp("Product", [
              { source: "Product" },
              { source: "Quantity" },
              { source: "Quantity2" }
            ])
          ])
        })
      ],
      [6],
      [
        barChart({
          subtype: "bar_stacked",
          title: "subtype BAR",
          margin: { left: 80 },
          resizable: true,
          lookup: createLookup("products", [
            groupOp("Product", [
              { source: "Product" },
              { source: "Quantity" },
              { source: "Quantity2" }
            ])
          ])
        })
      ]
    )
  );
}

function lineChartExamples() {
  return rows(
    columns(
      [6],
      [
        lineChart({
          title: "subtype line (default)",
          resizable: true,
          lookup: createLookup("products", [
            groupOp("Product", [
              { source: "Product" },
              { source: "Quantity" },
              { source: "Quantity2" }
            ])
          ])
        })
      ],
      [6],
      [
        lineChart({
          subtype: "smooth",
          title: "subtype smooth",
          resizable: true,
          lookup: createLookup("products", [
            groupOp("Product", [
              { source: "Product" },
              { source: "Quantity" },
              { source: "Quantity2" }
            ])
          ])
        })
      ]
    )
  );
}

function areaChartExamples() {
  return rows(
    columns(
      [6],
      [
        areaChart({
          title: "subtype area (default)",
          resizable: true,
          lookup: createLookup("products", [
            groupOp("Product", [
              { source: "Product" },
              { source: "Quantity" },
              { source: "Quantity2" }
            ])
          ])
        })
      ],
      [6],
      [
        areaChart({
          subtype: "area_stacked",
          title: "subtype AREA_STACKED",
          resizable: true,
          lookup: createLookup("products", [
            groupOp("Product", [
              { source: "Product" },
              { source: "Quantity" },
              { source: "Quantity2" }
            ])
          ])
        })
      ]
    )
  );
}

function pieChartExamples() {
  return rows(
    columns(
      [6],
      [
        pieChart({
          title: "subtype pie (default)",
          resizable: true,
          lookup: createLookup("products", [
            groupOp("Product", [
              { source: "Product" },
              { source: "Quantity" }
            ])
          ])
        })
      ],
      [6],
      [
        pieChart({
          subtype: "donut",
          title: "subtype donut",
          resizable: true,
          lookup: createLookup("products", [
            groupOp("Product", [
              { source: "Product" },
              { source: "Quantity" }
            ])
          ])
        })
      ]
    )
  );
}

function bubbleChartExample() {
  return rows(
    columns(
      [6],
      [
        html("<h4><strong>Bubble Chart</strong></h4><br />"),
        bubbleChart({
          resizable: true,
          lookup: createLookup("products", [
            groupOp("Product", [
              { source: "Product" },
              { source: "Quantity" },
              { source: "Quantity2" },
              { source: "Product" }
            ])
          ])
        })
      ]
    )
  );
}

function meterExample() {
  return withStyle(
    { fontSize: "x-large", textAlign: "center" },
    withStyle(
      { float: "left" },
      meter({
        title: "Memory Usage",
        resizable: false,
        legend: { show: true, position: "bottom" },
        end: 4120,
        critical: 3000,
        warning: 2000,
        lookup: createLookup("memory_usage", [
          groupOp("Server", [
            { source: "Server" },
            { source: "Usage", function: "SUM" }
          ])
        ])
      })
    )
  );
}

function metricExamples() {
  return [
    html("Metric components render an HTML template based on data. Users can customize the HTML and Javascript based on data."),
    html("<h4><strong>Default Metric</strong></h4><br />"),
    metric({
      title: "Total Products",
      height: 100,
      width: 150,
      lookup: createLookup("products", [
        groupOp(null, [
          { source: "Quantity", function: "SUM" }
        ])
      ])
    }),
    withStyle(
      { marginTop: "20px", marginBottom: "20px" },
      html("The following metric uses custom HTML and Javascript template:")
    ),
    withStyle(
      { border: "solid 1px" },
      metric({
        title: "Total Products",
        html: '<h2><strong>&#10026; Total Products:</strong>&nbsp;<span id="${this}">${value}</span></h2>',
        javascript: `
          \${this}.onmouseover = function() {
            \${this}.style.color = "red";
          };
          \${this}.onmouseout = function() {
            \${this}.style.color = "black";
          };
        `,
        lookup: createLookup("products", [
          groupOp(null, [
            { source: "Quantity", function: "SUM" }
          ])
        ])
      })
    )
  ];
}

function selectorsExample() {
  return [
    html(`<p>Melviz Displayers can filter each other. For filtering only we have selectors components. You can enable filter using the filter section, the component that filter others:<br /> <pre> filter:
    notification: true</pre>
</p><p>
  Then on the component that will be filtered:<pre>
filter:
    listening: true</pre>
</p>`),
    html("<strong> Default Selector </strong>"),
    selector({
      filter: { enabled: true, notification: true, listening: false, selfapply: false },
      lookup: createLookup("products", [
        groupOp("Section", [
          { source: "Section" }
        ])
      ])
    }),
    html("<br /><strong>subtype SELECTOR_LABELS (used only with LABEL column types)</strong>"),
    selector({
      subtype: "labels",
      filter: { notification: true },
      lookup: createLookup("products", [
        groupOp("Section", [
          { source: "Section" }
        ])
      ])
    }),
    barChart({
      filter: { listening: true },
      resizable: true,
      lookup: createLookup("products", [
        groupOp("Product", [
          { source: "Product" },
          { source: "Quantity" },
          { source: "Quantity2" }
        ])
      ])
    })
  ];
}

function timeseriesExample() {
  return timeseries({
    title: "Sample Timeseries",
    zoom: true,
    width: "100%",
    resizable: true,
    lookup: createLookup("timeseries", [])
  });
}

function tableExample() {
  return [
    html("<h4><strong>Table (default type)</strong></h4>"),
    table({
      pageSize: 10,
      resizable: true,
      lookup: createLookup("products", [])
    })
  ];
}

function layoutPage() {
  return withStyle(
    { margin: "10px" },
    rows(
      columns(
        [12],
        [
          html(`<p style="margin-top: 20px">
  A Melviz application is composed of Pages. The smallest Melviz YML application contain a single page
with a single component
    <pre>pages:
  - name: Page
    components:
      - html: Hello World</pre>
  Currently boostrap layout is used, which means that columns and rows can be used for organization:
</p>`)
        ]
      ),
      withStyle(
        { border: "solid 1px", textAlign: "center", marginBottom: "10px" },
        columns([12], [html("ROW1")])
      ),
      columns(
        [3],
        [withStyle({ border: "solid 1px", textAlign: "center" }, html("ROW2 CL1 SPAN 3"))],
        [3],
        [withStyle({ border: "solid 1px", textAlign: "center" }, html("ROW2 CL2 SPAN 3"))],
        [6],
        [withStyle({ border: "solid 1px", textAlign: "center" }, html("ROW2 CL3 SPAN 6"))]
      )
    )
  );
}

function htmlCssPage() {
  return withStyle(
    { margin: "10px" },
    [
      html(`<p>Melviz Support HTML components using the <i>html</i> element, markdown using <i>markdown</i> component and CSS 2 properties using <i>properties</i> object that applies to any component (pages, row, columns and component). A page with font-size xxx-large could use the following declaration:
  <pre>pages:
 - components:
      - html: Hello World
        properties:
          font-size: xxx-large</pre>
</p>`),
      title("My Title", { size: "2xl" })
    ]
  );
}

function dataSetsPage() {
  return withStyle(
    { margin: "10px" },
    html(`<p>
  Data is retrieved using Datasets and it can be retrieved from JSON content. The content can be retrieved from a JSON URL or declared inline: <br />
  <pre>datasets:
    - uuid: products
      content: >-
        [
          ["Computers", "Scanner", 5, 3],
          ["Computers", "Printer", 7, 4],
          ["Computers", "Laptop", 3, 2],
          ["Electronics", "Camera", 10, 7],
          ["Electronics", "Headphones", 5, 9]
        ]
      columns:
        - id: Section
          type: LABEL
        - id: Product
          type: LABEL
        - id: Quantity
          type: NUMBER
        - id: Quantity2
          type: NUMBER
  </pre>
  Data Sets can be used with Displayers or External Components.
</p>`)
  );
}

function externalComponentsPage() {
  return [
    withStyle(
      { marginBottom: "20px" },
      html("It is possible to develop custom components that can be rendered inside Melviz. By default some external components are available for use:")
    ),
    tabs(
      ["ECharts", echartsExample()],
      ["SVG Heatmap", svgHeatmapExample()]
    )
  ];
}

function echartsExample() {
  const echartsOption = {
    toolbox: {
      feature: {
        dataZoom: {},
        magicType: {
          type: ["line", "bar", "stack"]
        },
        saveAsImage: {}
      }
    },
    series: [
      {
        type: "bar",
        markLine: {
          data: [{ type: "max" }]
        }
      },
      {
        type: "bar",
        markLine: {
          data: [{ type: "max" }]
        }
      }
    ]
  };

  return iframePlugin({
    componentId: "echarts",
    width: "100%",
    height: "400px",
    properties: {
      "echarts.title": JSON.stringify({ text: "Products", left: "center" }),
      "echarts.option": JSON.stringify(echartsOption)
    },
    lookup: createLookup("products", [
      groupOp("product", [
        { source: "product" },
        { source: "quantity" },
        { source: "quantity2" }
      ])
    ])
  });
}

function svgHeatmapExample() {
  const svgContent = `<svg xmlns="http://www.w3.org/2000/svg">
  <path id="svg_1" d="m23,23l82,0l0,51l-82,0l0,-51z" stroke-width="0" fill="#999999"/>
  <path id="svg_2" d="m133,23l82,0l0,51l-82,0l0,-51z" stroke-width="0" fill="#999999"/>
  <path id="svg_3" d="m240,23l82,0l0,51l-82,0l0,-51z" stroke-width="0" fill="#999999"/>
  <path id="svg_4" d="m350,23l82,0l0,51l-82,0l0,-51z" stroke-width="0" fill="#999999"/>
  <path id="svg_5" d="m461,24l82,0l0,51l-82,0l0,-51z" stroke-width="0" fill="#999999"/>
  <path id="svg_6" d="m566,26l82,0l0,51l-82,0l0,-51z" stroke-width="0" fill="#999999"/>
</svg>`;

  return iframePlugin({
    componentId: "svg-heatmap",
    width: "100%",
    properties: {
      "svg-heatmap.svg": svgContent
    },
    lookup: createLookup("svg-data", [])
  });
}

function formsPage() {
  return {
    dataScope: {
      dataset: "products",
      idColumn: "Product"
    },
    children: [
      html("<p>Forms use native input components bound to page data via <i>dataScope</i>. See the <strong>Contact Manager</strong> example for a complete master-detail demo.</p>"),
      textInput({ field: "Product", label: "Product", readonly: true }),
      numberInput({ field: "Quantity", label: "Quantity", readonly: true }),
      dropdown({
        field: "Section",
        label: "Section",
        readonly: true,
        options: { values: ["Computers", "Electronics"] }
      })
    ]
  };
}

function navigationPage() {
  return [
    html("Multiple pages can be declared on the same dashboard. If the dashboard contains more than one page then a menu is available for displaying the pages. <br /> Pages can be organized in groups and then be embedded in other pages using Navigation Components.")
  ];
}

function settingsPage() {
  return withStyle(
    { margin: "10px" },
    html(`<p>This is not about components, but special type of settings to configure your dashboard:</p>
<h2>Properties</h2> <p>In this top level setting of YAML you can define custom properties that will text-replaced in the rest of the YAML. It is useful to make it easy to reuse dashboards. see an example:<p>
<pre>
  properties:
      name: World
  pages:
      - components:
      - html: Hello \${name}</pre>
<h2> Global</h2> <p> In this section we can declare special configuration that applies for the whole YAML</p>`)
  );
}
