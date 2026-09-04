import { autocompletion, type CompletionContext, type CompletionResult } from '@codemirror/autocomplete';

type Entry = { label: string; detail: string };

const CONTEXT_KEYS: Record<string, Entry[]> = {
  'top': [
    { label: 'pages', detail: 'page definitions' },
    { label: 'datasets', detail: 'inline data sources' },
    { label: 'navTree', detail: 'navigation structure' },
    { label: 'properties', detail: 'global properties' },
  ],
  'pages': [
    { label: 'name', detail: 'page name' },
    { label: 'components', detail: 'component list' },
    { label: 'rows', detail: 'row layout' },
    { label: 'columns', detail: 'column layout' },
    { label: 'properties', detail: 'page properties' },
  ],
  'rows': [
    { label: 'columns', detail: 'column layout' },
    { label: 'properties', detail: 'row properties' },
  ],
  'columns': [
    { label: 'span', detail: 'column span (1-12)' },
    { label: 'components', detail: 'component list' },
    { label: 'properties', detail: 'column properties' },
  ],
  'components': [
    { label: 'type', detail: 'component type' },
    { label: 'properties', detail: 'component properties' },
    { label: 'div', detail: 'container div id' },
  ],
  'properties': [
    { label: 'text', detail: 'display text' },
    { label: 'value', detail: 'display value' },
    { label: 'content', detail: 'content (markdown/html)' },
    { label: 'width', detail: 'element width' },
    { label: 'height', detail: 'element height' },
    { label: 'lookup', detail: 'data lookup config' },
    { label: 'chart', detail: 'chart display options' },
    { label: 'subtype', detail: 'component subtype' },
    { label: 'size', detail: 'size (h1-h6 for titles)' },
    { label: 'navGroupId', detail: 'navigation group id' },
    { label: 'targetDivId', detail: 'target container id' },
    { label: 'style', detail: 'inline CSS style' },
    { label: 'html', detail: 'raw HTML string' },
  ],
  'chart': [
    { label: 'title', detail: 'chart title' },
    { label: 'margin', detail: 'chart margins' },
    { label: 'zoom', detail: 'enable zoom (true/false)' },
    { label: 'legend', detail: 'legend display (true/false)' },
    { label: 'grid', detail: 'grid display options' },
    { label: 'tooltip', detail: 'tooltip options' },
    { label: 'backgroundColor', detail: 'chart background color' },
    { label: 'textColor', detail: 'chart text color' },
    { label: 'animation', detail: 'enable animation' },
  ],
  'margin': [
    { label: 'left', detail: 'left margin (px)' },
    { label: 'right', detail: 'right margin (px)' },
    { label: 'top', detail: 'top margin (px)' },
    { label: 'bottom', detail: 'bottom margin (px)' },
  ],
  'lookup': [
    { label: 'uuid', detail: 'dataset identifier' },
    { label: 'group', detail: 'grouping operations' },
    { label: 'filter', detail: 'filter operations' },
    { label: 'sort', detail: 'sort operations' },
  ],
  'group': [
    { label: 'columnGroup', detail: 'grouping column' },
    { label: 'functions', detail: 'aggregation functions' },
  ],
  'columnGroup': [
    { label: 'source', detail: 'source column id' },
  ],
  'functions': [
    { label: 'source', detail: 'source column id' },
    { label: 'function', detail: 'aggregation (SUM, COUNT, AVG, MIN, MAX)' },
  ],
  'datasets': [
    { label: 'uuid', detail: 'dataset identifier' },
    { label: 'content', detail: 'inline data (JSON array)' },
    { label: 'columns', detail: 'column definitions' },
    { label: 'url', detail: 'data source URL' },
    { label: 'accumulate', detail: 'accumulate rows' },
    { label: 'expression', detail: 'JSONata expression' },
  ],
  'dataset-columns': [
    { label: 'id', detail: 'column identifier' },
    { label: 'type', detail: 'column type' },
  ],
  'navTree': [
    { label: 'root_items', detail: 'root navigation items' },
  ],
  'root_items': [
    { label: 'type', detail: 'item type (GROUP, ITEM)' },
    { label: 'id', detail: 'item identifier' },
    { label: 'children', detail: 'child items' },
    { label: 'page', detail: 'target page name' },
  ],
};

const COMPONENT_TYPES: Entry[] = [
  { label: 'bar-chart', detail: 'bar/column chart' },
  { label: 'line-chart', detail: 'line chart' },
  { label: 'area-chart', detail: 'area chart' },
  { label: 'pie-chart', detail: 'pie/donut chart' },
  { label: 'scatter-chart', detail: 'scatter plot' },
  { label: 'bubble-chart', detail: 'bubble chart' },
  { label: 'timeseries', detail: 'time series chart' },
  { label: 'timeline', detail: 'event timeline' },
  { label: 'heatmap', detail: 'heatmap chart' },
  { label: 'treemap', detail: 'treemap chart' },
  { label: 'histogram', detail: 'histogram' },
  { label: 'metric', detail: 'single value metric' },
  { label: 'meter', detail: 'gauge meter' },
  { label: 'data-table', detail: 'data table' },
  { label: 'markdown', detail: 'markdown content' },
  { label: 'html', detail: 'raw HTML content' },
  { label: 'title', detail: 'heading text' },
  { label: 'tabs', detail: 'tabbed navigation' },
  { label: 'selector', detail: 'filter selector' },
  { label: 'action-button', detail: 'action button' },
  { label: 'badge', detail: 'status badge' },
  { label: 'countdown', detail: 'countdown timer' },
  { label: 'alert', detail: 'alert banner' },
  { label: 'schema-form', detail: 'schema-driven form' },
  { label: 'grouped-view', detail: 'grouped data view' },
  { label: 'graph', detail: 'graph visualization' },
  { label: 'iframe-plugin', detail: 'iframe component' },
  { label: 'legend', detail: 'chart legend' },
  { label: 'map', detail: 'geographic map' },
];

const COLUMN_TYPES: Entry[] = [
  { label: 'LABEL', detail: 'text label' },
  { label: 'NUMBER', detail: 'numeric value' },
  { label: 'DATE', detail: 'date value' },
  { label: 'TEXT', detail: 'long text' },
];

function getIndentLevel(line: string): number {
  const match = line.match(/^(\s*)/);
  return match?.[1]?.length ?? 0;
}

function extractKey(line: string): string | null {
  const trimmed = line.trim().replace(/^-\s*/, '');
  const match = trimmed.match(/^(\w[\w-]*):/);
  return match?.[1] ?? null;
}

function buildAncestorPath(doc: string, pos: number): string[] {
  const lines = doc.substring(0, pos).split('\n');
  const currentLine = lines[lines.length - 1] ?? '';
  const currentIndent = getIndentLevel(currentLine);
  const path: string[] = [];
  let targetIndent = currentIndent;

  for (let i = lines.length - 2; i >= 0; i--) {
    const rawLine = lines[i] ?? '';
    const lineIndent = getIndentLevel(rawLine);
    if (rawLine.trim() === '') continue;
    if (lineIndent < targetIndent) {
      const key = extractKey(rawLine);
      if (key) {
        path.unshift(key);
        targetIndent = lineIndent;
      }
      if (lineIndent === 0) break;
    }
  }
  return path;
}

function resolveContext(path: string[]): string {
  if (path.length === 0) return 'top';

  for (let i = path.length - 1; i >= 0; i--) {
    const key = path[i] ?? '';
    if (key === 'columns' && path.slice(0, i).includes('datasets')) return 'dataset-columns';
    if (CONTEXT_KEYS[key]) return key;
  }

  return 'top';
}

function yamlCompletionSource(context: CompletionContext): CompletionResult | null {
  const line = context.state.doc.lineAt(context.pos);
  const textBefore = line.text.substring(0, context.pos - line.from);
  const doc = context.state.doc.toString();
  const path = buildAncestorPath(doc, context.pos);

  const afterTypeColon = textBefore.match(/(?:^|\s)-?\s*type:\s*(\S*)$/);
  if (afterTypeColon) {
    const matched = afterTypeColon[1] ?? '';
    const ctx = resolveContext(path);
    if (ctx === 'dataset-columns') {
      return {
        from: context.pos - matched.length,
        options: COLUMN_TYPES.map(t => ({ ...t, type: 'enum' as const })),
      };
    }
    return {
      from: context.pos - matched.length,
      options: COMPONENT_TYPES.map(t => ({ ...t, type: 'enum' as const })),
    };
  }

  const keyMatch = textBefore.match(/(?:^|\s)-?\s*(\w[\w-]*)$/);
  if (!keyMatch) {
    const emptyMatch = textBefore.match(/(?:^|\s)-?\s*$/);
    if (!emptyMatch || !context.explicit) return null;
    const ctx = resolveContext(path);
    const options = CONTEXT_KEYS[ctx];
    if (!options) return null;
    return {
      from: context.pos,
      options: options.map(o => ({ ...o, type: 'property' as const, apply: o.label + ': ' })),
    };
  }

  const prefix = keyMatch[1] ?? '';
  if (!prefix && !context.explicit) return null;

  const ctx = resolveContext(path);
  const options = CONTEXT_KEYS[ctx];
  if (!options) return null;

  return {
    from: context.pos - prefix.length,
    options: options.map(o => ({ ...o, type: 'property' as const, apply: o.label + ': ' })),
  };
}

export const yamlCompletion = autocompletion({
  override: [yamlCompletionSource],
  activateOnTyping: true,
});
