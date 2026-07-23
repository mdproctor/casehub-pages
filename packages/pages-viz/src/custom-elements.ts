import type { PagesGridTable } from "./components/PagesGridTable.js";
import type { PagesMetric } from "./components/PagesMetric.js";
import type { PagesSelector } from "./components/PagesSelector.js";
import type { PagesIframePlugin } from "./components/PagesIframePlugin.js";
import type { PagesBarChart } from "./charts/PagesBarChart.js";
import type { PagesAreaChart } from "./charts/PagesAreaChart.js";
import type { PagesBubbleChart } from "./charts/PagesBubbleChart.js";
import type { PagesLineChart } from "./charts/PagesLineChart.js";
import type { PagesMap } from "./charts/PagesMap.js";
import type { PagesMeter } from "./charts/PagesMeter.js";
import type { PagesPieChart } from "./charts/PagesPieChart.js";
import type { PagesScatterChart } from "./charts/PagesScatterChart.js";
import type { PagesTimeseries } from "./charts/PagesTimeseries.js";
import type { PagesTimeline } from "./charts/PagesTimeline.js";
import type { PagesGraph } from "./charts/PagesGraph.js";
import type { PagesCheckbox } from "./form-inputs/PagesCheckbox.js";
import type { PagesDatePicker } from "./form-inputs/PagesDatePicker.js";
import type { PagesDropdown } from "./form-inputs/PagesDropdown.js";
import type { PagesNumberInput } from "./form-inputs/PagesNumberInput.js";
import type { PagesTextInput } from "./form-inputs/PagesTextInput.js";
import type { PagesTextarea } from "./form-inputs/PagesTextarea.js";
import type { PagesSchemaForm } from "./form-inputs/PagesSchemaForm.js";
import type { PagesActionButton } from "./components/PagesActionButton.js";
import type { PagesAlert } from "./components/PagesAlert.js";
import type { PagesBadge } from "./components/PagesBadge.js";
import type { PagesCountdown } from "./components/PagesCountdown.js";
import "./components/PagesLegend.js";

export {};

declare global {
  interface HTMLElementTagNameMap {
    "pages-grid-table": PagesGridTable;
    "pages-metric": PagesMetric;
    "pages-selector": PagesSelector;
    "pages-iframe-plugin": PagesIframePlugin;
    "pages-bar-chart": PagesBarChart;
    "pages-area-chart": PagesAreaChart;
    "pages-bubble-chart": PagesBubbleChart;
    "pages-line-chart": PagesLineChart;
    "pages-map": PagesMap;
    "pages-meter": PagesMeter;
    "pages-pie-chart": PagesPieChart;
    "pages-scatter-chart": PagesScatterChart;
    "pages-timeseries": PagesTimeseries;
    "pages-timeline": PagesTimeline;
    "pages-graph": PagesGraph;
    "pages-checkbox": PagesCheckbox;
    "pages-date-picker": PagesDatePicker;
    "pages-dropdown": PagesDropdown;
    "pages-number-input": PagesNumberInput;
    "pages-text-input": PagesTextInput;
    "pages-textarea": PagesTextarea;
    "pages-schema-form": PagesSchemaForm;
    "pages-action-button": PagesActionButton;
    "pages-alert": PagesAlert;
    "pages-badge": PagesBadge;
    "pages-countdown": PagesCountdown;
    "pages-legend": import("./components/PagesLegend.js").PagesLegend;
  }
}
