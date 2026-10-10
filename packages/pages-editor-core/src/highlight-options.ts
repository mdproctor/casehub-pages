import type { HighlightOptions, HighlightStyle } from './types.js';

const PRESETS: Record<HighlightStyle, HighlightOptions> = {
  pulse: { background: 'rgba(99, 102, 241, 0.3)', borderRadius: '2px' },
  underline: { textDecoration: 'underline wavy rgba(99, 102, 241, 0.7)' },
  glow: { background: 'rgba(99, 102, 241, 0.2)' },
  box: { border: '1px solid rgba(99, 102, 241, 0.5)' },
  error: { background: 'rgba(239, 68, 68, 0.2)', border: '1px solid rgba(239, 68, 68, 0.4)' },
  suggestion: { background: 'rgba(34, 197, 94, 0.15)', border: '1px dashed rgba(34, 197, 94, 0.5)' },
};

export function resolveHighlightStyle(style?: HighlightStyle | HighlightOptions): HighlightOptions {
  if (style === undefined) return { ...PRESETS.pulse };
  if (typeof style === 'string') return { ...PRESETS[style] };
  return style;
}

export function highlightOptionsToCSS(opts: HighlightOptions): string {
  const parts: string[] = [];
  if (opts.background) parts.push(`background: ${opts.background}`);
  if (opts.border) parts.push(`outline: ${opts.border}`);
  if (opts.borderRadius) parts.push(`border-radius: ${opts.borderRadius}`);
  if (opts.textDecoration) parts.push(`text-decoration: ${opts.textDecoration}`);
  return parts.join('; ');
}
