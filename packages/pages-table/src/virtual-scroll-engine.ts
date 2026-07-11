export interface ScrollWindow {
  readonly startIndex: number;
  readonly endIndex: number;
  readonly offsetY: number;
  readonly totalHeight: number;
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
