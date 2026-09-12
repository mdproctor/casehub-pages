import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createSchemaRegistry } from './schema-registry.js';
import { pageFormat } from './formats/page.js';
import { handleCompletion } from './completion.js';
import { computeDiagnostics } from './diagnostics.js';
import { createServerHandler } from './server.js';

function loadExample(name: string): string {
  const base = resolve(import.meta.dirname, '../../../examples/samples');
  return readFileSync(resolve(base, name), 'utf-8');
}

describe('integration: Page YAML', () => {
  it('detects .page.yaml by extension', () => {
    const registry = createSchemaRegistry();
    registry.register(pageFormat);
    const detected = registry.detect('file:///app/test.page.yaml', '');
    expect(detected?.formatId).toBe('page');
  });

  it('detects .page.yaml by transition extension', () => {
    const registry = createSchemaRegistry();
    registry.register(pageFormat);
    const detected = registry.detect('file:///app/old.page.yaml', '');
    expect(detected?.formatId).toBe('page');
  });

  it('provides completion at root of empty Page file', () => {
    const registry = createSchemaRegistry();
    registry.register(pageFormat);
    const items = handleCompletion(
      'file:///test.page.yaml', '', { line: 0, character: 0 }, registry,
    );
    const labels = items.map(i => i.label);
    expect(labels).toContain('pages');
  });

  it('supports prepareRename on dataset UUID', () => {
    const registry = createSchemaRegistry();
    registry.register(pageFormat);
    const handler = createServerHandler(registry);
    const content = 'datasets:\n  - uuid: products\n';
    handler.onDidOpen('file:///test.page.yaml', content);
    const result = handler.onPrepareRename('file:///test.page.yaml', { line: 1, character: 12 });
    expect(result).not.toBeNull();
    expect(result!.placeholder).toBe('products');
  });

  it('renames dataset UUID across document', () => {
    const registry = createSchemaRegistry();
    registry.register(pageFormat);
    const handler = createServerHandler(registry);
    const content = [
      'datasets:',
      '  - uuid: products',
      'pages:',
      '  - components:',
      '      - type: bar-chart',
      '        properties:',
      '          lookup:',
      '            uuid: products',
    ].join('\n');
    handler.onDidOpen('file:///test.page.yaml', content);
    const result = handler.onRename('file:///test.page.yaml', { line: 1, character: 12 }, 'items');
    expect(result).not.toBeNull();
    expect(result!.changes['file:///test.page.yaml']).toHaveLength(2);
  });

  it('finds definition across documents', () => {
    const registry = createSchemaRegistry();
    registry.register(pageFormat);
    const handler = createServerHandler(registry);
    handler.onDidOpen('file:///defs.page.yaml', 'datasets:\n  - uuid: products\n');
    handler.onDidOpen('file:///app.page.yaml', [
      'pages:',
      '  - components:',
      '      - type: bar-chart',
      '        properties:',
      '          lookup:',
      '            uuid: products',
    ].join('\n'));
    const defs = handler.onDefinition('file:///app.page.yaml', { line: 5, character: 18 });
    expect(defs).toHaveLength(1);
    expect(defs[0]!.uri).toBe('file:///defs.page.yaml');
  });

  it('finds references across documents', () => {
    const registry = createSchemaRegistry();
    registry.register(pageFormat);
    const handler = createServerHandler(registry);
    handler.onDidOpen('file:///defs.page.yaml', 'datasets:\n  - uuid: products\n');
    handler.onDidOpen('file:///app.page.yaml', [
      'pages:',
      '  - components:',
      '      - type: bar-chart',
      '        properties:',
      '          lookup:',
      '            uuid: products',
    ].join('\n'));
    const refs = handler.onReferences('file:///defs.page.yaml', { line: 1, character: 12 });
    expect(refs.length).toBeGreaterThanOrEqual(2);
  });

  it('cross-file rename updates all documents', () => {
    const registry = createSchemaRegistry();
    registry.register(pageFormat);
    const handler = createServerHandler(registry);
    handler.onDidOpen('file:///defs.page.yaml', 'datasets:\n  - uuid: products\n');
    handler.onDidOpen('file:///app.page.yaml', [
      'pages:',
      '  - components:',
      '      - type: bar-chart',
      '        properties:',
      '          lookup:',
      '            uuid: products',
    ].join('\n'));
    const result = handler.onRename('file:///defs.page.yaml', { line: 1, character: 12 }, 'items');
    expect(result).not.toBeNull();
    expect(Object.keys(result!.changes)).toHaveLength(2);
  });

  it('produces no syntax errors for a real example', () => {
    const registry = createSchemaRegistry();
    registry.register(pageFormat);
    const content = loadExample('Charts/Charts.page.yaml');
    const diagnostics = computeDiagnostics(
      'file:///example.page.yaml', content, registry,
    );
    const syntaxErrors = diagnostics.filter(d => d.source === 'casehub-yaml');
    expect(syntaxErrors).toHaveLength(0);
  });
});
