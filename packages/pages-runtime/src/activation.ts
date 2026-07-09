import type {Component, PermissionContext} from "@casehubio/pages-component/dist/model/types.js";
import type {DataSetLookup} from "@casehubio/pages-data/dist/dataset/lookup.js";
import type {ColumnId, DataSetId} from "@casehubio/pages-data/dist/dataset/types.js";
import {ColumnType} from "@casehubio/pages-data/dist/dataset/types.js";
import type {DataSetEntry, DataSetScope} from "./dataset-scope.js";
import {extendDataSetScope} from "./dataset-scope.js";
import {toTypedDataSet} from "@casehubio/pages-data/dist/dataset/conversion.js";
import type {PagesElement} from "@casehubio/pages-viz/dist/base/PagesElement.js";
import type {VizComponentProps} from "@casehubio/pages-viz/dist/base/types.js";
import type {PageProps} from "@casehubio/pages-ui/dist/model/page-types.js";
import {renderComponent} from "@casehubio/pages-component/dist/renderer/render.js";
import {parsePage} from "@casehubio/pages-ui/dist/parser/page-parser.js";
import {load as yamlLoad} from "js-yaml";
import type {ComponentRegistry} from "./registry.js";
import type {PagePathMap} from "./page-paths.js";
import {extendPagePathMap} from "./page-paths.js";
import type {PageIndex} from "./navigation.js";
import {extendPageIndex} from "./navigation.js";
import type {DataScopeRegistry} from "./data-scope-registry.js";
import type {SaveConfigRegistry} from "./save-config-registry.js";
import {renderHtml, renderMarkdown, renderTitle} from "./content.js";
import type {ContextManager} from "./context-wiring.js";
import type {EscapeMode} from "@casehubio/pages-component/dist/context/index.js";
import {evaluateExpression, hasTemplateVars, resolveTemplate} from "@casehubio/pages-component/dist/context/index.js";
import type {PagesContentElement} from "@casehubio/pages-viz/dist/base/PagesContentElement.js";
import {lookupPanel} from "./panel-registry.js";
import type {ConfigurablePanel, DataReceiver, VizTarget} from "@casehubio/pages-component/dist/model/hosting.js";
import type {HostPanelProps} from "@casehubio/pages-component/dist/model/component-props.js";
import type {SortColumn} from "@casehubio/pages-data/dist/dataset/sort.js";

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
  "badge",
  "countdown",
  "timeline",
  "graph",
  "grouped-view",
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

function createHostPanelProxy(panel: DataReceiver): VizTarget {
  return {
    set loading(v: boolean) { panel.loading = v; },
    get loading() { return panel.loading; },
    set dataSet(v: unknown) { panel.dataSet = v; },
    get dataSet() { return panel.dataSet; },
    set error(v: string) { panel.error = v; },
    get error() { return panel.error; },
    set totalRows(_: number) {},
    get totalRows() { return 0; },
    set activeSort(_: SortColumn | undefined) {},
    get activeSort() { return undefined; },
    set activePage(_: number | undefined) {},
    get activePage() { return undefined; },
  };
}

export function createActivationCallback(
  registry: ComponentRegistry,
  pagePathMap: PagePathMap,
  options?: LazyPageOptions,
  contextManager?: ContextManager,
): (el: HTMLElement, component: Component) => void {
  const yamlCache = new Map<string, string>();

  const callback = (el: HTMLElement, component: Component): void => {
    const componentId = el.dataset.componentId;
    if (!componentId) return;

    const pagePath = pagePathMap.get(component) ?? "";

    // Handle static visible: false (unless visibleWhen overrides it)
    const staticVisible = (component.props as Record<string, unknown> | undefined)?.visible;
    if (!component.visibleWhen && staticVisible === false) {
      el.hidden = true;
    }

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
      const tagName = `pages-${component.type}`;
      const vizEl = document.createElement(tagName) as PagesElement<VizComponentProps>;

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

      // Register visibleWhen consumer
      if (component.visibleWhen && contextManager) {
        registerVisibleWhenConsumer(el, vizEl, component.visibleWhen, contextManager);
      }

      return;
    }

    if (component.type === "title" && component.props) {
      const textProp = typeof component.props.text === "string" ? component.props.text : "";
      if (contextManager && hasTemplateVars(textProp)) {
        const resolvedText = resolveTemplate(textProp, contextManager.getContext(), "none");
        renderTitle(el, { ...component.props, text: resolvedText });
        registerContentConsumer(el, textProp, "none", contextManager, (resolved) => {
          el.innerHTML = "";
          renderTitle(el, { ...component.props, text: resolved });
        }, component.visibleWhen);
      } else {
        renderTitle(el, component.props);
        if (component.visibleWhen && contextManager) {
          registerVisibleWhenConsumer(el, null, component.visibleWhen, contextManager);
        }
      }
      return;
    }

    if (component.type === "html" && component.props) {
      const contentProp = typeof component.props.content === "string" ? component.props.content : "";
      if (contextManager && hasTemplateVars(contentProp)) {
        const resolvedContent = resolveTemplate(contentProp, contextManager.getContext(), "html");
        renderHtml(el, { ...component.props, content: resolvedContent });
        registerContentConsumer(el, contentProp, "html", contextManager, (resolved) => {
          el.innerHTML = "";
          renderHtml(el, { ...component.props, content: resolved });
        }, component.visibleWhen);
      } else {
        renderHtml(el, component.props);
        if (component.visibleWhen && contextManager) {
          registerVisibleWhenConsumer(el, null, component.visibleWhen, contextManager);
        }
      }
      return;
    }

    if (component.type === "markdown" && component.props) {
      const contentProp = typeof component.props.content === "string" ? component.props.content : "";
      if (contextManager && hasTemplateVars(contentProp)) {
        const resolvedContent = resolveTemplate(contentProp, contextManager.getContext(), "markdown");
        renderMarkdown(el, { ...component.props, content: resolvedContent });
        registerContentConsumer(el, contentProp, "markdown", contextManager, (resolved) => {
          el.innerHTML = "";
          renderMarkdown(el, { ...component.props, content: resolved });
        }, component.visibleWhen);
      } else {
        renderMarkdown(el, component.props);
        if (component.visibleWhen && contextManager) {
          registerVisibleWhenConsumer(el, null, component.visibleWhen, contextManager);
        }
      }
      return;
    }

    if (component.type === "action-button" && component.props) {
      const actionButton = document.createElement("pages-action-button");
      (actionButton as unknown as PagesContentElement<Record<string, unknown>>).props = component.props;
      el.appendChild(actionButton);

      if (component.visibleWhen && contextManager) {
        registerVisibleWhenConsumer(el, null, component.visibleWhen, contextManager);
      }
      return;
    }

    if (component.type === "alert" && component.props) {
      const contentProp = typeof component.props.content === "string" ? component.props.content : "";
      if (contextManager && hasTemplateVars(contentProp)) {
        const resolvedContent = resolveTemplate(contentProp, contextManager.getContext(), "none");
        const alert = document.createElement("pages-alert");
        (alert as unknown as PagesContentElement<Record<string, unknown>>).props = { ...component.props, content: resolvedContent };
        el.appendChild(alert);
        registerContentConsumer(el, contentProp, "none", contextManager, (resolved) => {
          el.innerHTML = "";
          const updatedAlert = document.createElement("pages-alert");
          (updatedAlert as unknown as PagesContentElement<Record<string, unknown>>).props = { ...component.props, content: resolved };
          el.appendChild(updatedAlert);
        }, component.visibleWhen);
      } else {
        const alert = document.createElement("pages-alert");
        (alert as unknown as PagesContentElement<Record<string, unknown>>).props = component.props;
        el.appendChild(alert);
        if (component.visibleWhen && contextManager) {
          registerVisibleWhenConsumer(el, null, component.visibleWhen, contextManager);
        }
      }
      return;
    }

    if (component.type === "host-panel" && component.props) {
      const { typeName, panelProps, lookup } = component.props as unknown as HostPanelProps;
      if (!typeName) return;

      const tagName = lookupPanel(typeName);
      if (!tagName) {
        el.textContent = `Unknown panel type: ${typeName}`;
        console.warn(`hostPanel: unregistered type "${typeName}"`);
        return;
      }

      const panel = document.createElement(tagName);

      const configurable = panel as unknown as ConfigurablePanel;
      if (typeof configurable.configure === "function") {
        configurable.configure(panelProps ?? {});
      }

      if (lookup) {
        const panelAsReceiver = panel as unknown as Partial<DataReceiver>;
        if (!("dataSet" in panel)) {
          console.warn(`hostPanel "${typeName}": lookup specified but panel lacks DataReceiver properties`);
          registry.set(componentId, {
            element: el,
            component,
            pagePath,
            hasExplicitId: component.id !== undefined,
          });
          el.appendChild(panel);
          return;
        } else {
          const proxy = createHostPanelProxy(panelAsReceiver as DataReceiver);
          registry.set(componentId, {
            element: el,
            vizElement: proxy,
            component,
            pagePath,
            originalLookup: lookup,
            hasExplicitId: component.id !== undefined,
          });
          el.appendChild(panel);
          panel.dispatchEvent(new CustomEvent("pages-data-request", {
            bubbles: true,
            composed: true,
            detail: { element: proxy, lookup },
          }));
          return;
        }
      } else {
        registry.set(componentId, {
          element: el,
          component,
          pagePath,
          hasExplicitId: component.id !== undefined,
        });
      }

      el.appendChild(panel);
      return;
    }

    if (component.type === "dock-bar" && component.props) {
      const { orientation, items } = component.props as {
        orientation?: string;
        items?: Array<{ icon: string; label: string; panelId: string; defaultOpen?: boolean }>;
      };
      if (!items) return;

      el.style.display = "flex";
      el.style.flexDirection = orientation === "horizontal" ? "row" : "column";
      el.style.gap = "2px";
      el.style.padding = "4px";

      for (const item of items) {
        const button = document.createElement("button");
        button.dataset.dockPanelId = item.panelId;
        button.title = item.label;
        button.textContent = item.icon;
        button.style.border = "none";
        button.style.background = "transparent";
        button.style.cursor = "pointer";
        button.style.padding = "6px";
        button.style.borderRadius = "var(--pages-radius-sm, 4px)";
        button.style.fontSize = "16px";

        if (item.defaultOpen) {
          button.dataset.active = "";
        }

        button.addEventListener("click", () => {
          const isActive = button.dataset.active !== undefined;
          if (isActive) {
            delete button.dataset.active;
          } else {
            button.dataset.active = "";
          }
          el.dispatchEvent(new CustomEvent("pages-dock-toggle", {
            bubbles: true,
            composed: true,
            detail: { panelId: item.panelId, visible: !isActive },
          }));
        });

        el.appendChild(button);
      }
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
  const inheritedScope = dataSetScope.get(basePath) ?? new Map<DataSetId, DataSetEntry>();
  extendDataSetScope(pageComponent, inheritedScope, pagePathMap, dataSetScope);
  extendPageIndex(pageComponent, pagePathMap, pageIndex);
  lazyPageResolutions.set(lazyPageComponent, pageComponent);
  renderComponent(el, pageComponent, { permissions, onNode });
}

function resolveInlineDataSet(
  vizEl: PagesElement<VizComponentProps>,
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

function registerContentConsumer(
  el: HTMLElement,
  template: string,
  escapeMode: EscapeMode,
  contextManager: ContextManager,
  applyFn: (resolved: string) => void,
  visibleWhenExpr?: string,
): void {
  const initialResolved = resolveTemplate(template, contextManager.getContext(), escapeMode);

  const consumer: import("./context-wiring.js").ContextConsumer = {
    element: el,
    templates: new Map([
      [
        "content",
        {
          template,
          escapeMode,
          lastResolved: initialResolved,
          apply: applyFn,
        },
      ],
    ]),
    suspended: false,
  };

  if (visibleWhenExpr) {
    const initialResult = evaluateExpression(visibleWhenExpr, contextManager.getContext());
    consumer.suspended = !initialResult;
    consumer.visibleWhen = {
      expression: visibleWhenExpr,
      lastResult: initialResult,
      onSuspend: () => { el.hidden = true; },
      onResume: () => { el.hidden = false; },
    };
    el.hidden = !initialResult;
  }

  contextManager.registerConsumer(consumer);
}

function registerVisibleWhenConsumer(
  el: HTMLElement,
  vizEl: PagesElement<VizComponentProps> | null,
  expression: string,
  contextManager: ContextManager,
): void {
  // Evaluate initial state
  const initialResult = evaluateExpression(expression, contextManager.getContext());

  const consumer = {
    element: el,
    templates: new Map(),
    suspended: !initialResult,
    visibleWhen: {
      expression,
      lastResult: initialResult,
      onSuspend: () => {
        el.hidden = true;
        // Note: refresh timer lifecycle is managed internally by PagesElement
        // based on the hidden state and isConnected status
      },
      onResume: () => {
        el.hidden = false;
        // Note: refresh timer lifecycle is managed internally by PagesElement
        // based on the hidden state and isConnected status
      },
    },
  };

  contextManager.registerConsumer(consumer);

  // Set initial hidden state
  el.hidden = !initialResult;
}

