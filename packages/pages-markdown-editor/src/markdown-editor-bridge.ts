import { EditableTextBridge } from '@casehubio/pages-editor-core';
import type { Position, HighlightStyle } from '@casehubio/pages-editor-core';
import type { EditorView } from '@milkdown/kit/prose/view';
import { TextSelection } from '@milkdown/kit/prose/state';
import { Decoration, DecorationSet } from '@milkdown/kit/prose/view';

type Serializer = (doc: any) => string;
type Parser = (text: string) => any;

export class MarkdownEditorBridge extends EditableTextBridge {
  private _lineOffsets: number[] | null = null;
  private _cachedText: string | null = null;
  private _decorations: Map<string, { from: number; to: number; style: string }> = new Map();

  constructor(
    private readonly view: EditorView,
    private readonly serializer: Serializer,
    private readonly parser?: Parser,
  ) {
    super();
  }

  private _styleForHighlight(style: string): string {
    if (style === 'pulse') return 'background: rgba(99, 102, 241, 0.3); border-radius: 2px;';
    if (style === 'underline') return 'text-decoration: underline wavy rgba(99, 102, 241, 0.7);';
    if (style === 'glow') return 'background: rgba(99, 102, 241, 0.2); box-shadow: 0 0 4px rgba(99, 102, 241, 0.4);';
    return 'outline: 1px solid rgba(99, 102, 241, 0.5);';
  }

  private _applyDecorations(): void {
    if (!this.view.state?.doc?.content) return;
    const decos: Decoration[] = [];
    const docSize = this.view.state.doc.content.size;
    for (const [, entry] of this._decorations) {
      const from = Math.max(1, Math.min(entry.from, docSize));
      const to = Math.max(1, Math.min(entry.to, docSize));
      if (from < to) {
        decos.push(Decoration.inline(from, to, {
          style: this._styleForHighlight(entry.style),
        }));
      }
    }
    const set = DecorationSet.create(this.view.state.doc, decos);
    if (typeof (this.view as any).setProps === 'function') {
      (this.view as any).setProps({ decorations: () => set });
    }
  }

  private _getMarkdown(): string {
    return this.serializer(this.view.state.doc);
  }

  private _invalidateCache(): void {
    this._lineOffsets = null;
    this._cachedText = null;
  }

  private _ensureLineOffsets(): number[] {
    const text = this._getMarkdown();
    if (this._lineOffsets && this._cachedText === text) {
      return this._lineOffsets;
    }
    this._cachedText = text;
    const offsets = [0];
    for (let i = 0; i < text.length; i++) {
      if (text[i] === '\n') offsets.push(i + 1);
    }
    this._lineOffsets = offsets;
    return offsets;
  }

  toOffset(pos: Position): number {
    const offsets = this._ensureLineOffsets();
    if (pos.line < 0 || pos.line >= offsets.length) {
      return this._cachedText!.length;
    }
    return offsets[pos.line]! + pos.col;
  }

  toPosition(offset: number): Position {
    const offsets = this._ensureLineOffsets();
    let line = 0;
    for (let i = 1; i < offsets.length; i++) {
      if (offsets[i]! <= offset) {
        line = i;
      } else {
        break;
      }
    }
    return { line, col: offset - offsets[line]! };
  }

  override getText(): string {
    return this._getMarkdown();
  }

  override getLine(line: number): string {
    const text = this._getMarkdown();
    const lines = text.split('\n');
    if (line < 0 || line >= lines.length) return '';
    return lines[line]!;
  }

  override getLineCount(): number {
    return this._getMarkdown().split('\n').length;
  }

  override setContent(text: string): void {
    this._invalidateCache();
    if (this.parser) {
      const doc = this.parser(text);
      if (doc) {
        const { tr } = this.view.state;
        this.view.dispatch(tr.replaceWith(0, this.view.state.doc.content.size, doc.content));
        return;
      }
    }
    const { tr } = this.view.state;
    this.view.dispatch(
      tr.insertText(text, 0, this.view.state.doc.nodeSize - 2),
    );
  }

  override findText(query: string): Position[] {
    const text = this._getMarkdown();
    const results: Position[] = [];
    const lines = text.split('\n');
    for (let i = 0; i < lines.length; i++) {
      let idx = 0;
      while ((idx = lines[i]!.indexOf(query, idx)) !== -1) {
        results.push({ line: i, col: idx });
        idx += query.length;
      }
    }
    return results;
  }

  override insertText(text: string): void {
    this._invalidateCache();
    const cursor = this.view.state.selection.from;
    if (this.parser) {
      const doc = this.parser(text);
      if (doc && doc.content.size > 0) {
        const { tr } = this.view.state;
        this.view.dispatch(tr.insert(cursor, doc.content));
        return;
      }
    }
    const { tr } = this.view.state;
    this.view.dispatch(tr.insertText(text, cursor));
  }

  override replaceRange(from: Position, to: Position, text: string): void {
    this._invalidateCache();
    const fromOffset = this.toOffset(from);
    const toOffset = this.toOffset(to);
    if (this.parser) {
      const doc = this.parser(text);
      if (doc && doc.content.size > 0) {
        const { tr } = this.view.state;
        this.view.dispatch(tr.replaceWith(fromOffset, toOffset, doc.content));
        return;
      }
    }
    const { tr } = this.view.state;
    this.view.dispatch(tr.insertText(text, fromOffset, toOffset));
  }

  override deleteRange(from: Position, to: Position): void {
    this._invalidateCache();
    const fromOffset = this.toOffset(from);
    const toOffset = this.toOffset(to);
    const { tr } = this.view.state;
    this.view.dispatch(tr.delete(fromOffset, toOffset));
  }

  override setCursor(line: number, col: number): void {
    const offset = this.toOffset({ line, col });
    const { tr } = this.view.state;
    const selection = TextSelection.create(tr.doc, offset);
    this.view.dispatch(tr.setSelection(selection));
  }

  override getCursor(): Position {
    const head = this.view.state.selection.from;
    return this.toPosition(head);
  }

  protected override applyHighlight(
    id: string,
    from: Position,
    to: Position,
    style?: HighlightStyle,
  ): void {
    const fromOffset = this.toOffset(from);
    const toOffset = this.toOffset(to);
    this._decorations.set(id, { from: fromOffset, to: toOffset, style: style ?? 'pulse' });
    this._applyDecorations();
  }

  protected override removeHighlightDecoration(id: string): void {
    this._decorations.delete(id);
    this._applyDecorations();
  }

  protected override clearHighlightDecorations(): void {
    this._decorations.clear();
    this._applyDecorations();
  }

  override highlightLine(_line: number, style?: HighlightStyle): string {
    const sel = this.view.state.selection.from;
    const coords = this.view.coordsAtPos(sel);
    const cursorMidY = (coords.top + coords.bottom) / 2;

    const domPos = this.view.domAtPos(sel);
    let blockEl: Node | null = domPos.node;
    while (blockEl && !(blockEl as HTMLElement).tagName?.match(/^(P|H[1-6]|LI|TD|TH)$/)) {
      blockEl = blockEl.parentNode;
    }
    if (!blockEl) {
      const resolved = this.view.state.doc.resolve(sel);
      return this._highlightDocRange(resolved.start(), resolved.end(), style);
    }

    const range = document.createRange();
    range.selectNodeContents(blockEl);
    const rects = Array.from(range.getClientRects());

    interface LineBand { top: number; bottom: number; left: number; right: number }
    const lines: LineBand[] = [];
    for (const r of rects) {
      const existing = lines.find(l => Math.abs(l.top - r.top) <= 5);
      if (existing) {
        existing.left = Math.min(existing.left, r.left);
        existing.right = Math.max(existing.right, r.right);
        existing.bottom = Math.max(existing.bottom, r.bottom);
      } else {
        lines.push({ top: r.top, bottom: r.bottom, left: r.left, right: r.right });
      }
    }

    const cursorLine = lines.find(l => cursorMidY >= l.top - 2 && cursorMidY <= l.bottom + 2);
    if (!cursorLine) {
      const resolved = this.view.state.doc.resolve(sel);
      return this._highlightDocRange(resolved.start(), resolved.end(), style);
    }

    const lineMidY = (cursorLine.top + cursorLine.bottom) / 2;
    const startResult = this.view.posAtCoords({ left: cursorLine.left + 1, top: lineMidY });
    const endResult = this.view.posAtCoords({ left: cursorLine.right - 1, top: lineMidY });

    if (!startResult || !endResult) {
      const resolved = this.view.state.doc.resolve(sel);
      return this._highlightDocRange(resolved.start(), resolved.end(), style);
    }

    return this._highlightDocRange(startResult.pos, endResult.pos, style);
  }

  override highlightBlock(pos: Position, style?: HighlightStyle): string {
    const offset = this.toOffset(pos);
    const docSize = this.view.state.doc.content.size;
    const clamped = Math.max(1, Math.min(offset, docSize));
    const resolved = this.view.state.doc.resolve(clamped);
    let node = resolved.parent;
    let start = resolved.start();
    let end = resolved.end();
    if (node === this.view.state.doc) {
      const child = resolved.nodeAfter;
      if (child) {
        start = resolved.pos + 1;
        end = resolved.pos + child.nodeSize - 1;
        node = child;
      }
    }
    return this._highlightDocRange(start, end, style);
  }

  private _highlightDocRange(from: number, to: number, style?: HighlightStyle): string {
    const id = this._genId('hl');
    const hlStyle = style ?? 'pulse';
    this._highlights.set(id, {
      from: this.toPosition(from),
      to: this.toPosition(to),
      style: hlStyle,
    });
    this._decorations.set(id, { from, to, style: hlStyle });
    this._applyDecorations();
    return id;
  }
}
