import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { createSchemaRegistry } from './schema-registry.js';
import type { FormatRegistration } from './types.js';

const pageSchema = z.object({
  pages: z.array(z.object({ name: z.string() })),
  datasets: z.array(z.object({ uuid: z.string() })).optional(),
});

const pageFormat: FormatRegistration = {
  formatId: 'page',
  extensions: ['.page.yaml', '.page.yaml'],
  contentDetector: (inspector) =>
    inspector.hasKey(['pages']) || inspector.hasKey(['datasets']),
  documentSchema: pageSchema,
};

describe('SchemaRegistry', () => {
  it('registers and retrieves a format by ID', () => {
    const registry = createSchemaRegistry();
    registry.register(pageFormat);
    expect(registry.getSchema('page')).toBe(pageSchema);
  });

  it('detects format by file extension', () => {
    const registry = createSchemaRegistry();
    registry.register(pageFormat);
    const detected = registry.detect('file:///app/dashboard.page.yaml', '');
    expect(detected?.formatId).toBe('page');
  });

  it('detects format by .page.yaml transition extension', () => {
    const registry = createSchemaRegistry();
    registry.register(pageFormat);
    const detected = registry.detect('file:///app/old.page.yaml', '');
    expect(detected?.formatId).toBe('page');
  });

  it('falls back to content detection for plain .yaml', () => {
    const registry = createSchemaRegistry();
    registry.register(pageFormat);
    const yaml = 'pages:\n  - name: Home\n';
    const detected = registry.detect('file:///app/config.yaml', yaml);
    expect(detected?.formatId).toBe('page');
  });

  it('returns undefined for unrecognised files', () => {
    const registry = createSchemaRegistry();
    registry.register(pageFormat);
    const detected = registry.detect('file:///app/random.yaml', 'foo: bar\n');
    expect(detected).toBeUndefined();
  });

  it('returns undefined for non-yaml files', () => {
    const registry = createSchemaRegistry();
    registry.register(pageFormat);
    const detected = registry.detect('file:///app/config.json', '{}');
    expect(detected).toBeUndefined();
  });

  it('retrieves variant schema from dispatchers', () => {
    const capabilitySchema = z.object({ capability: z.string() });
    const subCaseSchema = z.object({ subCase: z.object({ name: z.string() }) });
    const format: FormatRegistration = {
      formatId: 'case',
      extensions: ['.case.yaml'],
      documentSchema: z.object({}),
      variantDispatchers: new Map([
        ['spec.bindings.target', {
          strategy: 'key-presence' as const,
          variants: new Map([
            ['capability', capabilitySchema],
            ['subCase', subCaseSchema],
          ]),
        }],
      ]),
    };
    const registry = createSchemaRegistry();
    registry.register(format);
    expect(registry.getVariantSchema('case', 'spec.bindings.target', 'capability'))
      .toBe(capabilitySchema);
  });
});
