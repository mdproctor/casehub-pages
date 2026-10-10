export interface Position {
  line: number;
  col: number;
}

export interface HighlightOptions {
  background?: string;
  border?: string;
  borderRadius?: string;
  textDecoration?: string;
  label?: string;
  group?: string;
}

export type HighlightStyle = 'pulse' | 'underline' | 'glow' | 'box' | 'error' | 'suggestion';

export interface AnnotationOptions {
  type: 'arrow' | 'callout' | 'marker' | 'numbered';
  text?: string;
  style?: Record<string, string>;
}

export interface LineReader {
  moveTo(pos: Position): void;
  advance(): void;
  advanceLine(): void;
  position(): Position;
  dispose(): void;
}

export interface EditSession {
  readonly owner: string;
  readonly mode: 'exclusive';
  readonly startedAt: string;
  cancel(): void;
}

export interface EditableText {
  getText(): string;
  getLine(line: number): string;
  getLineCount(): number;
  setContent(text: string): void;

  findText(query: string): Position[];

  insertText(text: string): void;
  replaceRange(from: Position, to: Position, text: string): void;
  deleteRange(from: Position, to: Position): void;

  setCursor(line: number, col: number): void;
  getCursor(): Position;

  highlight(from: Position, to: Position, style?: HighlightStyle | HighlightOptions): string;
  highlightLine(line: number, count?: number, style?: HighlightStyle | HighlightOptions): string;
  highlightBlock(pos: Position, style?: HighlightStyle | HighlightOptions): string;
  highlightRange(from: Position, to: Position, style?: HighlightStyle | HighlightOptions): string;
  highlightSentence(pos?: Position, style?: HighlightStyle | HighlightOptions): string;
  highlightText(query: string, style?: HighlightStyle | HighlightOptions): string[];
  getHighlightText(id: string): string | undefined;
  listHighlights(): Array<{ id: string; from: Position; to: Position; text: string; group?: string }>;
  removeHighlight(id: string): void;
  clearHighlights(): void;
  clearHighlightGroup(group: string): void;

  addAnnotation(anchor: Position, options: AnnotationOptions): string;
  removeAnnotation(id: string): void;
  clearAnnotations(): void;

  createReader(style?: HighlightStyle | HighlightOptions): LineReader;

  beginEditSession(owner: string): EditSession;
  endEditSession(session: EditSession): void;

  triggerCompletion?(): void;
  selectCompletion?(label: string): boolean;
}

export class EditSessionActiveError extends Error {
  constructor(
    public readonly owner: string,
    public readonly startedAt: string,
  ) {
    super(`Edit session already active (owner: '${owner}', since: ${startedAt})`);
    this.name = 'EditSessionActiveError';
  }
}
