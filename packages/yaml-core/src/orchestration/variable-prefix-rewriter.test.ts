import { describe, it, expect } from 'vitest';
import { rewriteVariablePrefixes } from './variable-prefix-rewriter.js';

describe('rewriteVariablePrefixes', () => {
  const known = new Set(['env', 'ctx']);
  const forEach = new Set(['item']);

  it('leaves known-prefixed vars alone', () => {
    expect(rewriteVariablePrefixes('${env.HOST}', 'step', known, forEach)).toBe('${env.HOST}');
  });

  it('adds each. prefix to for-each vars', () => {
    expect(rewriteVariablePrefixes('${item.name}', 'step', known, forEach)).toBe('${each.item.name}');
  });

  it('adds default prefix to unqualified vars', () => {
    expect(rewriteVariablePrefixes('${count}', 'step', known, forEach)).toBe('${step.count}');
  });

  it('preserves default value syntax', () => {
    expect(rewriteVariablePrefixes('${host:-localhost}', 'step', known, forEach)).toBe('${step.host:-localhost}');
  });

  it('handles multiple vars in one string', () => {
    const input = '${env.HOST}:${port}/${item.db}';
    expect(rewriteVariablePrefixes(input, 'step', known, forEach)).toBe('${env.HOST}:${step.port}/${each.item.db}');
  });

  it('returns input unchanged if no vars', () => {
    expect(rewriteVariablePrefixes('plain text', 'step', known, forEach)).toBe('plain text');
  });
});
