import { describe, it, expect } from 'vitest';
import { parsePlaybook } from './parser.js';
import type { FlatPlaybook, PreExtractedStep } from './types.js';
import type { Catalog, CatalogEntry, PluginStep, ParallelStep, DelayStep, BlockStep } from '@casehubio/yaml-core/step';
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

describe('Parser — orchestration constructs', () => {
  it('transforms concurrent to parallel with named block children', () => {
    const yaml = `
scenario: test
steps:
  - concurrent:
      branch-a:
        - click: { role: button, name: A }
      branch-b:
        - click: { role: button, name: B }
    `;
    const result = parsePlaybook(yaml, catalog) as FlatPlaybook;
    const step = result.steps[0] as ParallelStep;
    expect(step.kind).toBe('parallel');
    expect(step.steps).toHaveLength(2);
    expect((step.steps[0] as BlockStep).kind).toBe('block');
    expect((step.steps[0] as BlockStep).name).toBe('branch-a');
    expect((step.steps[1] as BlockStep).kind).toBe('block');
    expect((step.steps[1] as BlockStep).name).toBe('branch-b');
  });

  it('pre-extracts standalone signal as signal-fire', () => {
    const yaml = `
scenario: test
steps:
  - signal: go
    `;
    const result = parsePlaybook(yaml, catalog) as FlatPlaybook;
    const step = result.steps[0] as PreExtractedStep;
    expect(step.kind).toBe('signal-fire');
    expect(step.name).toBe('go');
  });

  it('pre-extracts await with signal as await-signal', () => {
    const yaml = `
scenario: test
steps:
  - await: { signal: data-loaded }
    `;
    const result = parsePlaybook(yaml, catalog) as FlatPlaybook;
    const step = result.steps[0] as PreExtractedStep;
    expect(step.kind).toBe('await-signal');
    expect(step.name).toBe('data-loaded');
  });

  it('pre-extracts await with barrier as await-barrier', () => {
    const yaml = `
scenario: test
steps:
  - await: { barrier: all-ready }
    `;
    const result = parsePlaybook(yaml, catalog) as FlatPlaybook;
    const step = result.steps[0] as PreExtractedStep;
    expect(step.kind).toBe('await-barrier');
    expect(step.name).toBe('all-ready');
  });

  it('resolves standalone delay as DelayStep', () => {
    const yaml = `
scenario: test
steps:
  - delay: 500ms
    `;
    const result = parsePlaybook(yaml, catalog) as FlatPlaybook;
    const step = result.steps[0] as DelayStep;
    expect(step.kind).toBe('delay');
    expect(step.duration).toBe(500);
  });

  it('treats delay alongside action as decorator', () => {
    const yaml = `
scenario: test
steps:
  - click: { role: button, name: OK }
    delay: 100ms
    `;
    const result = parsePlaybook(yaml, catalog) as FlatPlaybook;
    const step = result.steps[0] as PluginStep;
    expect(step.kind).toBe('plugin');
    expect(step.decorators['delay']).toBe('100ms');
  });

  it('stores if decorator on action step', () => {
    const yaml = `
scenario: test
steps:
  - click: { role: button, name: OK }
    if: isReady
    `;
    const result = parsePlaybook(yaml, catalog) as FlatPlaybook;
    const step = result.steps[0] as PluginStep;
    expect(step.kind).toBe('plugin');
    expect(step.decorators['if']).toBe('isReady');
  });

  it('stores retry decorator on action step', () => {
    const yaml = `
scenario: test
steps:
  - click: { role: button, name: Submit }
    retry: 3
    `;
    const result = parsePlaybook(yaml, catalog) as FlatPlaybook;
    const step = result.steps[0] as PluginStep;
    expect(step.kind).toBe('plugin');
    expect(step.decorators['retry']).toBe(3);
  });

  it('preserves top-level orchestration block', () => {
    const yaml = `
scenario: test
orchestration:
  barriers:
    all-ready: { count: 3 }
  channels:
    trades: { capacity: 10 }
  signals: [go, stop]
steps:
  - click: { role: button, name: Start }
    `;
    const result = parsePlaybook(yaml, catalog);
    expect(result.orchestration?.barriers?.['all-ready']?.count).toBe(3);
    expect(result.orchestration?.channels?.['trades']?.capacity).toBe(10);
    expect(result.orchestration?.signals).toEqual(['go', 'stop']);
  });

  it('skips trigger+steps constructs from step array', () => {
    const yaml = `
scenario: test
steps:
  - click: { role: button, name: Before }
  - trigger:
      type: data
      channel: trades
    steps:
      - click: { role: button, name: Refresh }
  - click: { role: button, name: After }
    `;
    const result = parsePlaybook(yaml, catalog) as FlatPlaybook;
    expect(result.steps).toHaveLength(2);
    expect((result.steps[0] as PluginStep).entry.qualifiedName).toBe('click');
    expect((result.steps[1] as PluginStep).entry.qualifiedName).toBe('click');
  });

  it('resolves simulated via catalog', () => {
    const yaml = `
scenario: test
steps:
  - simulated:
      dataset: accounts
      data: { id: 1, name: Test }
    `;
    const result = parsePlaybook(yaml, catalog) as FlatPlaybook;
    const step = result.steps[0] as PluginStep;
    expect(step.kind).toBe('plugin');
    expect(step.entry.qualifiedName).toBe('simulated');
    expect(step.params['dataset']).toBe('accounts');
  });

  it('resolves graphql via catalog', () => {
    const yaml = `
scenario: test
steps:
  - graphql:
      domain: finance
      operation: getAccounts
    `;
    const result = parsePlaybook(yaml, catalog) as FlatPlaybook;
    const step = result.steps[0] as PluginStep;
    expect(step.kind).toBe('plugin');
    expect(step.entry.qualifiedName).toBe('graphql');
    expect(step.params['domain']).toBe('finance');
  });

  it('resolves aria actions via catalog', () => {
    const yaml = `
scenario: test
steps:
  - click: { role: button, name: OK }
  - fill: { role: textbox, name: Email, value: test@example.com }
    `;
    const result = parsePlaybook(yaml, catalog) as FlatPlaybook;
    expect(result.steps).toHaveLength(2);
    expect(result.steps.every(s => s.kind === 'plugin')).toBe(true);
    expect((result.steps[0] as PluginStep).entry.qualifiedName).toBe('click');
    expect((result.steps[1] as PluginStep).entry.qualifiedName).toBe('fill');
  });

  it('interleaves pre-extracted and Walker-resolved steps in original order', () => {
    const yaml = `
scenario: test
steps:
  - click: { role: button, name: Start }
  - signal: checkpoint
  - fill: { role: textbox, name: Input, value: data }
  - await: { signal: ready }
  - click: { role: button, name: Finish }
    `;
    const result = parsePlaybook(yaml, catalog) as FlatPlaybook;
    expect(result.steps).toHaveLength(5);
    expect(result.steps[0].kind).toBe('plugin');
    expect(result.steps[1].kind).toBe('signal-fire');
    expect(result.steps[2].kind).toBe('plugin');
    expect(result.steps[3].kind).toBe('await-signal');
    expect(result.steps[4].kind).toBe('plugin');
  });
});
