import { describe, it, expect } from 'vitest';
import { parseScenario } from './parser.js';
import { isSectioned } from './types.js';
import type { FlatScenario, SectionedScenario } from './types.js';
import type { Catalog, CatalogEntry, PluginStep } from '@casehubio/yaml-core/step';
import { stepSuccess } from '@casehubio/yaml-core/step';

function buildTestCatalog(actions: string[]): Catalog {
  const entries = new Map<string, CatalogEntry>();
  for (const name of actions) {
    entries.set(name, {
      qualifiedName: name,
      definition: { name, inputs: {}, outputs: {} },
      action: { async execute() { return stepSuccess({}); } },
    });
  }
  return {
    resolve: (n: string) => entries.get(n),
    availableActions: () => new Set(entries.keys()),
  };
}

const ALL_ACTIONS = [
  'navigate', 'click', 'fill', 'select', 'expand', 'collapse', 'assert', 'wait',
  'show-markdown', 'spotlight', 'editor-insert', 'editor-replace', 'editor-delete',
  'editor-set-content', 'editor-cursor', 'editor-highlight', 'editor-completion',
  'graphql', 'simulated',
];
const catalog = buildTestCatalog(ALL_ACTIONS);

describe('scenario parser', () => {
  it('resolves ARIA shorthand via catalog as PluginStep', () => {
    const yaml = `
scenario: test-form
steps:
  - click:
      role: button
      name: Submit
`;
    const scenario = parseScenario(yaml, catalog);
    expect(scenario.scenario).toBe('test-form');
    const flat = scenario as FlatScenario;
    expect(flat.steps).toHaveLength(1);
    const step = flat.steps[0] as PluginStep;
    expect(step.kind).toBe('plugin');
    expect(step.entry.qualifiedName).toBe('click');
    expect(step.params).toEqual({ role: 'button', name: 'Submit' });
  });

  it('resolves multiple step types via catalog', () => {
    const yaml = `
scenario: full-flow
steps:
  - navigate: /login
  - fill:
      role: textbox
      name: Username
      value: alice
  - click:
      role: button
      name: Login
  - assert:
      role: button
      name: Logout
      state:
        aria-hidden: false
`;
    const scenario = parseScenario(yaml, catalog) as FlatScenario;
    expect(scenario.steps).toHaveLength(4);
    expect(scenario.steps.every(s => s.kind === 'plugin')).toBe(true);
  });

  it('passes within scoping through params', () => {
    const yaml = `
scenario: scoped-click
steps:
  - click:
      role: button
      name: Delete
      within:
        role: row
        name: "Case #42"
`;
    const scenario = parseScenario(yaml, catalog) as FlatScenario;
    const step = scenario.steps[0] as PluginStep;
    expect(step.params['within']).toEqual({ role: 'row', name: 'Case #42' });
  });

  it('wraps navigate string value as { value: path }', () => {
    const yaml = `
scenario: nav
steps:
  - navigate: /login
`;
    const scenario = parseScenario(yaml, catalog) as FlatScenario;
    const step = scenario.steps[0] as PluginStep;
    expect(step.entry.qualifiedName).toBe('navigate');
    expect(step.params).toEqual({ value: '/login' });
  });

  it('resolves graphql shorthand via catalog', () => {
    const yaml = `
scenario: graphql-test
steps:
  - graphql:
      domain: connectors
      operation: injectChat
      params:
        platform: slack
        sender: Alice
`;
    const scenario = parseScenario(yaml, catalog) as FlatScenario;
    expect(scenario.steps).toHaveLength(1);
    const step = scenario.steps[0] as PluginStep;
    expect(step.kind).toBe('plugin');
    expect(step.entry.qualifiedName).toBe('graphql');
    expect(step.params['domain']).toBe('connectors');
    expect(step.params['operation']).toBe('injectChat');
  });

  it('resolves simulated shorthand via catalog', () => {
    const yaml = `
scenario: simulated-test
steps:
  - simulated:
      dataset: helpdesk-tickets
      data:
        op: snapshot
        columns: [id, customer]
`;
    const scenario = parseScenario(yaml, catalog) as FlatScenario;
    const step = scenario.steps[0] as PluginStep;
    expect(step.kind).toBe('plugin');
    expect(step.entry.qualifiedName).toBe('simulated');
    expect(step.params['dataset']).toBe('helpdesk-tickets');
  });

  it('resolves hybrid scenario with mixed catalog entries', () => {
    const yaml = `
scenario: hybrid
steps:
  - navigate: /helpdesk
  - click:
      role: button
      name: Submit
  - graphql:
      domain: connectors
      operation: injectChat
`;
    const scenario = parseScenario(yaml, catalog) as FlatScenario;
    expect(scenario.steps).toHaveLength(3);
    expect(scenario.steps.every(s => s.kind === 'plugin')).toBe(true);
    expect((scenario.steps[0] as PluginStep).entry.qualifiedName).toBe('navigate');
    expect((scenario.steps[1] as PluginStep).entry.qualifiedName).toBe('click');
    expect((scenario.steps[2] as PluginStep).entry.qualifiedName).toBe('graphql');
  });

  it('throws on invalid scenario — missing steps and sections', () => {
    expect(() => parseScenario('scenario: test', catalog)).toThrow('must have');
  });

  it('parses without scenario name — steps only', () => {
    const yaml = `
steps:
  - click: { role: button, name: "A" }
`;
    const scenario = parseScenario(yaml, catalog) as FlatScenario;
    expect(scenario.scenario).toBeUndefined();
    expect(scenario.steps).toHaveLength(1);
  });

  it('throws on unknown step key', () => {
    const yaml = `
scenario: bad
steps:
  - unknown: value
`;
    expect(() => parseScenario(yaml, catalog)).toThrow();
  });
});

describe('parseScenario — sectioned format', () => {
  it('parses sections with inline content', () => {
    const yaml = `
scenario: test-tutorial
meta:
  title: Test
  description: A test tutorial
  area: testing
sections:
  - title: Introduction
    content:
      type: inline
      markdown: "Hello world"
    steps: []
  - title: Demo
    steps:
      - click:
          role: button
          name: Submit
`;
    const result = parseScenario(yaml, catalog);
    expect(isSectioned(result)).toBe(true);
    if (!isSectioned(result)) throw new Error('Expected sectioned');
    expect(result.sections).toHaveLength(2);
    expect(result.sections[0].title).toBe('Introduction');
    expect(result.sections[0].content?.type).toBe('inline');
    expect(result.sections[0].content?.markdown).toBe('Hello world');
    expect(result.sections[0].steps).toHaveLength(0);
    expect(result.sections[1].title).toBe('Demo');
    expect(result.sections[1].steps).toHaveLength(1);
    expect(result.meta?.title).toBe('Test');
  });

  it('normalizes missing steps to empty array', () => {
    const yaml = `
scenario: slides-only
sections:
  - title: Slide 1
    content:
      type: inline
      markdown: Just a slide
`;
    const result = parseScenario(yaml, catalog);
    if (!isSectioned(result)) throw new Error('Expected sectioned');
    expect(result.sections[0].steps).toEqual([]);
  });

  it('rejects when both steps and sections present', () => {
    const yaml = `
scenario: invalid
steps:
  - click:
      role: button
      name: Test
sections:
  - title: Section 1
    steps: []
`;
    expect(() => parseScenario(yaml, catalog)).toThrow('mutually exclusive');
  });

  it('rejects when neither steps nor sections present', () => {
    const yaml = `
scenario: empty
`;
    expect(() => parseScenario(yaml, catalog)).toThrow('must have');
  });

  it('parses template content reference', () => {
    const yaml = `
scenario: template-test
sections:
  - title: Slide
    content:
      type: template
      path: content/slide.md
    steps: []
`;
    const result = parseScenario(yaml, catalog);
    if (!isSectioned(result)) throw new Error('Expected sectioned');
    expect(result.sections[0].content?.type).toBe('template');
    expect(result.sections[0].content?.path).toBe('content/slide.md');
  });

  it('preserves meta on flat scenarios', () => {
    const yaml = `
scenario: flat-with-meta
meta:
  title: Flat Test
  description: A flat scenario with meta
  area: testing
steps:
  - click:
      role: button
      name: Go
`;
    const result = parseScenario(yaml, catalog);
    expect(isSectioned(result)).toBe(false);
    expect(result.meta?.title).toBe('Flat Test');
  });
});

describe('isSectioned type guard', () => {
  it('returns false for flat scenarios', () => {
    const flat: FlatScenario = { scenario: 'test', steps: [] };
    expect(isSectioned(flat)).toBe(false);
  });

  it('returns true for sectioned scenarios', () => {
    const sectioned: SectionedScenario = {
      scenario: 'test',
      sections: [{ title: 'Intro', steps: [] }],
    };
    expect(isSectioned(sectioned)).toBe(true);
  });

  it('preserves meta on both variants', () => {
    const meta = { title: 'T', description: 'D', area: 'a' };
    const flat: FlatScenario = { scenario: 'test', steps: [], meta };
    const sectioned: SectionedScenario = { scenario: 'test', sections: [], meta };
    expect(flat.meta).toEqual(meta);
    expect(sectioned.meta).toEqual(meta);
  });
});

describe('editor actions', () => {
  it('resolves editor-insert via catalog', () => {
    const yaml = `scenario: test
sections:
  - title: Test
    steps:
      - editor-insert:
          role: textbox
          name: "YAML editor"
          value: "hello"
          typing: progressive`;
    const parsed = parseScenario(yaml, catalog) as SectionedScenario;
    const step = parsed.sections[0]!.steps[0]! as PluginStep;
    expect(step.kind).toBe('plugin');
    expect(step.entry.qualifiedName).toBe('editor-insert');
    expect(step.params['value']).toBe('hello');
    expect(step.params['typing']).toBe('progressive');
  });

  it('resolves spotlight via catalog with nested target in params', () => {
    const yaml = `scenario: test
sections:
  - title: Test
    steps:
      - spotlight:
          target:
            role: tree
            name: "Document outline"
          content: "This is the tree view"`;
    const parsed = parseScenario(yaml, catalog) as SectionedScenario;
    const step = parsed.sections[0]!.steps[0]! as PluginStep;
    expect(step.kind).toBe('plugin');
    expect(step.entry.qualifiedName).toBe('spotlight');
    expect((step.params['target'] as any).role).toBe('tree');
    expect(step.params['content']).toBe('This is the tree view');
  });

  it('resolves editor-highlight via catalog', () => {
    const yaml = `scenario: test
sections:
  - title: Test
    steps:
      - editor-highlight:
          role: textbox
          name: "YAML editor"
          from: {line: 1, col: 0}
          to: {line: 3, col: 10}
          style: pulse`;
    const parsed = parseScenario(yaml, catalog) as SectionedScenario;
    const step = parsed.sections[0]!.steps[0]! as PluginStep;
    expect(step.kind).toBe('plugin');
    expect(step.params['from']).toEqual({ line: 1, col: 0 });
    expect(step.params['to']).toEqual({ line: 3, col: 10 });
    expect(step.params['style']).toBe('pulse');
  });

  it('resolves editor-set-content via catalog', () => {
    const yaml = `scenario: test
sections:
  - title: Test
    steps:
      - editor-set-content:
          role: textbox
          name: "YAML editor"
          value: "pages:\\n  - name: test"
          typing: instant`;
    const parsed = parseScenario(yaml, catalog) as SectionedScenario;
    const step = parsed.sections[0]!.steps[0]! as PluginStep;
    expect(step.kind).toBe('plugin');
    expect(step.params['typing']).toBe('instant');
  });

  it('resolves editor-cursor via catalog', () => {
    const yaml = `scenario: test
sections:
  - title: Test
    steps:
      - editor-cursor:
          role: textbox
          name: "YAML editor"
          line: 5
          col: 10`;
    const parsed = parseScenario(yaml, catalog) as SectionedScenario;
    const step = parsed.sections[0]!.steps[0]! as PluginStep;
    expect(step.kind).toBe('plugin');
    expect(step.params['line']).toBe(5);
    expect(step.params['col']).toBe(10);
  });

  it('resolves editor-completion via catalog', () => {
    const yaml = `scenario: test
sections:
  - title: Test
    steps:
      - editor-completion:
          role: textbox
          name: "YAML editor"
          label: forEach`;
    const parsed = parseScenario(yaml, catalog) as SectionedScenario;
    const step = parsed.sections[0]!.steps[0]! as PluginStep;
    expect(step.kind).toBe('plugin');
    expect(step.params['label']).toBe('forEach');
  });
});
