export type ExpressionScope = 'text' | 'param' | 'each' | 'from' | 'module';

export interface ExpressionSegment {
  type: ExpressionScope;
  value: string;
}

const SCOPE_MAP: Record<string, ExpressionScope> = {
  params: 'param',
  each: 'each',
  from: 'from',
  module: 'module',
};

const EXPR_RE = /\$\{(params|each|from|module)\.[^}]+\}/g;

export function parseExpressions(text: string): ExpressionSegment[] {
  const segments: ExpressionSegment[] = [];
  let lastIndex = 0;

  for (const match of text.matchAll(EXPR_RE)) {
    const idx = match.index!;
    if (idx > lastIndex) {
      segments.push({ type: 'text', value: text.slice(lastIndex, idx) });
    }
    segments.push({ type: SCOPE_MAP[match[1]!]!, value: match[0] });
    lastIndex = idx + match[0].length;
  }

  if (lastIndex < text.length) {
    segments.push({ type: 'text', value: text.slice(lastIndex) });
  }

  return segments.length > 0 ? segments : [{ type: 'text', value: text }];
}
