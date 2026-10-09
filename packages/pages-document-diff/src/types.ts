export interface DiffChunk {
  op: string;
  aStart: number;
  aEnd: number;
  bStart: number;
  bEnd: number;
}

export interface PanelState {
  path: string | null;
  content: string | null;
  label: string;
}

export interface ScrollAnchor {
  a: number;
  b: number;
  [key: string]: number;
}

export interface DiffSummary {
  modified: number;
  deleted: number;
  inserted: number;
  currentIdx: number;
  totalDiffs: number;
}
