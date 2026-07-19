export interface ScrollWindow {
  readonly startIndex: number;
  readonly endIndex: number;
  readonly offsetY: number;
  readonly totalHeight: number;
}

import type { SpanMap } from './span-map.js';
import { isSuppressed, isOrigin } from './span-map.js';

export function extendWindowForSpans(
  window: ScrollWindow,
  spanMap: SpanMap,
  spanColumns: ReadonlySet<string>,
): ScrollWindow {
  if (spanMap.size === 0 || spanColumns.size === 0) return window;

  let { startIndex, endIndex } = window;
  const originalStart = startIndex;

  for (const colId of spanColumns) {
    const entry = spanMap.get(originalStart)?.get(colId);
    if (entry && isSuppressed(entry)) {
      startIndex = Math.min(startIndex, entry.originRow);
    }
  }

  for (let r = Math.max(startIndex, endIndex - 10); r < endIndex; r++) {
    const rowEntries = spanMap.get(r);
    if (!rowEntries) continue;
    for (const [colId, entry] of rowEntries) {
      if (!spanColumns.has(colId)) continue;
      if (isOrigin(entry) && r + entry.rowSpan > endIndex) {
        endIndex = Math.max(endIndex, r + entry.rowSpan);
      }
    }
  }

  return { ...window, startIndex, endIndex };
}

export function computeScrollWindow(
  scrollTop: number,
  containerHeight: number,
  rowHeight: number,
  rowCount: number,
  bufferSize: number,
): ScrollWindow {
  const totalHeight = rowCount * rowHeight;

  if (rowCount === 0) {
    return { startIndex: 0, endIndex: 0, offsetY: 0, totalHeight: 0 };
  }

  const visibleCount = Math.ceil(containerHeight / rowHeight);
  const firstVisible = Math.floor(scrollTop / rowHeight);

  const startIndex = Math.max(0, firstVisible - bufferSize);
  const endIndex = Math.min(rowCount, firstVisible + visibleCount + bufferSize);
  const offsetY = startIndex * rowHeight;

  return { startIndex, endIndex, offsetY, totalHeight };
}
