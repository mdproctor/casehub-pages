import { autocompletion, type CompletionContext, type CompletionResult } from '@codemirror/autocomplete';

const TOP_LEVEL_KEYS = [
  { label: 'pages', detail: 'page definitions' },
  { label: 'datasets', detail: 'inline data sources' },
  { label: 'navTree', detail: 'navigation structure' },
  { label: 'properties', detail: 'global properties' },
];

const PAGE_KEYS = [
  { label: 'name', detail: 'page name' },
  { label: 'components', detail: 'component list' },
  { label: 'rows', detail: 'row layout' },
  { label: 'columns', detail: 'column layout' },
];

const COMPONENT_KEYS = [
  { label: 'type', detail: 'component type' },
  { label: 'properties', detail: 'component properties' },
  { label: 'div', detail: 'container div id' },
  { label: 'span', detail: 'column span (1-12)' },
];

const COMPONENT_TYPES = [
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

const PROPERTY_KEYS = [
  { label: 'text', detail: 'display text' },
  { label: 'value', detail: 'display value' },
  { label: 'content', detail: 'content (markdown/html)' },
  { label: 'width', detail: 'element width' },
  { label: 'height', detail: 'element height' },
  { label: 'lookup', detail: 'data lookup' },
  { label: 'chart', detail: 'chart options' },
  { label: 'subtype', detail: 'component subtype' },
  { label: 'size', detail: 'size (h1-h6 for titles)' },
  { label: 'navGroupId', detail: 'navigation group id' },
  { label: 'targetDivId', detail: 'target container id' },
];

const LOOKUP_KEYS = [
  { label: 'uuid', detail: 'dataset identifier' },
  { label: 'group', detail: 'grouping operations' },
  { label: 'filter', detail: 'filter operations' },
  { label: 'sort', detail: 'sort operations' },
];

const DATASET_KEYS = [
  { label: 'uuid', detail: 'dataset identifier' },
  { label: 'content', detail: 'inline data (JSON array)' },
  { label: 'columns', detail: 'column definitions' },
  { label: 'url', detail: 'data source URL' },
  { label: 'accumulate', detail: 'accumulate rows' },
  { label: 'expression', detail: 'JSONata expression' },
];

const COLUMN_KEYS = [
  { label: 'id', detail: 'column identifier' },
  { label: 'type', detail: 'column type' },
];

const COLUMN_TYPES = [
  { label: 'LABEL', detail: 'text label' },
  { label: 'NUMBER', detail: 'numeric value' },
  { label: 'DATE', detail: 'date value' },
  { label: 'TEXT', detail: 'long text' },
];

function getIndentLevel(line: string): number {
  const match = line.match(/^(\s*)/);
  return match?.[1]?.length ?? 0;
}

function findContext(doc: string, pos: number): string {
  const lines = doc.substring(0, pos).split('\n');
  const currentLine = lines[lines.length - 1] ?? '';
  const currentIndent = getIndentLevel(currentLine);
  const trimmed = currentLine.trim();

  if (trimmed.startsWith('- type:') || trimmed === '- type:' || trimmed === 'type:') {
    return 'component-type-value';
  }
  if (trimmed.startsWith('type:') && trimmed.length > 5) {
    return 'component-type-value';
  }

  for (let i = lines.length - 2; i >= 0; i--) {
    const rawLine = lines[i] ?? '';
    const prevLine = rawLine.trim();
    const prevIndent = getIndentLevel(rawLine);
    if (prevIndent >= currentIndent && prevLine !== '') continue;
    if (prevIndent < currentIndent) {
      if (prevLine === 'columns:' || prevLine === '- columns:') return 'column-type-value';
      if (prevLine.startsWith('type:')) return 'property';
      if (prevLine === 'properties:') return 'property';
      if (prevLine === 'lookup:') return 'lookup';
      if (prevLine === 'datasets:' || prevLine === '- datasets:') return 'dataset';
      if (prevLine === 'columns:') return 'column';
      if (prevLine === 'pages:') return 'page';
      if (prevLine.startsWith('- name:')) return 'page';
      if (prevLine === 'components:') return 'component';
      if (prevLine === 'rows:') return 'component';
      break;
    }
  }

  if (currentIndent === 0) return 'top';
  return 'component';
}

function yamlCompletionSource(context: CompletionContext): CompletionResult | null {
  const line = context.state.doc.lineAt(context.pos);
  const textBefore = line.text.substring(0, context.pos - line.from);

  const afterColon = textBefore.match(/(?:^|\s)-?\s*type:\s*(\S*)$/);
  if (afterColon) {
    const matched = afterColon[1] ?? '';
    return {
      from: context.pos - matched.length,
      options: COMPONENT_TYPES.map(t => ({ ...t, type: 'enum' as const })),
    };
  }

  const afterColumnType = textBefore.match(/type:\s*(\S*)$/);
  const ctx = findContext(context.state.doc.toString(), context.pos);
  if (afterColumnType && ctx === 'column-type-value') {
    const matched = afterColumnType[1] ?? '';
    return {
      from: context.pos - matched.length,
      options: COLUMN_TYPES.map(t => ({ ...t, type: 'enum' as const })),
    };
  }

  const keyMatch = textBefore.match(/(?:^|\s)-?\s*(\w*)$/);
  if (!keyMatch) return null;

  const prefix = keyMatch[1] ?? '';
  if (!prefix && !context.explicit) return null;

  let options: Array<{ label: string; detail: string }>;

  switch (ctx) {
    case 'top': options = TOP_LEVEL_KEYS; break;
    case 'page': options = PAGE_KEYS; break;
    case 'component': options = COMPONENT_KEYS; break;
    case 'property': options = PROPERTY_KEYS; break;
    case 'lookup': options = LOOKUP_KEYS; break;
    case 'dataset': options = DATASET_KEYS; break;
    case 'column': options = COLUMN_KEYS; break;
    default: options = COMPONENT_KEYS;
  }

  return {
    from: context.pos - prefix.length,
    options: options.map(o => ({ ...o, type: 'property' as const, apply: o.label + ': ' })),
  };
}

export const yamlCompletion = autocompletion({
  override: [yamlCompletionSource],
  activateOnTyping: true,
});
