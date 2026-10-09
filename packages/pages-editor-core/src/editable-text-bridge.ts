import type { EditableText, Position, HighlightStyle, AnnotationOptions, EditSession } from './types.js';
import { EditSessionActiveError } from './types.js';

export interface StoredAnnotation {
  anchor: Position;
  options: AnnotationOptions;
}

interface SessionSnapshot {
  text: string;
  highlightIds: Set<string>;
  annotationIds: Set<string>;
}

export abstract class EditableTextBridge implements EditableText {
  protected _highlights = new Map<string, { from: Position; to: Position; style: HighlightStyle | undefined }>();
  private _annotations = new Map<string, StoredAnnotation>();
  private _activeSession: EditSession | null = null;
  private _sessionSnapshot: SessionSnapshot | null = null;
  private _nextId = 0;

  protected _genId(prefix: string): string {
    return `${prefix}-${++this._nextId}`;
  }

  protected abstract applyHighlight(id: string, from: Position, to: Position, style?: HighlightStyle): void;
  protected abstract removeHighlightDecoration(id: string): void;
  protected abstract clearHighlightDecorations(): void;

  abstract getText(): string;
  abstract getLine(line: number): string;
  abstract getLineCount(): number;
  abstract setContent(text: string): void;
  abstract findText(query: string): Position[];
  abstract insertText(text: string): void;
  abstract replaceRange(from: Position, to: Position, text: string): void;
  abstract deleteRange(from: Position, to: Position): void;
  abstract setCursor(line: number, col: number): void;
  abstract getCursor(): Position;

  highlight(from: Position, to: Position, style?: HighlightStyle): string {
    const id = this._genId('hl');
    this._highlights.set(id, { from, to, style });
    this.applyHighlight(id, from, to, style);
    return id;
  }

  removeHighlight(id: string): void {
    if (this._highlights.delete(id)) {
      this.removeHighlightDecoration(id);
    }
  }

  clearHighlights(): void {
    this._highlights.clear();
    this.clearHighlightDecorations();
  }

  highlightRange(from: Position, to: Position, style?: HighlightStyle): string {
    return this.highlight(from, to, style);
  }

  highlightLine(line: number, style?: HighlightStyle): string {
    const text = this.getLine(line);
    return this.highlight({ line, col: 0 }, { line, col: text.length }, style);
  }

  highlightBlock(pos: Position, style?: HighlightStyle): string {
    const lineCount = this.getLineCount();
    let startLine = pos.line;
    let endLine = pos.line;
    while (startLine > 0 && this.getLine(startLine - 1).trim() !== '') {
      startLine--;
    }
    while (endLine < lineCount - 1 && this.getLine(endLine + 1).trim() !== '') {
      endLine++;
    }
    return this.highlight(
      { line: startLine, col: 0 },
      { line: endLine, col: this.getLine(endLine).length },
      style,
    );
  }

  addAnnotation(anchor: Position, options: AnnotationOptions): string {
    const id = this._genId('ann');
    this._annotations.set(id, { anchor, options });
    return id;
  }

  removeAnnotation(id: string): void {
    this._annotations.delete(id);
  }

  clearAnnotations(): void {
    this._annotations.clear();
  }

  getAnnotation(id: string): StoredAnnotation | undefined {
    return this._annotations.get(id);
  }

  get annotationCount(): number {
    return this._annotations.size;
  }

  get activeHighlights(): ReadonlyMap<string, { from: Position; to: Position; style: HighlightStyle | undefined }> {
    return this._highlights;
  }

  get activeAnnotations(): ReadonlyMap<string, StoredAnnotation> {
    return this._annotations;
  }

  beginEditSession(owner: string): EditSession {
    if (this._activeSession) {
      throw new EditSessionActiveError(this._activeSession.owner, this._activeSession.startedAt);
    }
    this._sessionSnapshot = {
      text: this.getText(),
      highlightIds: new Set(this._highlights.keys()),
      annotationIds: new Set(this._annotations.keys()),
    };
    const session: EditSession = {
      owner,
      mode: 'exclusive',
      startedAt: new Date().toISOString(),
      cancel: () => { this._rollback(); },
    };
    this._activeSession = session;
    return session;
  }

  private _rollback(): void {
    if (!this._sessionSnapshot) {
      this._activeSession = null;
      return;
    }
    const snap = this._sessionSnapshot;
    this.setContent(snap.text);
    for (const id of [...this._highlights.keys()]) {
      if (!snap.highlightIds.has(id)) {
        this.removeHighlight(id);
      }
    }
    for (const id of [...this._annotations.keys()]) {
      if (!snap.annotationIds.has(id)) {
        this.removeAnnotation(id);
      }
    }
    this._activeSession = null;
    this._sessionSnapshot = null;
  }

  endEditSession(session: EditSession): void {
    if (this._activeSession === session) {
      this._activeSession = null;
      this._sessionSnapshot = null;
    }
  }

  get isSessionActive(): boolean {
    return this._activeSession !== null;
  }
}
