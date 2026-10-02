import type { DefinitionFile, Definition } from '@casehubio/yaml-core/step';
import type { AriaBinding, GraphqlDomainBinding, SimulatedBinding } from '@casehubio/yaml-core/step';

function ariaDef(action: string, inputs: Record<string, { type: string; required?: boolean }>): Definition {
  const parsed: Record<string, { type: string; required: boolean }> = {};
  for (const [k, v] of Object.entries(inputs)) {
    parsed[k] = { type: v.type.toUpperCase() as any, required: v.required ?? false };
  }
  return { name: action, inputs: parsed, outputs: {}, invoke: { kind: 'aria', action } as AriaBinding, portability: 'ts' };
}

const TARGET_INPUTS = { role: { type: 'string', required: true }, name: { type: 'string', required: true }, index: { type: 'string' }, within: { type: 'object' } };

const ARIA_ACTIONS: Definition[] = [
  ariaDef('click', TARGET_INPUTS),
  ariaDef('fill', { ...TARGET_INPUTS, value: { type: 'string', required: true } }),
  ariaDef('navigate', { value: { type: 'string', required: true } }),
  ariaDef('select', { ...TARGET_INPUTS, value: { type: 'string', required: true } }),
  ariaDef('expand', TARGET_INPUTS),
  ariaDef('collapse', TARGET_INPUTS),
  ariaDef('assert', { ...TARGET_INPUTS, state: { type: 'object', required: true } }),
  ariaDef('wait', { ...TARGET_INPUTS, state: { type: 'object', required: true }, timeout: { type: 'integer' } }),
  ariaDef('show-markdown', { content: { type: 'string' }, file: { type: 'string' } }),
  ariaDef('spotlight', { role: { type: 'string' }, name: { type: 'string' }, index: { type: 'string' }, within: { type: 'object' }, content: { type: 'string' } }),
  ariaDef('scroll-to-row', { ...TARGET_INPUTS, key: { type: 'string' }, column: { type: 'string' }, value: { type: 'string' }, index: { type: 'integer' } }),
  ariaDef('editor-insert', { ...TARGET_INPUTS, value: { type: 'string', required: true }, typing: { type: 'string' }, line: { type: 'integer' }, col: { type: 'integer' } }),
  ariaDef('editor-set-content', { ...TARGET_INPUTS, value: { type: 'string', required: true }, typing: { type: 'string' } }),
  ariaDef('editor-replace', { ...TARGET_INPUTS, from: { type: 'object', required: true }, to: { type: 'object', required: true }, value: { type: 'string', required: true }, typing: { type: 'string' } }),
  ariaDef('editor-delete', { ...TARGET_INPUTS, from: { type: 'object', required: true }, to: { type: 'object', required: true } }),
  ariaDef('editor-cursor', { ...TARGET_INPUTS, line: { type: 'integer', required: true }, col: { type: 'integer', required: true } }),
  ariaDef('editor-highlight', { ...TARGET_INPUTS, from: { type: 'object', required: true }, to: { type: 'object', required: true }, style: { type: 'string' } }),
  ariaDef('editor-completion', { ...TARGET_INPUTS, label: { type: 'string', required: true } }),
];

const GRAPHQL_ACTION: Definition = {
  name: 'graphql', inputs: {
    domain: { type: 'STRING', required: true },
    operation: { type: 'STRING', required: true },
    params: { type: 'OBJECT', required: false },
  }, outputs: {}, invoke: { kind: 'graphql-domain' } as GraphqlDomainBinding, portability: 'universal',
};

const SIMULATED_ACTION: Definition = {
  name: 'simulated', inputs: {
    dataset: { type: 'STRING', required: true },
    data: { type: 'OBJECT', required: true },
  }, outputs: {}, invoke: { kind: 'simulated' } as SimulatedBinding, portability: 'ts',
};

export function loadScenarioDefinitions(): DefinitionFile[] {
  const actions: Record<string, Definition> = {};
  for (const def of ARIA_ACTIONS) actions[def.name] = def;
  actions['graphql'] = GRAPHQL_ACTION;
  actions['simulated'] = SIMULATED_ACTION;
  return [{ actions }];
}
