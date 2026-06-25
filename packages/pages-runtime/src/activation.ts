import type { Component, PermissionContext } from "@casehubio/pages-component/dist/model/types.js";
import type { DataSetLookup } from "@casehubio/pages-data/dist/dataset/lookup.js";
import { ColumnType } from "@casehubio/pages-data/dist/dataset/types.js";
import type { ColumnId, DataSetId } from "@casehubio/pages-data/dist/dataset/types.js";
import type { ExternalDataSetDef } from "@casehubio/pages-data/dist/dataset/external/types.js";
import { toTypedDataSet } from "@casehubio/pages-data/dist/dataset/conversion.js";
import type { CasehubElement } from "@casehubio/pages-viz/dist/base/CasehubElement.js";
import type { VizComponentProps } from "@casehubio/pages-viz/dist/base/types.js";
import type { PageProps } from "@casehubio/pages-ui/dist/model/page-types.js";
import { renderComponent } from "@casehubio/pages-component/dist/renderer/render.js";
import { parsePage } from "@casehubio/pages-ui/dist/parser/page-parser.js";
import { load as yamlLoad } from "js-yaml";
import type { ComponentRegistry } from "./registry.js";
import type { PagePathMap } from "./page-paths.js";
import { extendPagePathMap } from "./page-paths.js";
import type { PageIndex } from "./navigation.js";
import { extendPageIndex } from "./navigation.js";
import type { DataSetScope } from "./dataset-scope.js";
import { extendDataSetScope } from "./dataset-scope.js";
import type { DataScopeRegistry } from "./data-scope-registry.js";
import type { SaveConfigRegistry } from "./save-config-registry.js";
import { renderTitle, renderHtml, renderMarkdown } from "./content.js";

const FORM_INPUT_TYPES = new Set([
  "text-input",
  "number-input",
  "dropdown",
  "checkbox",
  "date-picker",
  "textarea",
]);

const DATA_COMPONENT_TYPES = new Set([
  "bar-chart",
  "line-chart",
  "area-chart",
  "pie-chart",
  "scatter-chart",
  "bubble-chart",
  "timeseries",
  "table",
  "metric",
  "meter",
  "selector",
  "map",
  "iframe-plugin",
  ...FORM_INPUT_TYPES,
]);

export interface LazyPageOptions {
  readonly fetchFn: typeof globalThis.fetch;
  readonly baseUrl: string | undefined;
  readonly abortSignal: AbortSignal;
  readonly permissions: PermissionContext;
  readonly pageIndex: PageIndex;
  readonly dataSetScope: DataSetScope;
  readonly dataScopeRegistry: DataScopeRegistry;
  readonly saveConfigRegistry: SaveConfigRegistry;
  readonly lazyPageResolutions: Map<Component, Component>;
}

export function createActivationCallback(
  registry: ComponentRegistry,
  pagePathMap: PagePathMap,
  options?: LazyPageOptions,
): (el: HTMLElement, component: Component) => void {
  const yamlCache = new Map<string, string>();

  const callback = (el: HTMLElement, component: Component): void => {
    const componentId = el.dataset.componentId;
    if (!componentId) return;

    const pagePath = pagePathMap.get(component) ?? "";

    // Register DataScope and SaveConfig for page components
    if (component.type === "page" && options) {
      const pageProps = component.props as PageProps | undefined;
      if (pageProps?.dataScope) {
        options.dataScopeRegistry.set(pagePath, pageProps.dataScope);
      }
      if (pageProps?.save) {
        options.saveConfigRegistry.set(pagePath, pageProps.save);
      }
    }

    if (DATA_COMPONENT_TYPES.has(component.type)) {
      const tagName = `casehub-${component.type}`;
      const vizEl = document.createElement(tagName) as CasehubElement<VizComponentProps>;

      const isFormInput = FORM_INPUT_TYPES.has(component.type);

      let lookup = (component.props as Record<string, unknown> | undefined)?.lookup as
        | DataSetLookup
        | undefined;

      // Form input implicit lookup injection
      if (isFormInput && options) {
        const pageDataScope = options.dataScopeRegistry.get(pagePath);
        if (pageDataScope) {
          lookup = { dataSetId: pageDataScope.dataset, operations: [] };
          const hasSave = options.saveConfigRegistry.has(pagePath);
          (vizEl as unknown as { editable: boolean }).editable = hasSave;
        } else {
          vizEl.error = "Form input requires page dataScope";
        }
      }

      const hasExplicitId = component.id !== undefined;

      const entry = {
        element: el,
        vizElement: vizEl,
        component,
        pagePath,
        hasExplicitId,
        ...(lookup !== undefined && { originalLookup: lookup }),
      };
      registry.set(componentId, entry);

      if (isFormInput && lookup) {
        // Merge implicit lookup into props for form inputs
        vizEl.props = { ...component.props, lookup };
      } else if (component.props) {
        vizEl.props = component.props;
      }
      el.appendChild(vizEl);

      // Handle inline dataSet on displayer (legacy DashBuilder shorthand)
      const inlineData = (component.props as Record<string, unknown> | undefined)?.inlineDataSet;
      if (inlineData !== undefined && lookup === undefined) {
        resolveInlineDataSet(vizEl, inlineData);
      }
      return;
    }

    if (component.type === "title" && component.props) {
      renderTitle(el, component.props);
      return;
    }

    if (component.type === "html" && component.props) {
      renderHtml(el, component.props);
      return;
    }

    if (component.type === "markdown" && component.props) {
      renderMarkdown(el, component.props);
      return;
    }

    if (component.type === "lazy-page" && component.props && options) {
      const props = component.props as { name?: string; href?: string };
      if (!props.href) return;

      const { fetchFn, baseUrl, abortSignal, permissions, pageIndex, dataSetScope, lazyPageResolutions } = options;

      // Path A: re-activation — resolved root available, re-render synchronously
      const resolved = lazyPageResolutions.get(component);
      if (resolved) {
        renderComponent(el, resolved, { permissions, onNode: callback });
        return;
      }

      const url = baseUrl ? new URL(props.href, baseUrl).href : props.href;
      const cached = yamlCache.get(url);

      if (cached) {
        // Path B: YAML cache hit — synchronous
        const parsed = parsePage(yamlLoad(cached));
        integrateAndRender(el, component, parsed, pagePath, pagePathMap, pageIndex, dataSetScope, lazyPageResolutions, permissions, callback);
      } else {
        // Path C: cache miss — async
        fetchFn(url, { signal: abortSignal })
          .then((response) => response.text())
          .then((text) => {
            yamlCache.set(url, text);
            const parsed = parsePage(yamlLoad(text));
            integrateAndRender(el, component, parsed, pagePath, pagePathMap, pageIndex, dataSetScope, lazyPageResolutions, permissions, callback);
          })
          .catch((err: unknown) => {
            if (err instanceof DOMException && err.name === "AbortError") return;
            el.textContent = `Failed to load lazy page: ${err instanceof Error ? err.message : String(err)}`;
          });
      }
      return;
    }

    // Layout, page, unknown: no activation needed
  };

  return callback;
}

function integrateAndRender(
  el: HTMLElement,
  lazyPageComponent: Component,
  dashboardRoot: Component,
  basePath: string,
  pagePathMap: PagePathMap,
  pageIndex: PageIndex,
  dataSetScope: DataSetScope,
  lazyPageResolutions: Map<Component, Component>,
  permissions: PermissionContext,
  onNode: (el: HTMLElement, component: Component) => void,
): void {
  // Extract the first page from the dashboard's content slot
  const pages = dashboardRoot.slots?.["content"];
  if (!pages || pages.length === 0) {
    el.textContent = "Lazy page YAML must contain at least one page";
    return;
  }
  const pageComponent = pages[0];
  if (!pageComponent) {
    el.textContent = "Lazy page YAML must contain at least one page";
    return;
  }

  extendPagePathMap(pageComponent, basePath, pagePathMap);
  const inheritedScope = dataSetScope.get(basePath) ?? new Map<DataSetId, ExternalDataSetDef>();
  extendDataSetScope(pageComponent, inheritedScope, pagePathMap, dataSetScope);
  extendPageIndex(pageComponent, pagePathMap, pageIndex);
  lazyPageResolutions.set(lazyPageComponent, pageComponent);
  renderComponent(el, pageComponent, { permissions, onNode });
}

function resolveInlineDataSet(
  vizEl: CasehubElement<VizComponentProps>,
  inlineData: unknown,
): void {
  try {
    let raw: unknown;
    if (typeof inlineData === "string") {
      let cleaned = inlineData.replace(/,\s*([\]}])/g, "$1");
      cleaned = cleaned.replace(/'/g, '"');
      raw = JSON.parse(cleaned);
    } else {
      raw = inlineData;
    }

    if (!Array.isArray(raw)) return;

    // Flat array → single row (Shape D)
    const isFlat = raw.every((v: unknown) => typeof v !== "object" || v === null);
    const rows: unknown[][] = isFlat ? [raw] : (raw as unknown[][]);

    const maxCols = rows.reduce((max: number, row: unknown[]) => Math.max(max, row.length), 0);
    const columns = Array.from({ length: maxCols }, (_: unknown, i: number) => ({
      id: `Column ${String(i)}` as ColumnId,
      name: `Column ${String(i)}`,
      type: typeof rows[0]?.[i] === "number" ? ColumnType.NUMBER : ColumnType.LABEL,
    }));

    const data = rows.map((row: unknown[]) =>
      Array.from({ length: maxCols }, (_: unknown, i: number) => {
        const cell = row[i];
        if (cell === undefined || cell === null) return null;
        if (typeof cell === "string") return cell;
        if (typeof cell === "number" || typeof cell === "boolean") return String(cell);
        return JSON.stringify(cell);
      }),
    );

    const dataset = toTypedDataSet({ columns, data });
    vizEl.dataSet = dataset;
  } catch {
    vizEl.error = "Failed to parse inline dataSet";
  }
}

