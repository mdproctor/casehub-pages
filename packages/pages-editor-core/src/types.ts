export interface Position {
  line: number;
  col: number;
}

export type HighlightStyle = 'pulse' | 'underline' | 'glow' | 'box';

export interface AnnotationOptions {
  type: 'arrow' | 'callout' | 'marker' | 'numbered';
  text?: string;
  style?: Record<string, string>;
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

  highlight(from: Position, to: Position, style?: HighlightStyle): string;
  removeHighlight(id: string): void;
  clearHighlights(): void;

  addAnnotation(anchor: Position, options: AnnotationOptions): string;
  removeAnnotation(id: string): void;
  clearAnnotations(): void;

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
