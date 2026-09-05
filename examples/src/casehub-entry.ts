import { loadSite } from "@casehubio/pages-runtime";
import "@casehubio/pages-primitives";
import "@casehubio/pages-ui-components/input";
import "@casehubio/pages-ui-components/select";
import "@casehubio/pages-ui-components/textarea";
import "@casehubio/pages-ui-components/checkbox";
import "@casehubio/pages-ui-components/button";
import "@casehubio/pages-ui-components/badge";
import "@casehubio/pages-ui-components/status-dot";
import "@casehubio/pages-viz";
import "@casehubio/pages-aria/dist/controller";
import "@casehubio/graph-renderer";
import "@casehubio/pages-code-editor";
import { createSchemaCompletion } from "@casehubio/pages-code-editor";
import { dashboardSchema } from "@casehubio/pages-schema";
import "@casehubio/pages-property-palette";
import "@casehubio/pages-diagram-palette";
import { createBasicPipelineModel, PIPELINE_SCHEMAS } from "./pipeline-stencils";
import type { LiveSite, SiteOptions } from "@casehubio/pages-runtime";
import { applyTheme, getTheme } from "@casehubio/pages-ui-tokens";

applyTheme('casehub-dark');

export { loadSite, applyTheme, getTheme };
export type { LiveSite, SiteOptions };

export { createBasicPipelineModel, PIPELINE_SCHEMAS };
export const yamlCompletion = createSchemaCompletion(dashboardSchema);
export { dashboardSchema };
export { defaultEditPolicy, applyGraphEdit, getAllStencils } from "@casehubio/graph-renderer";
export { createZoneLayoutEngine } from "@casehubio/pages-runtime";
export { dockWorkbench, html, rows, split, columns, withId, dockBar, deferred, withStyle, hostPanel } from "@casehubio/pages-ui/dist/dsl/builders.js";
export type { DockWorkbenchConfig, DockPanelConfig, DockSideConfig } from "@casehubio/pages-ui/dist/dsl/builders.js";
