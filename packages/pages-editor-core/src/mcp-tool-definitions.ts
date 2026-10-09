export interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, any>;
}

const positionSchema = {
  type: 'object',
  properties: {
    line: { type: 'number', description: 'Zero-based line number' },
    col: { type: 'number', description: 'Zero-based column offset' },
  },
  required: ['line', 'col'],
};

export const MCP_TOOL_DEFINITIONS: McpToolDefinition[] = [
  {
    name: 'editor_get_content',
    description: 'Get the full document text.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'editor_set_content',
    description: 'Replace the entire document with new text.',
    inputSchema: {
      type: 'object',
      properties: { text: { type: 'string', description: 'New document content' } },
      required: ['text'],
    },
  },
  {
    name: 'editor_get_line',
    description: 'Get the text of a specific line.',
    inputSchema: {
      type: 'object',
      properties: { line: { type: 'number', description: 'Zero-based line number' } },
      required: ['line'],
    },
  },
  {
    name: 'editor_find_text',
    description: 'Find all occurrences of a text query. Returns an array of positions.',
    inputSchema: {
      type: 'object',
      properties: { query: { type: 'string', description: 'Text to search for' } },
      required: ['query'],
    },
  },
  {
    name: 'editor_find_heading',
    description: 'Find a markdown heading by text. Returns position and section end, or reports ambiguity.',
    inputSchema: {
      type: 'object',
      properties: { heading: { type: 'string', description: 'Heading text without # prefix' } },
      required: ['heading'],
    },
  },
  {
    name: 'editor_replace_range',
    description: 'Replace text between two positions.',
    inputSchema: {
      type: 'object',
      properties: {
        from: { ...positionSchema, description: 'Start position' },
        to: { ...positionSchema, description: 'End position' },
        text: { type: 'string', description: 'Replacement text' },
      },
      required: ['from', 'to', 'text'],
    },
  },
  {
    name: 'editor_insert_text',
    description: 'Insert text at the current cursor position.',
    inputSchema: {
      type: 'object',
      properties: { text: { type: 'string', description: 'Text to insert' } },
      required: ['text'],
    },
  },
  {
    name: 'editor_get_cursor',
    description: 'Get the current cursor position.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'editor_set_cursor',
    description: 'Move the cursor to a specific position.',
    inputSchema: {
      type: 'object',
      properties: {
        line: { type: 'number', description: 'Zero-based line number' },
        col: { type: 'number', description: 'Zero-based column offset' },
      },
      required: ['line', 'col'],
    },
  },
  {
    name: 'editor_highlight',
    description: 'Add an inline highlight decoration to a text range. Returns a decoration ID.',
    inputSchema: {
      type: 'object',
      properties: {
        from: { ...positionSchema, description: 'Start position' },
        to: { ...positionSchema, description: 'End position' },
        style: { type: 'string', enum: ['pulse', 'underline', 'glow', 'box'], description: 'Highlight style (default: pulse)' },
      },
      required: ['from', 'to'],
    },
  },
  {
    name: 'editor_remove_highlight',
    description: 'Remove a highlight decoration by ID.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string', description: 'Highlight ID returned by editor_highlight' } },
      required: ['id'],
    },
  },
  {
    name: 'editor_annotate',
    description: 'Add a floating annotation at a position. Returns an annotation ID.',
    inputSchema: {
      type: 'object',
      properties: {
        anchor: { ...positionSchema, description: 'Anchor position' },
        type: { type: 'string', enum: ['arrow', 'callout', 'marker', 'numbered'], description: 'Annotation type' },
        text: { type: 'string', description: 'Annotation text (for callout/numbered)' },
        style: { type: 'object', description: 'CSS style overrides' },
      },
      required: ['anchor', 'type'],
    },
  },
  {
    name: 'editor_remove_annotation',
    description: 'Remove a floating annotation by ID.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string', description: 'Annotation ID returned by editor_annotate' } },
      required: ['id'],
    },
  },
  {
    name: 'editor_clear_overlays',
    description: 'Remove all highlights and annotations.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'editor_begin_session',
    description: 'Begin an exclusive edit session. The editor becomes read-only for other users.',
    inputSchema: {
      type: 'object',
      properties: { owner: { type: 'string', description: 'Session owner identifier' } },
      required: ['owner'],
    },
  },
  {
    name: 'editor_end_session',
    description: 'End the active edit session, returning the editor to normal mode.',
    inputSchema: { type: 'object', properties: {} },
  },
];
