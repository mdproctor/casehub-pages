import { describe, it, expect } from 'vitest';
import { resolveHighlightStyle, highlightOptionsToCSS } from './highlight-options.js';

describe('resolveHighlightStyle', () => {
  it('returns HighlightOptions unchanged', () => {
    const opts = { background: 'rgba(255,0,0,0.2)', border: '1px solid red' };
    expect(resolveHighlightStyle(opts)).toEqual(opts);
  });

  it('resolves "pulse" preset to HighlightOptions', () => {
    const result = resolveHighlightStyle('pulse');
    expect(result.background).toBeDefined();
  });

  it('resolves "underline" preset', () => {
    const result = resolveHighlightStyle('underline');
    expect(result.textDecoration).toBeDefined();
  });

  it('resolves "glow" preset', () => {
    const result = resolveHighlightStyle('glow');
    expect(result.background).toBeDefined();
  });

  it('resolves "box" preset', () => {
    const result = resolveHighlightStyle('box');
    expect(result.border).toBeDefined();
  });

  it('resolves "error" preset', () => {
    const result = resolveHighlightStyle('error');
    expect(result.background).toBeDefined();
  });

  it('resolves "suggestion" preset', () => {
    const result = resolveHighlightStyle('suggestion');
    expect(result.background).toBeDefined();
  });

  it('defaults to pulse when undefined', () => {
    const result = resolveHighlightStyle(undefined);
    expect(result).toEqual(resolveHighlightStyle('pulse'));
  });
});

describe('highlightOptionsToCSS', () => {
  it('converts background', () => {
    const css = highlightOptionsToCSS({ background: 'red' });
    expect(css).toContain('background: red');
  });

  it('converts border and borderRadius', () => {
    const css = highlightOptionsToCSS({ border: '1px solid red', borderRadius: '3px' });
    expect(css).toContain('border: 1px solid red');
    expect(css).toContain('border-radius: 3px');
  });

  it('converts textDecoration', () => {
    const css = highlightOptionsToCSS({ textDecoration: 'underline wavy red' });
    expect(css).toContain('text-decoration: underline wavy red');
  });

  it('returns empty string for empty options', () => {
    expect(highlightOptionsToCSS({})).toBe('');
  });
});
