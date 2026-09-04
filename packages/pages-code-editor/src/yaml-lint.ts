import { linter, type Diagnostic } from '@codemirror/lint';
import { parse } from 'yaml';

export const yamlLinter = linter((view) => {
  const diagnostics: Diagnostic[] = [];
  const doc = view.state.doc.toString();
  if (!doc.trim()) return diagnostics;

  try {
    parse(doc, { strict: true });
  } catch (e: unknown) {
    if (e && typeof e === 'object' && 'linePos' in e) {
      const yamlError = e as { message: string; linePos?: Array<{ line: number; col: number }> };
      const pos = yamlError.linePos?.[0];
      if (pos) {
        const line = view.state.doc.line(Math.min(pos.line, view.state.doc.lines));
        const from = line.from + Math.min(pos.col - 1, line.length);
        const to = line.to;
        diagnostics.push({
          from,
          to,
          severity: 'error',
          message: yamlError.message.split('\n')[0] ?? 'YAML parse error',
        });
      }
    }
  }
  return diagnostics;
});
