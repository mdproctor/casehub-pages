import { describe, it, expect } from 'vitest';
import {
  parsePlaybookFrontMatter,
  isBuiltInSchema,
  isDomainSchema,
  PLAYBOOK_SCHEMAS,
} from './playbook.js';

describe('PlaybookFrontMatter', () => {
  it('extracts version and schema', () => {
    const fm = parsePlaybookFrontMatter({
      playbook: '1.0',
      schema: 'server',
    });

    expect(fm).not.toBeNull();
    expect(fm!.version).toBe('1.0');
    expect(fm!.schema).toBe('server');
    expect(fm!.name).toBeUndefined();
    expect(fm!.metadata).toEqual({});
  });

  it('extracts name when present', () => {
    const fm = parsePlaybookFrontMatter({
      playbook: '1.0',
      schema: 'client',
      name: 'helpdesk-intake',
    });

    expect(fm!.name).toBe('helpdesk-intake');
  });

  it('collects extra fields into metadata', () => {
    const fm = parsePlaybookFrontMatter({
      playbook: '1.0',
      schema: 'clinical-server',
      author: 'test-user',
    });

    expect(fm!.metadata).toEqual({ author: 'test-user' });
  });

  it('returns null when no playbook key', () => {
    const fm = parsePlaybookFrontMatter({
      scenario: 'legacy',
      steps: [],
    });

    expect(fm).toBeNull();
  });

  it('coerces numeric version to string', () => {
    const fm = parsePlaybookFrontMatter({
      playbook: 1.0,
      schema: 'server',
    });

    expect(fm!.version).toBe('1');
  });

  it('throws when schema is missing', () => {
    expect(() =>
      parsePlaybookFrontMatter({ playbook: '1.0' }),
    ).toThrow("Playbook front matter requires a 'schema' field");
  });
});

describe('PlaybookSchemas', () => {
  it('has client and server constants', () => {
    expect(PLAYBOOK_SCHEMAS.CLIENT).toBe('client');
    expect(PLAYBOOK_SCHEMAS.SERVER).toBe('server');
  });

  it('identifies built-in schemas', () => {
    expect(isBuiltInSchema('client')).toBe(true);
    expect(isBuiltInSchema('server')).toBe(true);
    expect(isBuiltInSchema('clinical-client')).toBe(false);
  });

  it('identifies domain schemas', () => {
    expect(isDomainSchema('clinical-client')).toBe(true);
    expect(isDomainSchema('aml-server')).toBe(true);
    expect(isDomainSchema('client')).toBe(false);
    expect(isDomainSchema('server')).toBe(false);
    expect(isDomainSchema(null)).toBe(false);
  });
});
