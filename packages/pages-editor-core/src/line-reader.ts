import type { EditableText, LineReader, Position, HighlightStyle, HighlightOptions } from './types.js';

export function createLineReader(
  editor: EditableText,
  style?: HighlightStyle | HighlightOptions,
): LineReader {
  let currentPos: Position = { line: 0, col: 0 };
  let highlightId: string | null = null;

  function updateHighlight(): void {
    if (highlightId) editor.removeHighlight(highlightId);
    highlightId = editor.highlightSentence(currentPos, style);
  }

  updateHighlight();

  return {
    moveTo(pos: Position): void {
      currentPos = pos;
      updateHighlight();
    },

    advance(): void {
      if (!highlightId) { updateHighlight(); return; }
      const highlights = editor.listHighlights();
      const current = highlights.find(h => h.id === highlightId);
      if (current) {
        currentPos = { line: current.to.line, col: current.to.col };
        const lineText = editor.getLine(currentPos.line);
        while (currentPos.col < lineText.length && /\s/.test(lineText[currentPos.col]!)) {
          currentPos.col++;
        }
        if (currentPos.col >= lineText.length && currentPos.line < editor.getLineCount() - 1) {
          currentPos = { line: currentPos.line + 1, col: 0 };
        }
      }
      updateHighlight();
    },

    advanceLine(): void {
      if (currentPos.line < editor.getLineCount() - 1) {
        currentPos = { line: currentPos.line + 1, col: 0 };
      }
      updateHighlight();
    },

    position(): Position {
      return { ...currentPos };
    },

    dispose(): void {
      if (highlightId) {
        editor.removeHighlight(highlightId);
        highlightId = null;
      }
    },
  };
}
