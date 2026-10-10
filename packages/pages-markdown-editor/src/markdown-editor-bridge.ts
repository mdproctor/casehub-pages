import { EditableTextBridge, highlightOptionsToCSS, resolveHighlightStyle } from '@casehubio/pages-editor-core';
import type { Position, HighlightStyle, HighlightOptions, LineReader } from '@casehubio/pages-editor-core';
import type { EditorView } from '@milkdown/kit/prose/view';
import { TextSelection } from '@milkdown/kit/prose/state';
import { Decoration, DecorationSet } from '@milkdown/kit/prose/view';
import { HighlightRenderer } from './overlay/highlight-renderer.js';

type Serializer = (doc: any) => string;
type Parser = (text: string) => any;

export class MarkdownEditorBridge extends EditableTextBridge {
  private _lineOffsets: number[] | null = null;
  private _cachedText: string | null = null;
  private _decorations: Map<string, { from: number; to: number; style: HighlightOptions }> = new Map();
  private _highlightRenderer: HighlightRenderer | null = null;

  constructor(
    private readonly view: EditorView,
    private readonly serializer: Serializer,
    private readonly parser?: Parser,
  ) {
    super();
  }

  initOverlay(overlay: HTMLElement): void {
    this._highlightRenderer = new HighlightRenderer(overlay, (from, to) => {
      const rects: Array<{ left: number; top: number; right: number; bottom: number }> = [];
      const coordsFrom = this.view.coordsAtPos(from);
      const coordsTo = this.view.coordsAtPos(to);
      if (coordsFrom.top === coordsTo.top) {
        rects.push({ left: coordsFrom.left, top: coordsFrom.top, right: coordsTo.right, bottom: coordsTo.bottom });
      } else {
        rects.push({ left: coordsFrom.left, top: coordsFrom.top, right: coordsFrom.right, bottom: coordsFrom.bottom });
        rects.push({ left: coordsTo.left, top: coordsTo.top, right: coordsTo.right, bottom: coordsTo.bottom });
      }
      return rects;
    });
    this._highlightRenderer.startTracking();
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
          style: highlightOptionsToCSS(entry.style),
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
    style: HighlightOptions,
  ): void {
    const fromOffset = this.toOffset(from);
    const toOffset = this.toOffset(to);
    if (this._highlightRenderer) {
      this._highlightRenderer.add(id, fromOffset, toOffset, style);
    }
    this._decorations.set(id, { from: fromOffset, to: toOffset, style });
    this._applyDecorations();
  }

  protected override removeHighlightDecoration(id: string): void {
    if (this._highlightRenderer) {
      this._highlightRenderer.remove(id);
    }
    this._decorations.delete(id);
    this._applyDecorations();
  }

  protected override clearHighlightDecorations(): void {
    if (this._highlightRenderer) {
      this._highlightRenderer.clear();
    }
    this._decorations.clear();
    this._applyDecorations();
  }

  override highlightLine(_line: number, count?: number, style?: HighlightStyle | HighlightOptions): string {
    const docSize = this.view.state.doc.content.size;
    let sel = Math.max(1, Math.min(this.view.state.selection.from, docSize));
    let resolved = this.view.state.doc.resolve(sel);
    if (!resolved.parent.isTextblock) {
      let found = false;
      for (let p = 1; p < docSize; p++) {
        const r = this.view.state.doc.resolve(p);
        if (r.parent.isTextblock && r.parent.textContent.length > 0) {
          sel = r.start();
          resolved = r;
          found = true;
          break;
        }
      }
      if (!found) return this._highlightDocRange(resolved.start(), resolved.end(), style);
    }
    const coords = this.view.coordsAtPos(sel);
    const cursorMidY = (coords.top + coords.bottom) / 2;

    const domPos = this.view.domAtPos(sel);
    let blockEl: Node | null = domPos.node;
    while (blockEl && !(blockEl as HTMLElement).tagName?.match(/^(P|H[1-6]|LI|TD|TH)$/)) {
      blockEl = blockEl.parentNode;
    }
    if (!blockEl) {
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
      return this._highlightDocRange(resolved.start(), resolved.end(), style);
    }

    const blockStart = resolved.start();
    const blockEnd = resolved.end();
    const selCoords = this.view.coordsAtPos(sel);
    const lineHeight = selCoords.bottom - selCoords.top;
    const threshold = Math.max(lineHeight * 0.4, 8);

    let startPos = sel;
    for (let p = sel - 1; p >= blockStart; p--) {
      const c = this.view.coordsAtPos(p);
      if (Math.abs(c.top - selCoords.top) > threshold) break;
      startPos = p;
    }

    let endPos = sel;
    for (let p = sel; p <= blockEnd; p++) {
      const c = this.view.coordsAtPos(p);
      if (Math.abs(c.top - selCoords.top) > threshold) break;
      endPos = p;
    }

    return this._highlightDocRange(startPos, endPos, style);
  }

  override highlightBlock(pos: Position, style?: HighlightStyle | HighlightOptions): string {
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

  override highlightText(query: string, style?: HighlightStyle | HighlightOptions): string[] {
    const ids: string[] = [];
    this.view.state.doc.descendants((node, pos) => {
      if (!node.isText || !node.text) return;
      let idx = 0;
      while ((idx = node.text.indexOf(query, idx)) !== -1) {
        ids.push(this._highlightDocRange(pos + idx, pos + idx + query.length, style));
        idx += query.length;
      }
    });
    return ids;
  }

  override createReader(style?: HighlightStyle | HighlightOptions): LineReader {
    let docPos = 1;
    let hlId: string | null = null;
    let lastMode: 'sentence' | 'line' = 'sentence';
    const self = this;

    function rehighlight(): void {
      if (!hlId) return;
      if (lastMode === 'line') {
        const tr = self.view.state.tr;
        self.view.dispatch(tr.setSelection(TextSelection.create(tr.doc, docPos)));
        self.removeHighlight(hlId);
        hlId = self.highlightLine(0, 1, style);
      } else {
        self.removeHighlight(hlId);
        hlId = self.highlightSentence(self.toPosition(docPos), style);
      }
    }

    let resizeTimer: ReturnType<typeof setTimeout> | null = null;
    const onResize = () => {
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(rehighlight, 150);
    };
    window.addEventListener('resize', onResize);

    function scrollToPos(): void {
      const coords = self.view.coordsAtPos(docPos);
      let scrollParent: Element | null = self.view.dom.parentElement;
      while (scrollParent) {
        if (scrollParent.scrollHeight > scrollParent.clientHeight) break;
        scrollParent = scrollParent.parentElement;
      }
      if (!scrollParent) return;
      const rect = scrollParent.getBoundingClientRect();
      const relativeY = coords.top - rect.top;
      const threshold = rect.height * 0.6;
      if (relativeY > threshold || relativeY < 0) {
        const targetScroll = scrollParent.scrollTop + relativeY - rect.height * 0.33;
        scrollParent.scrollTo({ top: targetScroll, behavior: 'smooth' });
      }
    }

    function update(): void {
      if (hlId) self.removeHighlight(hlId);
      const docSize = self.view.state.doc.content.size;
      if (docPos >= docSize) { hlId = null; return; }
      lastMode = 'sentence';
      hlId = self.highlightSentence(self.toPosition(docPos), style);
      scrollToPos();
    }

    update();

    return {
      moveTo(pos: Position): void {
        docPos = self.toOffset(pos);
        update();
      },
      advance(): void {
        if (hlId) {
          const deco = self._decorations.get(hlId);
          if (deco) {
            let next = deco.to;
            const docSize = self.view.state.doc.content.size;
            while (next < docSize) {
              const resolved = self.view.state.doc.resolve(next);
              if (resolved.parent.isTextblock) {
                const offset = next - resolved.start();
                const ch = resolved.parent.textContent[offset];
                if (ch !== undefined && !/\s/.test(ch)) break;
              }
              next++;
            }
            if (next >= docSize) { self.removeHighlight(hlId); hlId = null; return; }
            docPos = next;
          }
        }
        update();
      },
      advanceLine(): void {
        const docSize = self.view.state.doc.content.size;
        let next = docPos + 1;
        if (hlId) {
          const deco = self._decorations.get(hlId);
          if (deco) next = deco.to + 1;
        }
        if (next >= docSize) { if (hlId) { self.removeHighlight(hlId); hlId = null; } return; }
        while (next < docSize) {
          const r = self.view.state.doc.resolve(next);
          if (r.parent.isTextblock && r.parent.textContent.length > 0) {
            docPos = next;
            const tr = self.view.state.tr;
            self.view.dispatch(tr.setSelection(TextSelection.create(tr.doc, docPos)));
            if (hlId) self.removeHighlight(hlId);
            lastMode = 'line';
            hlId = self.highlightLine(0, 1, style);
            scrollToPos();
            return;
          }
          next++;
        }
        if (hlId) { self.removeHighlight(hlId); hlId = null; }
      },
      position(): Position {
        return self.toPosition(docPos);
      },
      dispose(): void {
        window.removeEventListener('resize', onResize);
        if (hlId) { self.removeHighlight(hlId); hlId = null; }
      },
    };
  }

  override highlightSentence(pos?: Position, style?: HighlightStyle | HighlightOptions): string {
    const sel = pos ? this.toOffset(pos) : this.view.state.selection.from;
    const docSize = this.view.state.doc.content.size;
    const clamped = Math.max(1, Math.min(sel, docSize));
    const resolved = this.view.state.doc.resolve(clamped);
    const parent = resolved.parent;
    if (!parent.isTextblock) {
      return this._highlightDocRange(resolved.start(), resolved.end(), style);
    }
    const blockStart = resolved.start();
    const blockText = parent.textContent;
    const cursorOffset = clamped - blockStart;
    const sentenceEnds = /[.!?](?=\s|$)/g;
    const ranges: Array<{ start: number; end: number }> = [];
    let rangeStart = 0;
    let match;
    while ((match = sentenceEnds.exec(blockText)) !== null) {
      ranges.push({ start: rangeStart, end: match.index + 1 });
      rangeStart = match.index + 1;
      while (rangeStart < blockText.length && /\s/.test(blockText[rangeStart]!)) rangeStart++;
    }
    if (rangeStart < blockText.length) {
      ranges.push({ start: rangeStart, end: blockText.length });
    }
    if (ranges.length === 0) {
      ranges.push({ start: 0, end: blockText.length });
    }
    let sentenceStart = 0;
    let sentenceEnd = blockText.length;
    for (const range of ranges) {
      if (cursorOffset >= range.start && cursorOffset < range.end) {
        sentenceStart = range.start;
        sentenceEnd = range.end;
        break;
      }
    }
    return this._highlightDocRange(blockStart + sentenceStart, blockStart + sentenceEnd, style);
  }

  override getHighlightText(id: string): string | undefined {
    const deco = this._decorations.get(id);
    if (!deco) return undefined;
    return this.view.state.doc.textBetween(deco.from, deco.to);
  }

  override listHighlights(): Array<{ id: string; from: Position; to: Position; text: string; group?: string }> {
    return [...this._decorations.entries()].map(([id, deco]) => {
      const entry: { id: string; from: Position; to: Position; text: string; group?: string } = {
        id,
        from: this.toPosition(deco.from),
        to: this.toPosition(deco.to),
        text: this.view.state.doc.textBetween(deco.from, deco.to),
      };
      if (deco.style.group !== undefined) entry.group = deco.style.group;
      return entry;
    });
  }

  private _highlightDocRange(from: number, to: number, style?: HighlightStyle | HighlightOptions): string {
    const id = this._genId('hl');
    const resolved = resolveHighlightStyle(style);
    this._highlights.set(id, {
      from: this.toPosition(from),
      to: this.toPosition(to),
      style: resolved,
    });
    this._decorations.set(id, { from, to, style: resolved });
    this._applyDecorations();
    return id;
  }
}
