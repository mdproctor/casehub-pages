export interface ScrollAnchor {
  sourceOffset: number;
  targetOffset: number;
}

export interface HeadingInfo {
  text: string;
  offsetTop: number;
}

export function buildScrollAnchors(
  sourceHeadings: HeadingInfo[],
  targetHeadings: HeadingInfo[],
): ScrollAnchor[] {
  const targetMap = new Map<string, number>();
  for (const h of targetHeadings) {
    if (!targetMap.has(h.text)) {
      targetMap.set(h.text, h.offsetTop);
    }
  }

  const anchors: ScrollAnchor[] = [];
  for (const h of sourceHeadings) {
    const targetOffset = targetMap.get(h.text);
    if (targetOffset !== undefined) {
      anchors.push({ sourceOffset: h.offsetTop, targetOffset });
    }
  }
  return anchors;
}

export function interpolateScroll(
  sourcePosition: number,
  anchors: ScrollAnchor[],
): number {
  if (anchors.length === 0) return 0;

  if (anchors.length === 1) {
    const a = anchors[0]!;
    return sourcePosition - a.sourceOffset + a.targetOffset;
  }

  if (sourcePosition <= anchors[0]!.sourceOffset) {
    const a = anchors[0]!;
    const b = anchors[1]!;
    const ratio = (b.targetOffset - a.targetOffset) / (b.sourceOffset - a.sourceOffset);
    return a.targetOffset + (sourcePosition - a.sourceOffset) * ratio;
  }

  for (let i = 0; i < anchors.length - 1; i++) {
    const a = anchors[i]!;
    const b = anchors[i + 1]!;
    if (sourcePosition >= a.sourceOffset && sourcePosition <= b.sourceOffset) {
      const t = (sourcePosition - a.sourceOffset) / (b.sourceOffset - a.sourceOffset);
      return a.targetOffset + t * (b.targetOffset - a.targetOffset);
    }
  }

  const last = anchors[anchors.length - 1]!;
  const prev = anchors[anchors.length - 2]!;
  const ratio = (last.targetOffset - prev.targetOffset) / (last.sourceOffset - prev.sourceOffset);
  return last.targetOffset + (sourcePosition - last.sourceOffset) * ratio;
}
