import { describe, it, expect } from 'vitest';
import { IncludeExpander } from './include-expander.js';
import type { TemplateLoader } from './include-expander.js';
import { parse } from 'yaml';

function mockLoader(files: Record<string, string>): TemplateLoader {
  return async (path: string) => {
    const content = files[path];
    if (!content) throw new Error(`Template not found: ${path}`);
    return parse(content) as Record<string, unknown>;
  };
}

const seedTemplate = `
params:
  - name: customer
    type: string
    required: true
steps:
  - name: seed-customer
    step: seed-customer
    delivery: graphql
    domain: crm
    operation: createCustomer
    params:
      name: "\${params.customer}"
`;

const conditionalTemplate = `
params:
  - name: priority
    type: string
    required: false
steps:
  - name: always-included
    step: always
  - name: conditional-step
    when: "\${params.priority}"
    step: set-priority
    params:
      level: "\${params.priority}"
`;

const defaultTemplate = `
params:
  - name: role
    type: string
    default: Viewer
steps:
  - name: set-role
    step: set-role
    params:
      role: "\${params.role}"
`;

describe('IncludeExpander', () => {

  it('expands a single include and prepends steps', async () => {
    const scenario = {
      scenario: 'demo',
      includes: [{ file: 'seeds/base.yaml', params: { customer: 'Alice' } }],
      steps: [{ name: 'main-step', step: 'main-action' }],
    };
    const loader = mockLoader({ 'seeds/base.yaml': seedTemplate });
    const result = await IncludeExpander.expand(scenario, loader);

    expect(result['includes']).toBeUndefined();
    const steps = result['steps'] as Record<string, unknown>[];
    expect(steps).toHaveLength(2);
    expect(steps[0]['name']).toBe('seed-customer');
    expect((steps[0]['params'] as Record<string, unknown>)['name']).toBe('Alice');
    expect(steps[1]['name']).toBe('main-step');
  });

  it('multiple includes prepend in declaration order', async () => {
    const scenario = {
      scenario: 'demo',
      includes: [
        { file: 'a.yaml', params: { customer: 'Alice' } },
        { file: 'b.yaml', params: { customer: 'Bob' } },
      ],
      steps: [{ name: 'main', step: 'action' }],
    };
    const loader = mockLoader({
      'a.yaml': seedTemplate,
      'b.yaml': seedTemplate,
    });
    const result = await IncludeExpander.expand(scenario, loader);
    const steps = result['steps'] as Record<string, unknown>[];

    expect(steps).toHaveLength(3);
    expect((steps[0]['params'] as Record<string, unknown>)['name']).toBe('Alice');
    expect((steps[1]['params'] as Record<string, unknown>)['name']).toBe('Bob');
    expect(steps[2]['name']).toBe('main');
  });

  it('when: filters out steps where condition is falsy', async () => {
    const scenario = {
      scenario: 'demo',
      includes: [{ file: 'cond.yaml', params: {} }],
      steps: [],
    };
    const loader = mockLoader({ 'cond.yaml': conditionalTemplate });
    const result = await IncludeExpander.expand(scenario, loader);
    const steps = result['steps'] as Record<string, unknown>[];

    expect(steps).toHaveLength(1);
    expect(steps[0]['name']).toBe('always-included');
  });

  it('when: keeps steps where condition is truthy', async () => {
    const scenario = {
      scenario: 'demo',
      includes: [{ file: 'cond.yaml', params: { priority: 'High' } }],
      steps: [],
    };
    const loader = mockLoader({ 'cond.yaml': conditionalTemplate });
    const result = await IncludeExpander.expand(scenario, loader);
    const steps = result['steps'] as Record<string, unknown>[];

    expect(steps).toHaveLength(2);
    expect(steps[1]['name']).toBe('conditional-step');
    expect((steps[1]['params'] as Record<string, unknown>)['level']).toBe('High');
  });

  it('throws on missing required param', async () => {
    const scenario = {
      scenario: 'demo',
      includes: [{ file: 'seeds/base.yaml', params: {} }],
      steps: [],
    };
    const loader = mockLoader({ 'seeds/base.yaml': seedTemplate });

    await expect(IncludeExpander.expand(scenario, loader))
      .rejects.toThrow(/missing/i);
  });

  it('applies default values when param omitted', async () => {
    const scenario = {
      scenario: 'demo',
      includes: [{ file: 'def.yaml', params: {} }],
      steps: [],
    };
    const loader = mockLoader({ 'def.yaml': defaultTemplate });
    const result = await IncludeExpander.expand(scenario, loader);
    const steps = result['steps'] as Record<string, unknown>[];

    expect(steps).toHaveLength(1);
    expect((steps[0]['params'] as Record<string, unknown>)['role']).toBe('Viewer');
  });

  it('throws on circular include', async () => {
    const templateA = `
params: []
includes:
  - file: b.yaml
steps:
  - name: step-a
    step: action-a
`;
    const templateB = `
params: []
includes:
  - file: a.yaml
steps:
  - name: step-b
    step: action-b
`;
    const scenario = {
      scenario: 'demo',
      includes: [{ file: 'a.yaml' }],
      steps: [],
    };
    const loader = mockLoader({
      'a.yaml': templateA,
      'b.yaml': templateB,
    });

    await expect(IncludeExpander.expand(scenario, loader))
      .rejects.toThrow(/circular include/i);
  });

  it('expands nested includes recursively', async () => {
    const innerTemplate = `
params:
  - name: item
    type: string
    required: true
steps:
  - name: inner-step
    step: inner
    params:
      item: "\${params.item}"
`;
    const outerTemplate = `
params:
  - name: customer
    type: string
    required: true
includes:
  - file: inner.yaml
    params:
      item: "\${params.customer}"
steps:
  - name: outer-step
    step: outer
`;
    const scenario = {
      scenario: 'demo',
      includes: [{ file: 'outer.yaml', params: { customer: 'Alice' } }],
      steps: [{ name: 'main', step: 'main' }],
    };
    const loader = mockLoader({
      'outer.yaml': outerTemplate,
      'inner.yaml': innerTemplate,
    });
    const result = await IncludeExpander.expand(scenario, loader);
    const steps = result['steps'] as Record<string, unknown>[];

    expect(steps).toHaveLength(3);
    expect(steps[0]['name']).toBe('inner-step');
    expect((steps[0]['params'] as Record<string, unknown>)['item']).toBe('Alice');
    expect(steps[1]['name']).toBe('outer-step');
    expect(steps[2]['name']).toBe('main');
  });

  it('expands section-level includes', async () => {
    const scenario = {
      scenario: 'tutorial',
      sections: [
        {
          title: 'Setup',
          includes: [{ file: 'seeds/base.yaml', params: { customer: 'Bob' } }],
          steps: [{ name: 'manual-step', step: 'manual' }],
        },
        {
          title: 'Main',
          steps: [{ name: 'untouched', step: 'action' }],
        },
      ],
    };
    const loader = mockLoader({ 'seeds/base.yaml': seedTemplate });
    const result = await IncludeExpander.expand(scenario, loader);
    const sections = result['sections'] as Record<string, unknown>[];

    const setupSteps = sections[0]['steps'] as Record<string, unknown>[];
    expect(setupSteps).toHaveLength(2);
    expect(setupSteps[0]['name']).toBe('seed-customer');
    expect(setupSteps[1]['name']).toBe('manual-step');

    const mainSteps = sections[1]['steps'] as Record<string, unknown>[];
    expect(mainSteps).toHaveLength(1);
    expect(mainSteps[0]['name']).toBe('untouched');
  });

  it('returns unchanged when no includes present', async () => {
    const scenario = {
      scenario: 'demo',
      steps: [{ name: 'only-step', step: 'action' }],
    };
    const loader = mockLoader({});
    const result = await IncludeExpander.expand(scenario, loader);

    expect(result['steps']).toHaveLength(1);
    expect((result['steps'] as Record<string, unknown>[])[0]['name']).toBe('only-step');
  });

  it('throws when template not found', async () => {
    const scenario = {
      scenario: 'demo',
      includes: [{ file: 'missing.yaml' }],
      steps: [],
    };
    const loader = mockLoader({});

    await expect(IncludeExpander.expand(scenario, loader))
      .rejects.toThrow(/not found/i);
  });

  it('template with no params expands as-is', async () => {
    const noParamsTemplate = `
steps:
  - name: setup-env
    step: setup
`;
    const scenario = {
      scenario: 'demo',
      includes: [{ file: 'env.yaml' }],
      steps: [{ name: 'main', step: 'main' }],
    };
    const loader = mockLoader({ 'env.yaml': noParamsTemplate });
    const result = await IncludeExpander.expand(scenario, loader);
    const steps = result['steps'] as Record<string, unknown>[];

    expect(steps).toHaveLength(2);
    expect(steps[0]['name']).toBe('setup-env');
    expect(steps[1]['name']).toBe('main');
  });
});
