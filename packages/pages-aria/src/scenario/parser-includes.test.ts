import { describe, it, expect } from 'vitest';
import { parseScenario, parseScenarioWithIncludes } from './parser.js';
import { createScenarioCatalog } from './catalog-factory.js';
import { parse } from 'yaml';
import type { TemplateLoader } from '@casehubio/yaml-core';
import type { FlatScenario } from './types.js';

describe('parseScenarioWithIncludes', () => {
  const catalog = createScenarioCatalog();

  const seedTemplate = `
params:
  - name: sender
    type: string
    required: true
steps:
  - step: seed-message
    click:
      role: button
      name: "\${params.sender}"
`;

  function mockLoader(files: Record<string, string>): TemplateLoader {
    return async (path: string) => {
      const content = files[path];
      if (!content) throw new Error(`Template not found: ${path}`);
      return parse(content) as Record<string, unknown>;
    };
  }

  it('expands includes before resolving steps', async () => {
    const yaml = `
scenario: include-demo
includes:
  - file: seeds/chat.yaml
    params:
      sender: Alice
steps:
  - step: main-step
    click:
      role: button
      name: Submit
`;
    const loader = mockLoader({ 'seeds/chat.yaml': seedTemplate });
    const result = await parseScenarioWithIncludes(yaml, catalog, loader) as FlatScenario;

    expect(result.steps.length).toBe(2);
    expect(result.steps[0].kind).toBe('plugin');
  });

  it('parseScenario still works synchronously without includes', () => {
    const yaml = `
scenario: no-includes
steps:
  - step: only-step
    click:
      role: button
      name: Go
`;
    const result = parseScenario(yaml, catalog) as FlatScenario;
    expect(result.steps).toHaveLength(1);
  });
});
