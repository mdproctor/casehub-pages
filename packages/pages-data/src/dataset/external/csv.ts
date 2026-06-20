export interface CsvParseOptions {
  readonly delimiter?: string;
  readonly hasHeader?: boolean;
  readonly quote?: string;
}

export interface CsvParseResult {
  readonly headers: string[];
  readonly rows: string[][];
}

export function parseCsv(raw: string, options?: CsvParseOptions): CsvParseResult {
  const delimiter = options?.delimiter ?? ",";
  const hasHeader = options?.hasHeader ?? true;
  const quote = options?.quote ?? '"';

  const allRows = parseRows(raw, delimiter, quote);

  if (hasHeader) {
    const headerRow = allRows[0] ?? [];
    const dataRows = allRows.slice(1);
    return { headers: headerRow, rows: dataRows };
  }

  const maxCols = allRows.reduce((max, row) => Math.max(max, row.length), 0);
  const headers = Array.from({ length: maxCols }, (_, i) => `Column ${i}`);
  return { headers, rows: allRows };
}

function parseRows(raw: string, delimiter: string, quote: string): string[][] {
  const rows: string[][] = [];
  let i = 0;
  const len = raw.length;

  while (i < len) {
    // Skip empty lines
    if (raw[i] === "\n") {
      i++;
      continue;
    }
    if (raw[i] === "\r" && i + 1 < len && raw[i + 1] === "\n") {
      i += 2;
      continue;
    }

    const { fields, nextIndex } = parseRow(raw, i, delimiter, quote);
    rows.push(fields);
    i = nextIndex;
  }

  return rows;
}

function parseRow(
  raw: string,
  start: number,
  delimiter: string,
  quote: string,
): { fields: string[]; nextIndex: number } {
  const fields: string[] = [];
  let i = start;
  const len = raw.length;

  while (true) {
    const { value, nextIndex } = parseField(raw, i, delimiter, quote);
    fields.push(value);
    i = nextIndex;

    if (i >= len) {
      break;
    }

    if (raw.startsWith(delimiter, i)) {
      i += delimiter.length;
      // If delimiter is at end of input or immediately before a line ending,
      // we still need to capture the empty field after it
      if (i >= len || raw[i] === "\n" || (raw[i] === "\r" && i + 1 < len && raw[i + 1] === "\n")) {
        fields.push("");
        break;
      }
      continue;
    }

    // Line ending — consume it and stop
    if (raw[i] === "\r" && i + 1 < len && raw[i + 1] === "\n") {
      i += 2;
    } else if (raw[i] === "\n") {
      i++;
    }
    break;
  }

  return { fields, nextIndex: i };
}

function parseField(
  raw: string,
  start: number,
  delimiter: string,
  quote: string,
): { value: string; nextIndex: number } {
  const len = raw.length;

  if (start >= len) {
    return { value: "", nextIndex: start };
  }

  // Quoted field — escaped quotes require segment assembly
  if (raw[start] === quote) {
    let i = start + 1;
    const segments: string[] = [];
    let segStart = i;

    while (i < len) {
      if (raw[i] === quote) {
        if (i + 1 < len && raw[i + 1] === quote) {
          segments.push(raw.slice(segStart, i));
          segments.push(quote);
          i += 2;
          segStart = i;
        } else {
          segments.push(raw.slice(segStart, i));
          i++;
          return { value: segments.join(""), nextIndex: i };
        }
      } else {
        i++;
      }
    }

    segments.push(raw.slice(segStart, i));
    return { value: segments.join(""), nextIndex: i };
  }

  // Unquoted field — single slice from start to first delimiter/line ending
  let i = start;

  while (i < len) {
    if (raw.startsWith(delimiter, i)) break;
    if (raw[i] === "\n" || raw[i] === "\r") break;
    i++;
  }

  return { value: raw.slice(start, i), nextIndex: i };
}
