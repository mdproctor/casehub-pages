export type { Position, EditableText } from '@casehubio/pages-editor-core';
export { EDITABLE_TEXT, isEditableText, findEditableText } from '@casehubio/pages-editor-core';

// Backward compat alias — will be removed in a future release
import type { EditableText } from '@casehubio/pages-editor-core';
/** @deprecated Use EditableText from @casehubio/pages-editor-core */
export type ScenarioEditableText = EditableText;
