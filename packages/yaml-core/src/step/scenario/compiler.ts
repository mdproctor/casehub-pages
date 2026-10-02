import type { ScenarioDefinition, StateDefinition } from './types.js';
import { ScenarioValidator } from './validator.js';
import { StateMachineBuilder } from '../../orchestration/state-machine.js';
import type { OrcStateMachine } from '../../orchestration/types.js';

const DEADLINE_PATTERN = /^(.+)\s*->\s*(\S+)$/;

export interface CompiledScenario {
  readonly definition: ScenarioDefinition;
  readonly stateMachine: OrcStateMachine<string>;
  readonly stateSteps: Map<string, Array<Record<string, unknown>>>;
}

export class ScenarioCompiler {
  static compile(definition: ScenarioDefinition): CompiledScenario {
    const errors = ScenarioValidator.validate(definition);
    if (errors.length > 0) {
      throw new Error(`Scenario '${definition.name}' validation failed:\n${errors.map(e => `  - ${e.message}`).join('\n')}`);
    }

    const builder = new StateMachineBuilder<string>(definition.name, definition.initialState);

    for (const [name, state] of definition.states) {
      registerTransitions(builder, name, state, definition);
    }

    const terminalStates = [...definition.states.entries()]
      .filter(([_, s]) => s.isTerminal)
      .map(([n]) => n);
    builder.terminal(...terminalStates);

    const stateSteps = new Map<string, Array<Record<string, unknown>>>();
    for (const [name, state] of definition.states) {
      stateSteps.set(name, state.steps);
    }

    return {
      definition,
      stateMachine: builder.build(),
      stateSteps,
    };
  }
}

function registerTransitions(
  builder: StateMachineBuilder<string>,
  name: string,
  state: StateDefinition,
  definition: ScenarioDefinition,
): void {
  if (state.isTerminal) return;

  if (state.next) {
    builder.transition(name, state.next);
  }

  if (state.onFailure) {
    builder.transition(name, state.onFailure);
  }

  if (state.deadline) {
    const match = DEADLINE_PATTERN.exec(state.deadline);
    if (match) {
      const target = match[2]!;
      builder.transition(name, target);
    }
  }

  for (const transition of Object.values(state.events)) {
    switch (transition.type) {
      case 'simple':
        builder.transition(name, transition.target);
        break;
      case 'guarded':
        builder.transition(name, transition.target);
        break;
      case 'match-based':
        for (const c of transition.cases) {
          builder.transition(name, c.target);
        }
        break;
    }
  }
}
