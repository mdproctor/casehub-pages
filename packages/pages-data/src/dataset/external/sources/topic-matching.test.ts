import { describe, it, expect } from 'vitest';
import { isValidTopicOrPattern, matchesTopic, isMatchedByRegistrations } from './topic-matching.js';

describe('isValidTopicOrPattern', () => {
  it('accepts exact topics', () => {
    expect(isValidTopicOrPattern('debate:abc')).toBe(true);
  });

  it('accepts single segment', () => {
    expect(isValidTopicOrPattern('hello')).toBe(true);
  });

  it('accepts segment wildcard *', () => {
    expect(isValidTopicOrPattern('debate:*')).toBe(true);
    expect(isValidTopicOrPattern('debate:*:summary')).toBe(true);
    expect(isValidTopicOrPattern('*')).toBe(true);
  });

  it('accepts trailing **', () => {
    expect(isValidTopicOrPattern('debate:**')).toBe(true);
    expect(isValidTopicOrPattern('**')).toBe(true);
  });

  it('rejects null and undefined', () => {
    expect(isValidTopicOrPattern(null)).toBe(false);
    expect(isValidTopicOrPattern(undefined)).toBe(false);
  });

  it('rejects empty string', () => {
    expect(isValidTopicOrPattern('')).toBe(false);
  });

  it('rejects partial wildcards', () => {
    expect(isValidTopicOrPattern('de*bate')).toBe(false);
  });

  it('rejects empty segments', () => {
    expect(isValidTopicOrPattern('debate::summary')).toBe(false);
    expect(isValidTopicOrPattern(':debate')).toBe(false);
    expect(isValidTopicOrPattern('debate:')).toBe(false);
  });

  it('rejects ** in non-trailing position', () => {
    expect(isValidTopicOrPattern('debate:**:summary')).toBe(false);
  });
});

describe('matchesTopic', () => {
  it('exact match', () => {
    expect(matchesTopic('debate:abc', 'debate:abc')).toBe(true);
    expect(matchesTopic('debate:abc', 'debate:xyz')).toBe(false);
  });

  it('single * matches one segment', () => {
    expect(matchesTopic('debate:*', 'debate:abc')).toBe(true);
    expect(matchesTopic('debate:*', 'debate:abc:def')).toBe(false);
  });

  it('mid-position *', () => {
    expect(matchesTopic('debate:*:summary', 'debate:abc:summary')).toBe(true);
    expect(matchesTopic('debate:*:summary', 'debate:abc:def:summary')).toBe(false);
  });

  it('multiple * segments', () => {
    expect(matchesTopic('a:*:b:*:c', 'a:x:b:y:c')).toBe(true);
    expect(matchesTopic('a:*:b:*:c', 'a:x:b:y:z')).toBe(false);
  });

  it('** matches zero or more segments', () => {
    expect(matchesTopic('debate:**', 'debate:abc')).toBe(true);
    expect(matchesTopic('debate:**', 'debate:abc:def:ghi')).toBe(true);
    expect(matchesTopic('debate:**', 'debate')).toBe(true);
    expect(matchesTopic('a:b:**', 'a')).toBe(false);
  });

  it('bare * matches single segment only', () => {
    expect(matchesTopic('*', 'hello')).toBe(true);
    expect(matchesTopic('*', 'hello:world')).toBe(false);
  });

  it('bare ** matches anything', () => {
    expect(matchesTopic('**', 'anything')).toBe(true);
    expect(matchesTopic('**', 'a:b:c:d')).toBe(true);
  });
});

describe('isMatchedByRegistrations', () => {
  it('matches exact registration', () => {
    expect(isMatchedByRegistrations('debate:abc', new Set(['debate:abc']))).toBe(true);
  });

  it('matches segment wildcard registration', () => {
    expect(isMatchedByRegistrations('debate:abc:summary', new Set(['debate:*:summary']))).toBe(true);
  });

  it('matches ** registration', () => {
    expect(isMatchedByRegistrations('debate:abc:def', new Set(['debate:**']))).toBe(true);
  });

  it('does not match unrelated', () => {
    expect(isMatchedByRegistrations('other:topic', new Set(['debate:**']))).toBe(false);
  });
});
