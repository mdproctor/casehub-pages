import type { EditableText, Position, HighlightStyle, HighlightOptions, AnnotationOptions, EditSession, LineReader } from './types.js';
import { EditSessionActiveError } from './types.js';
import { resolveHighlightStyle } from './highlight-options.js';
import { createLineReader } from './line-reader.js';

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
  protected _highlights = new Map<string, { from: Position; to: Position; style: HighlightOptions }>();
  private _annotations = new Map<string, StoredAnnotation>();
  private _activeSession: EditSession | null = null;
  private _sessionSnapshot: SessionSnapshot | null = null;
  private _nextId = 0;

  protected _genId(prefix: string): string {
    return `${prefix}-${++this._nextId}`;
  }

  protected abstract applyHighlight(id: string, from: Position, to: Position, style: HighlightOptions): void;
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

  highlight(from: Position, to: Position, style?: HighlightStyle | HighlightOptions): string {
    const id = this._genId('hl');
    const resolved = resolveHighlightStyle(style);
    this._highlights.set(id, { from, to, style: resolved });
    this.applyHighlight(id, from, to, resolved);
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

  clearHighlightGroup(group: string): void {
    for (const [id, hl] of [...this._highlights.entries()]) {
      if (hl.style.group === group) {
        this._highlights.delete(id);
        this.removeHighlightDecoration(id);
      }
    }
  }

  getHighlightText(id: string): string | undefined {
    const hl = this._highlights.get(id);
    if (!hl) return undefined;
    const text = this.getText();
    const lines = text.split('\n');
    if (hl.from.line === hl.to.line) {
      return lines[hl.from.line]?.substring(hl.from.col, hl.to.col);
    }
    const parts: string[] = [];
    parts.push(lines[hl.from.line]?.substring(hl.from.col) ?? '');
    for (let i = hl.from.line + 1; i < hl.to.line; i++) {
      parts.push(lines[i] ?? '');
    }
    parts.push(lines[hl.to.line]?.substring(0, hl.to.col) ?? '');
    return parts.join('\n');
  }

  listHighlights(): Array<{ id: string; from: Position; to: Position; text: string; group?: string }> {
    return [...this._highlights.entries()].map(([id, hl]) => {
      const entry: { id: string; from: Position; to: Position; text: string; group?: string } = {
        id,
        from: hl.from,
        to: hl.to,
        text: this.getHighlightText(id) ?? '',
      };
      if (hl.style.group !== undefined) entry.group = hl.style.group;
      return entry;
    });
  }

  highlightRange(from: Position, to: Position, style?: HighlightStyle | HighlightOptions): string {
    return this.highlight(from, to, style);
  }

  highlightLine(line: number, count?: number, style?: HighlightStyle | HighlightOptions): string {
    const n = count ?? 1;
    const endLine = Math.min(line + n - 1, this.getLineCount() - 1);
    const endText = this.getLine(endLine);
    return this.highlight(
      { line, col: 0 },
      { line: endLine, col: endText.length },
      style,
    );
  }

  highlightBlock(pos: Position, style?: HighlightStyle | HighlightOptions): string {
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

  highlightSentence(pos?: Position, style?: HighlightStyle | HighlightOptions): string {
    const cursor = pos ?? this.getCursor();
    const lineText = this.getLine(cursor.line);
    const sentenceEnds = /[.!?](?=\s|$)/g;
    const ranges: Array<{ start: number; end: number }> = [];
    let rangeStart = 0;
    let match;
    while ((match = sentenceEnds.exec(lineText)) !== null) {
      ranges.push({ start: rangeStart, end: match.index + 1 });
      rangeStart = match.index + 1;
      while (rangeStart < lineText.length && /\s/.test(lineText[rangeStart]!)) rangeStart++;
    }
    if (rangeStart < lineText.length) {
      ranges.push({ start: rangeStart, end: lineText.length });
    }
    if (ranges.length === 0) {
      ranges.push({ start: 0, end: lineText.length });
    }
    let sentenceStart = 0;
    let sentenceEnd = lineText.length;
    for (const range of ranges) {
      if (cursor.col >= range.start && cursor.col < range.end) {
        sentenceStart = range.start;
        sentenceEnd = range.end;
        break;
      }
    }
    return this.highlight(
      { line: cursor.line, col: sentenceStart },
      { line: cursor.line, col: sentenceEnd },
      style,
    );
  }

  highlightText(query: string, style?: HighlightStyle | HighlightOptions): string[] {
    const positions = this.findText(query);
    return positions.map(pos =>
      this.highlight(pos, { line: pos.line, col: pos.col + query.length }, style),
    );
  }

  createReader(style?: HighlightStyle | HighlightOptions): LineReader {
    return createLineReader(this, style);
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

  get activeHighlights(): ReadonlyMap<string, { from: Position; to: Position; style: HighlightOptions }> {
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
