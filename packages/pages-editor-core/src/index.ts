export type { Position, HighlightStyle, HighlightOptions, AnnotationOptions, EditSession, EditableText, LineReader } from './types.js';
export { createLineReader } from './line-reader.js';
export { resolveHighlightStyle, highlightOptionsToCSS } from './highlight-options.js';
export { EditSessionActiveError } from './types.js';
export { EDITABLE_TEXT, isEditableText, findEditableText } from './discovery.js';
export { EditableTextBridge } from './editable-text-bridge.js';
export type { StoredAnnotation } from './editable-text-bridge.js';
export { McpToolAdapter } from './mcp-tool-adapter.js';
export { MCP_TOOL_DEFINITIONS, type McpToolDefinition } from './mcp-tool-definitions.js';
