import { EditorView, Decoration, type DecorationSet } from '@codemirror/view';
import { StateEffect, StateField } from '@codemirror/state';
import { EditableTextBridge } from '@casehubio/pages-editor-core';
import type { Position, HighlightStyle } from '@casehubio/pages-editor-core';

const addHighlight = StateEffect.define<{ id: string; from: number; to: number; class: string }>();
const removeHighlightById = StateEffect.define<string>();
const clearAllHighlights = StateEffect.define();

interface TrackedDecoration {
  id: string;
  from: number;
  to: number;
}

const highlightField = StateField.define<{ decorations: DecorationSet; tracked: TrackedDecoration[] }>({
  create: () => ({ decorations: Decoration.none, tracked: [] }),
  update(state, tr) {
    let { decorations, tracked } = state;
    decorations = decorations.map(tr.changes);
    tracked = tracked.map((t) => ({
      ...t,
      from: tr.changes.mapPos(t.from),
      to: tr.changes.mapPos(t.to),
    }));

    for (const e of tr.effects) {
      if (e.is(addHighlight)) {
        decorations = decorations.update({
          add: [Decoration.mark({ class: e.value.class }).range(e.value.from, e.value.to)],
        });
        tracked = [...tracked, { id: e.value.id, from: e.value.from, to: e.value.to }];
      } else if (e.is(removeHighlightById)) {
        const idx = tracked.findIndex((t) => t.id === e.value);
        if (idx >= 0) {
          const t = tracked[idx]!;
          decorations = decorations.update({ filter: (from, to) => !(from === t.from && to === t.to) });
          tracked = tracked.filter((_, i) => i !== idx);
        }
      } else if (e.is(clearAllHighlights)) {
        decorations = Decoration.none;
        tracked = [];
      }
    }
    return { decorations, tracked };
  },
  provide: (f) => EditorView.decorations.from(f, (s) => s.decorations),
});

export class CodeEditorBridge extends EditableTextBridge {
  private _highlightFieldInstalled = false;

  constructor(private readonly view: EditorView) {
    super();
  }

  private toOffset(pos: Position): number {
    const line = this.view.state.doc.line(pos.line + 1);
    return line.from + pos.col;
  }

  private toPosition(offset: number): Position {
    const line = this.view.state.doc.lineAt(offset);
    return { line: line.number - 1, col: offset - line.from };
  }

  override getText(): string {
    return this.view.state.doc.toString();
  }

  override getLine(line: number): string {
    if (line < 0 || line >= this.view.state.doc.lines) return '';
    return this.view.state.doc.line(line + 1).text;
  }

  override getLineCount(): number {
    return this.view.state.doc.lines;
  }

  override setContent(text: string): void {
    this.view.dispatch({
      changes: { from: 0, to: this.view.state.doc.length, insert: text },
    });
  }

  override findText(query: string): Position[] {
    const results: Position[] = [];
    const doc = this.view.state.doc;
    for (let i = 1; i <= doc.lines; i++) {
      const lineText = doc.line(i).text;
      let idx = 0;
      while ((idx = lineText.indexOf(query, idx)) !== -1) {
        results.push({ line: i - 1, col: idx });
        idx += query.length;
      }
    }
    return results;
  }

  override insertText(text: string): void {
    const cursor = this.view.state.selection.main.head;
    this.view.dispatch({ changes: { from: cursor, insert: text } });
  }

  override replaceRange(from: Position, to: Position, text: string): void {
    this.view.dispatch({
      changes: { from: this.toOffset(from), to: this.toOffset(to), insert: text },
    });
  }

  override deleteRange(from: Position, to: Position): void {
    this.view.dispatch({
      changes: { from: this.toOffset(from), to: this.toOffset(to) },
    });
  }

  override setCursor(line: number, col: number): void {
    const anchor = this.toOffset({ line, col });
    this.view.dispatch({ selection: { anchor } });
  }

  override getCursor(): Position {
    return this.toPosition(this.view.state.selection.main.head);
  }

  private _ensureHighlightField(): void {
    if (!this._highlightFieldInstalled) {
      this.view.dispatch({ effects: StateEffect.appendConfig.of([highlightField]) });
      this._highlightFieldInstalled = true;
    }
  }

  protected override applyHighlight(id: string, from: Position, to: Position, style?: HighlightStyle): void {
    this._ensureHighlightField();
    this.view.dispatch({
      effects: addHighlight.of({
        id,
        from: this.toOffset(from),
        to: this.toOffset(to),
        class: `editor-highlight-${style ?? 'pulse'}`,
      }),
    });
  }

  protected override removeHighlightDecoration(id: string): void {
    if (this._highlightFieldInstalled) {
      this.view.dispatch({ effects: removeHighlightById.of(id) });
    }
  }

  protected override clearHighlightDecorations(): void {
    if (this._highlightFieldInstalled) {
      this.view.dispatch({ effects: clearAllHighlights.of(null) });
    }
  }
}
