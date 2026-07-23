import type { Component } from "../model/types.js";
import { desugarDisplayer } from "./displayer-desugar.js";

/**
 * Maps navigation component types to lowercase strings.
 */
const NAV_TYPE_MAP: Record<string, string> = {
  TABS: "tabs",
  PILLS: "pills",
  TREE: "tree",
  MENU: "menu",
  CAROUSEL: "carousel",
  STACK: "stack",
  TILES: "tiles",
  SIDEBAR: "sidebar",
  ACCORDION: "accordion",
};

const DATA_COMPONENT_TYPES = new Set([
  "bar-chart", "line-chart", "area-chart", "pie-chart",
  "scatter-chart", "bubble-chart", "timeseries",
  "data-table", "grid-table", "metric", "meter", "selector", "map",
  "grouped-view", "iframe-plugin",
  "badge", "countdown", "timeline", "graph",
  "text-input", "number-input", "dropdown", "checkbox", "date-picker", "textarea",
  "schema-form",
  "action-button", "alert",
  "split", "dock-bar", "host-panel",
]);

const LEGACY_TYPE_MAP: Record<string, string> = {
  BARCHART: "bar-chart", LINECHART: "line-chart", AREACHART: "area-chart",
  PIECHART: "pie-chart", SCATTERCHART: "scatter-chart", BUBBLECHART: "bubble-chart",
  TIMESERIES: "timeseries", TABLE: "data-table", table: "data-table", METRIC: "metric", METERCHART: "meter",
  SELECTOR: "selector", MAP: "map", GROUPED_VIEW: "grouped-view",
  BADGE: "badge", COUNTDOWN: "countdown", TIMELINE: "timeline", GRAPH: "graph",
};

/**
 * Converts a raw YAML component object to a typed Component.
 *
 * Handles:
 * - Content shorthands (html, markdown, title)
 * - Navigation references (screen → page-ref, panel, div → slot-target)
 * - Displayer components (delegates to displayer-desugar)
 * - Navigation components (TABS, TREE, MENU, etc.)
 * - External components (EXTERNAL → iframe-plugin)
 * - CSS properties (properties → style for content/displayer components)
 *
 * Some component types are transient (page-ref, slot-target) and will be
 * resolved by nav-desugar in a later step.
 */
export function desugarComponent(raw: Record<string, unknown>, displayerDefaults?: Record<string, unknown>): Component {
  // Content shorthands (check first, before type key)
  if ("html" in raw) {
    const style = extractStyle(raw.properties);
    const visibleWhen = raw.visibleWhen as string | undefined;
    return {
      type: "html",
      props: { content: raw.html },
      ...(style ? { style } : {}),
      ...(visibleWhen ? { visibleWhen } : {}),
    };
  }

  if ("markdown" in raw) {
    const style = extractStyle(raw.properties);
    const visibleWhen = raw.visibleWhen as string | undefined;
    return {
      type: "markdown",
      props: { content: raw.markdown },
      ...(style ? { style } : {}),
      ...(visibleWhen ? { visibleWhen } : {}),
    };
  }

  // Title shorthand (only if type is NOT present)
  if ("title" in raw && !("type" in raw)) {
    const style = extractStyle(raw.properties);
    const visibleWhen = raw.visibleWhen as string | undefined;
    return {
      type: "title",
      props: { text: raw.title },
      ...(style ? { style } : {}),
      ...(visibleWhen ? { visibleWhen } : {}),
    };
  }

  // Form input shorthands
  const FORM_INPUT_TYPES = ["text-input", "number-input", "dropdown", "checkbox", "date-picker", "textarea"] as const;
  for (const formType of FORM_INPUT_TYPES) {
    if (formType in raw) {
      const props = raw[formType] as Record<string, unknown>;
      const style = extractStyle(raw.properties);
      const visibleWhen = raw.visibleWhen as string | undefined;
      return {
        type: formType,
        props,
        ...(style ? { style } : {}),
        ...(visibleWhen ? { visibleWhen } : {}),
      };
    }
  }

  // Schema form shorthand
  if ("schema-form" in raw) {
    const props = raw["schema-form"] as Record<string, unknown>;
    const style = extractStyle(raw.properties);
    const visibleWhen = raw.visibleWhen as string | undefined;
    return {
      type: "schema-form",
      props,
      ...(style ? { style } : {}),
      ...(visibleWhen ? { visibleWhen } : {}),
    };
  }

  // Workbench primitives
  // Split
  if ("split" in raw) {
    const splitConfig = raw.split as { direction?: string; children?: unknown[]; ratio?: number[]; minSizes?: number[] };
    const children = (splitConfig.children ?? []).map((c: unknown) => desugarComponent(c as Record<string, unknown>, displayerDefaults));
    return {
      type: "split",
      props: {
        direction: splitConfig.direction ?? "horizontal",
        ...(splitConfig.ratio ? { ratio: splitConfig.ratio } : {}),
        ...(splitConfig.minSizes ? { minSizes: splitConfig.minSizes } : {}),
      },
      slots: Object.fromEntries(children.map((c, i) => [String(i), [c]])),
    };
  }

  // Dock bar
  if ("dock-bar" in raw) {
    const config = raw["dock-bar"] as { orientation?: string; items?: unknown[] };
    return {
      type: "dock-bar",
      props: {
        orientation: config.orientation ?? "vertical",
        items: config.items ?? [],
      },
    };
  }

  // Host panel
  if ("host-panel" in raw) {
    const config = raw["host-panel"] as { type?: string; props?: Record<string, unknown> };
    return {
      type: "host-panel",
      props: {
        typeName: config.type ?? "",
        ...(config.props ? { panelProps: config.props } : {}),
      },
    };
  }

  // Alert shorthand
  if ("alert" in raw) {
    const props = raw.alert as Record<string, unknown>;
    const style = extractStyle(raw.properties);
    const visibleWhen = raw.visibleWhen as string | undefined;
    return {
      type: "alert",
      props,
      ...(style ? { style } : {}),
      ...(visibleWhen ? { visibleWhen } : {}),
    };
  }

  // Action button shorthand
  if ("action-button" in raw) {
    const props = raw["action-button"] as Record<string, unknown>;
    const style = extractStyle(raw.properties);
    const visibleWhen = raw.visibleWhen as string | undefined;
    return {
      type: "action-button",
      props,
      ...(style ? { style } : {}),
      ...(visibleWhen ? { visibleWhen } : {}),
    };
  }

  // Navigation references (transient)
  // Page with src → lazy-page
  if ("page" in raw && "src" in raw) {
    const style = extractStyle(raw.properties);
    return {
      type: "lazy-page",
      props: { name: raw.page, href: raw.src },
      ...(style ? { style } : {}),
    };
  }

  // Page without src → page-ref (canonical keyword for screen)
  if ("page" in raw && !("src" in raw)) {
    const style = extractStyle(raw.properties);
    return {
      type: "page-ref",
      props: { name: raw.page },
      ...(style ? { style } : {}),
    };
  }

  if ("screen" in raw) {
    return {
      type: "page-ref",
      props: { name: raw.screen },
    };
  }

  // Panel reference (string value, not object)
  if ("panel" in raw && typeof raw.panel === "string") {
    return {
      type: "panel",
      props: { name: raw.panel },
    };
  }

  // Slot target (transient)
  if ("div" in raw) {
    return {
      type: "slot-target",
      props: { id: raw.div },
    };
  }

  // Displayer component (null/empty displayer gets settings from global defaults)
  if ("displayer" in raw) {
    const displayerRaw = (raw.displayer !== null && typeof raw.displayer === "object")
      ? raw.displayer as Record<string, unknown>
      : {};
    const merged = displayerDefaults
      ? deepMergeRaw(displayerDefaults, displayerRaw)
      : displayerRaw;
    const component = desugarDisplayer(merged);
    // Attach style from outer properties
    const style = extractStyle(raw.properties);
    return {
      ...component,
      ...(style ? { style } : {}),
    };
  }

  // Columns layout component — type: columns with columns: [{components: [...]}]
  if ("type" in raw && raw.type === "columns" && "columns" in raw) {
    const columnsArray = raw.columns as Array<Record<string, unknown>>;
    const props = raw.properties as Record<string, unknown> | undefined;
    const spanStr = props?.span as string | undefined;
    const spans = spanStr
      ? spanStr.split(",").map(s => Number(s.trim()))
      : columnsArray.map(() => Math.floor(12 / columnsArray.length));
    const visibleWhen = raw.visibleWhen as string | undefined;

    const items: { placement: { x: number; y: number; w: number; h: number }; component: Component }[] = [];
    let x = 0;
    for (let ci = 0; ci < columnsArray.length; ci++) {
      const col = columnsArray[ci]!;
      const span = spans[ci] ?? Math.floor(12 / columnsArray.length);
      const colComponents = (col.components ?? []) as Array<Record<string, unknown>>;
      for (let ri = 0; ri < colComponents.length; ri++) {
        const component = desugarComponent(colComponents[ri]!, displayerDefaults);
        items.push({ placement: { x, y: ri, w: span, h: 1 }, component });
      }
      x += span;
    }

    return {
      type: "grid",
      items,
      ...(visibleWhen ? { visibleWhen } : {}),
    };
  }

  // Type-based dispatch (navigation, external, or displayer type)
  if ("type" in raw && typeof raw.type === "string") {
    const rawType = raw.type;

    // Navigation components (case-insensitive lookup)
    const mappedNavType = NAV_TYPE_MAP[rawType] ?? NAV_TYPE_MAP[rawType.toUpperCase()];
    if (mappedNavType) {
      const props = raw.properties as Record<string, unknown> | undefined;
      const visibleWhen = raw.visibleWhen as string | undefined;

      // Build slots from inline content keys (tabs:, sections:, sidebar:, content:)
      let slots: Record<string, Component[]> | undefined;
      const slotSource = (raw.tabs ?? raw.sections) as Record<string, unknown> | undefined;
      if (slotSource && typeof slotSource === "object") {
        slots = {};
        for (const [name, content] of Object.entries(slotSource)) {
          const contentObj = content as Record<string, unknown> | undefined;
          const comps = (contentObj?.components ?? contentObj) as unknown[];
          if (Array.isArray(comps)) {
            slots[name] = comps.map(c => desugarComponent(c as Record<string, unknown>, displayerDefaults));
          }
        }
      }

      // Sidebar has sidebar: (nav) and content: (main) slots
      if (raw.sidebar && Array.isArray(raw.sidebar)) {
        slots = slots ?? {};
        slots["nav"] = (raw.sidebar as unknown[]).map(c => desugarComponent(c as Record<string, unknown>, displayerDefaults));
      }
      if (raw.content && Array.isArray(raw.content)) {
        slots = slots ?? {};
        slots["main"] = (raw.content as unknown[]).map(c => desugarComponent(c as Record<string, unknown>, displayerDefaults));
      }

      return {
        type: mappedNavType,
        ...(props ? { props } : {}),
        ...(visibleWhen ? { visibleWhen } : {}),
        ...(slots ? { slots } : {}),
      };
    }

    // External component → iframe-plugin
    if (rawType === "EXTERNAL") {
      const properties = (raw.properties as Record<string, unknown> | undefined) || {};
      const componentId = properties.componentId as string | undefined;

      // Collect settings for the component (all properties except known layout ones)
      const settings: Record<string, unknown> = {};
      const knownLayoutProps = new Set(["componentId", "height", "width"]);
      for (const [key, value] of Object.entries(properties)) {
        if (!knownLayoutProps.has(key)) {
          settings[key] = value;
        }
      }

      return {
        type: "iframe-plugin",
        props: {
          componentId,
          ...(Object.keys(settings).length > 0 ? { settings } : {}),
        },
      };
    }

    // HTML component (legacy HTML_CODE or modern content)
    if (rawType === "HTML" || rawType === "html") {
      const properties = (raw.properties as Record<string, unknown> | undefined) || {};
      const content = (properties["HTML_CODE"] ?? properties["content"]) as string | undefined;
      const style: Record<string, string> = {};
      for (const [key, value] of Object.entries(properties)) {
        if (key !== "HTML_CODE" && key !== "content") {
          style[key] = String(value);
        }
      }
      return {
        type: "html",
        props: { content: content ?? "" },
        ...(Object.keys(style).length > 0 ? { style } : {}),
      };
    }

    // Markdown component
    if (rawType === "markdown") {
      const properties = (raw.properties as Record<string, unknown> | undefined) || {};
      return {
        type: "markdown",
        props: { content: (properties["content"] as string) ?? "" },
      };
    }

    // Title component
    if (rawType === "title") {
      const properties = (raw.properties as Record<string, unknown> | undefined) || {};
      return {
        type: "title",
        props: { text: (properties["text"] as string) ?? "", size: properties["size"] as string | undefined },
      };
    }

    // Schema form — pass through props directly (not a displayer)
    if (rawType === "schema-form") {
      const properties = (raw.properties as Record<string, unknown> | undefined) ?? {};
      const style = extractStyle(raw.style);
      const visibleWhen = raw.visibleWhen as string | undefined;
      return {
        type: "schema-form",
        props: properties,
        ...(style ? { style } : {}),
        ...(visibleWhen ? { visibleWhen } : {}),
      };
    }

    // Legend component (content component — no dataset binding)
    if (rawType === "legend") {
      const properties = (raw.properties as Record<string, unknown> | undefined) || {};
      const style = extractStyle(raw.style);
      const visibleWhen = raw.visibleWhen as string | undefined;
      return {
        type: "legend",
        props: properties,
        ...(style ? { style } : {}),
        ...(visibleWhen ? { visibleWhen } : {}),
      };
    }

    // Displayer type (type: "Displayer" or type: "displayer")
    if (rawType === "Displayer" || rawType === "displayer") {
      return desugarDisplayer(raw);
    }

    // Modern data component format: type + properties
    // Route through displayer desugar for full normalization (lookup, groupBy, chart, axis, etc.)
    const normalized = LEGACY_TYPE_MAP[rawType] ?? rawType.toLowerCase();
    if (DATA_COMPONENT_TYPES.has(normalized)) {
      const rawProps = (raw.properties as Record<string, unknown> | undefined) ?? {};
      const style = extractStyle(raw.style);
      const displayerInput = { type: rawType, ...rawProps };
      const component = desugarDisplayer(displayerInput);
      const visibleWhen = raw.visibleWhen as string | undefined;
      const rawId = raw.id as string | undefined;
      return {
        ...component,
        ...(style ? { style } : {}),
        ...(rawId ? { id: rawId } : {}),
        ...(visibleWhen ? { visibleWhen } : {}),
      };
    }
  }

  // Unknown component — wrap as generic
  return {
    type: "unknown",
    props: raw,
  };
}

/**
 * Extracts CSS properties from a raw properties object.
 * Returns undefined if no properties exist.
 */
function extractStyle(
  properties: unknown,
): Record<string, string> | undefined {
  if (!properties || typeof properties !== "object") {
    return undefined;
  }

  const props = properties as Record<string, unknown>;
  const style: Record<string, string> = {};

  for (const [key, value] of Object.entries(props)) {
    if (typeof value === "string") {
      style[key] = value;
    } else if (typeof value === "object" && value !== null) {
      // Convert object values to JSON strings for CSS
      style[key] = JSON.stringify(value);
    } else if (typeof value === "number" || typeof value === "boolean") {
      // Convert primitive values to strings for CSS
      style[key] = String(value);
    }
  }

  return Object.keys(style).length > 0 ? style : undefined;
}

function deepMergeRaw(
  base: Record<string, unknown>,
  override: Record<string, unknown>,
): Record<string, unknown> {
  const result = { ...base };
  for (const [key, value] of Object.entries(override)) {
    if (
      value !== null &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      result[key] !== null &&
      typeof result[key] === "object" &&
      !Array.isArray(result[key])
    ) {
      result[key] = deepMergeRaw(
        result[key] as Record<string, unknown>,
        value as Record<string, unknown>,
      );
    } else {
      result[key] = value;
    }
  }
  return result;
}
