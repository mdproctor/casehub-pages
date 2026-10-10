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
import "@casehubio/graph-renderer/dist/bridge/PagesGraphCanvas.js";
import "@casehubio/pages-code-editor";
import "@casehubio/pages-document-diff";
import "@casehubio/pages-markdown-editor";
import { progressiveInsert } from "@casehubio/pages-editor-core";
import { createSchemaCompletion } from "@casehubio/pages-code-editor";
import { dashboardSchema } from "@casehubio/pages-schema";
import "@casehubio/pages-property-palette";
import "@casehubio/pages-diagram-palette";
// pages-builder loaded on demand — static import crashes UMD bundle (decorator compat)
import { createBasicPipelineModel, PIPELINE_SCHEMAS } from "./pipeline-stencils";
import type { LiveSite, SiteOptions } from "@casehubio/pages-runtime";
import { applyTheme, getTheme } from "@casehubio/pages-ui-tokens";

applyTheme('casehub-dark');

export { loadSite, applyTheme, getTheme };
export { progressiveInsert };
export type { LiveSite, SiteOptions };

export { createBasicPipelineModel, PIPELINE_SCHEMAS };
export const yamlCompletion = createSchemaCompletion(dashboardSchema);
export { dashboardSchema };
export { defaultEditPolicy, applyGraphEdit, getAllStencils } from "@casehubio/graph-renderer";
export { createZoneLayoutEngine } from "@casehubio/pages-runtime";
export { dockWorkbench, html, rows, split, columns, withId, dockBar, deferred, withStyle, hostPanel } from "@casehubio/pages-ui/dist/dsl/builders.js";
export type { DockWorkbenchConfig, DockPanelConfig, DockSideConfig } from "@casehubio/pages-ui/dist/dsl/builders.js";
export { createScheduler, parsePlaybook, createScenarioCatalog } from "@casehubio/pages-aria/playbook";
export type { PlaybookRunner, SchedulerOptions } from "@casehubio/pages-aria/playbook";
export { Walker, stepSuccess, stepFailure } from "@casehubio/yaml-core/step";
export { StructuralEvaluator } from "@casehubio/yaml-core/step";
export { PluginRegistry } from "@casehubio/yaml-core/step";
export { CompositeCatalog } from "@casehubio/yaml-core/step";
export type { Result, ResolvedStep } from "@casehubio/yaml-core/step";
export { matches, valuePattern, structuralPattern, anyOfPattern, defaultPattern } from "@casehubio/yaml-core";
export { isTruthy } from "@casehubio/yaml-core";
export { DefaultScenarioScope } from "@casehubio/yaml-core/orchestration";
export { DefaultCorrelationScope, DefaultOrcChannel } from "@casehubio/yaml-core/orchestration";

import { PluginRegistry } from "@casehubio/yaml-core/step";
import { CompositeCatalog } from "@casehubio/yaml-core/step";
import { Walker } from "@casehubio/yaml-core/step";
import { StructuralEvaluator } from "@casehubio/yaml-core/step";
import { DefaultScenarioScope } from "@casehubio/yaml-core/orchestration";
import { stepSuccess, stepFailure } from "@casehubio/yaml-core/step";
import type { Action } from "@casehubio/yaml-core/step";

export function createStepRunner(plugins: Array<{ name: string; inputs?: Record<string, { type: string; required: boolean }>; outputs?: Record<string, { type: string; required: boolean }>; execute: Action['execute'] }>) {
  const registry = new PluginRegistry();
  for (const p of plugins) {
    registry.register({ name: p.name, inputs: (p.inputs ?? {}) as Record<string, import("@casehubio/yaml-core/step").Parameter>, outputs: (p.outputs ?? {}) as Record<string, import("@casehubio/yaml-core/step").Parameter>, execute: p.execute });
  }
  const catalog = new CompositeCatalog([registry.createSource()]);
  const evaluator = new StructuralEvaluator();
  const scope = new DefaultScenarioScope();

  return {
    resolve(steps: Record<string, unknown>[]) { return Walker.resolve(steps, catalog); },
    async run(steps: Record<string, unknown>[]) {
      const resolved = Walker.resolve(steps, catalog);
      const results = [];
      for (const step of resolved) {
        const result = await evaluator.evaluate(step, { scope } as never);
        results.push(result);
      }
      return results;
    },
    stepSuccess,
    stepFailure,
    scope,
  };
}
