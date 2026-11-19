import { describe, it, expect } from 'vitest';
import {
  yamlCoreDocumentSchema, moduleDefinitionSchema, importSchema,
  forEachSchema, parameterSchema, outputSchema, iterationGroupSchema,
} from './schema.js';

describe('yaml-core schemas', () => {
  it('validates document with modules and imports', () => {
    const doc = {
      modules: {
        greeting: {
          parameters: { name: { type: 'STRING', required: true } },
          sections: { pages: { hello: { name: 'world' } } },
        },
      },
      imports: [{ module: 'greeting', as: 'hi', parameters: { name: 'test' } }],
    };
    expect(yamlCoreDocumentSchema.safeParse(doc).success).toBe(true);
  });

  it('validates document with variables', () => {
    const doc = { variables: { theme: { color: 'blue' } } };
    expect(yamlCoreDocumentSchema.safeParse(doc).success).toBe(true);
  });

  it('validates document with iterations', () => {
    const doc = {
      iterations: { regional: { as: 'region', in: ['us-east', 'eu-west'] } },
    };
    expect(yamlCoreDocumentSchema.safeParse(doc).success).toBe(true);
  });

  it('validates document with data sources', () => {
    const doc = {
      data: { members: { inline: 'name:STRING\nAlice\nBob' } },
    };
    expect(yamlCoreDocumentSchema.safeParse(doc).success).toBe(true);
  });

  it('validates empty document', () => {
    expect(yamlCoreDocumentSchema.safeParse({}).success).toBe(true);
  });

  it('rejects invalid import (missing as)', () => {
    const imp = { module: 'greeting' };
    expect(importSchema.safeParse(imp).success).toBe(false);
  });

  it('validates for-each as string', () => {
    expect(forEachSchema.safeParse('regional').success).toBe(true);
  });

  it('validates for-each as inline object', () => {
    const fe = { as: 'item', in: ['a', 'b'] };
    expect(forEachSchema.safeParse(fe).success).toBe(true);
  });

  it('rejects invalid for-each (number)', () => {
    expect(forEachSchema.safeParse(42).success).toBe(false);
  });

  it('validates parameter with all constraints', () => {
    const param = {
      type: 'INTEGER',
      required: true,
      minimum: 1,
      maximum: 100,
      constraintDescription: 'Must be 1-100',
    };
    expect(parameterSchema.safeParse(param).success).toBe(true);
  });

  it('validates output', () => {
    const out = { type: 'STRING', value: 'jdbc://${var.name}' };
    expect(outputSchema.safeParse(out).success).toBe(true);
  });

  it('rejects output missing value', () => {
    const out = { type: 'STRING' };
    expect(outputSchema.safeParse(out).success).toBe(false);
  });

  it('validates iteration group with array in', () => {
    const group = { as: 'region', in: ['us', 'eu'] };
    expect(iterationGroupSchema.safeParse(group).success).toBe(true);
  });

  it('validates iteration group with string in', () => {
    const group = { as: 'region', in: '${var.regions}' };
    expect(iterationGroupSchema.safeParse(group).success).toBe(true);
  });

  it('validates module definition with outputs', () => {
    const mod = {
      parameters: { name: { type: 'STRING', required: true } },
      outputs: { url: { type: 'STRING', value: 'jdbc://${var.name}' } },
      sections: { nodes: { n1: { type: 'db' } } },
    };
    expect(moduleDefinitionSchema.safeParse(mod).success).toBe(true);
  });
});
