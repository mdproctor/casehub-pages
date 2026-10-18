import { describe, it, expect } from 'vitest';
import { parseExpressions } from './expression.js';

describe('parseExpressions', () => {
  it('returns plain text for strings without expressions', () => {
    expect(parseExpressions('hello world')).toEqual([
      { type: 'text', value: 'hello world' },
    ]);
  });

  it('returns single text segment for empty string', () => {
    expect(parseExpressions('')).toEqual([
      { type: 'text', value: '' },
    ]);
  });

  it('detects params expression', () => {
    expect(parseExpressions('${params.teamName}')).toEqual([
      { type: 'param', value: '${params.teamName}' },
    ]);
  });

  it('detects each expression', () => {
    expect(parseExpressions('${each.member.name}')).toEqual([
      { type: 'each', value: '${each.member.name}' },
    ]);
  });

  it('detects from expression', () => {
    expect(parseExpressions('${from.value}')).toEqual([
      { type: 'from', value: '${from.value}' },
    ]);
  });

  it('detects module expression', () => {
    expect(parseExpressions('${module.ops.panelId}')).toEqual([
      { type: 'module', value: '${module.ops.panelId}' },
    ]);
  });

  it('handles text before expression', () => {
    expect(parseExpressions('/teams/${params.teamName}')).toEqual([
      { type: 'text', value: '/teams/' },
      { type: 'param', value: '${params.teamName}' },
    ]);
  });

  it('handles text after expression', () => {
    expect(parseExpressions('${params.id}-suffix')).toEqual([
      { type: 'param', value: '${params.id}' },
      { type: 'text', value: '-suffix' },
    ]);
  });

  it('handles multiple expressions with text between', () => {
    expect(parseExpressions('Processing ${from.value}.')).toEqual([
      { type: 'text', value: 'Processing ' },
      { type: 'from', value: '${from.value}' },
      { type: 'text', value: '.' },
    ]);
  });

  it('handles adjacent expressions of different scopes', () => {
    expect(parseExpressions('${params.a}${each.b}')).toEqual([
      { type: 'param', value: '${params.a}' },
      { type: 'each', value: '${each.b}' },
    ]);
  });

  it('ignores expressions with unrecognised scopes', () => {
    expect(parseExpressions('${other.value}')).toEqual([
      { type: 'text', value: '${other.value}' },
    ]);
  });

  it('handles nested dots in expression path', () => {
    expect(parseExpressions('${params.user.profile.name}')).toEqual([
      { type: 'param', value: '${params.user.profile.name}' },
    ]);
  });
});
