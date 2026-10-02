import type { ScenarioDefinition, StateDefinition, EventTransition } from './types.js';

export interface ValidationError {
  readonly rule: string;
  readonly message: string;
}

const DEADLINE_PATTERN = /^(.+)\s*->\s*(\S+)$/;

export class ScenarioValidator {
  static validate(definition: ScenarioDefinition): ValidationError[] {
    const errors: ValidationError[] = [];
    const stateNames = new Set(definition.states.keys());

    const initial = definition.states.get(definition.initialState);
    if (initial?.isTerminal) {
      errors.push({ rule: 'initial-not-terminal', message: `Initial state '${definition.initialState}' must not be terminal` });
    }

    const terminals = [...definition.states.values()].filter(s => s.isTerminal);
    if (terminals.length === 0) {
      errors.push({ rule: 'has-terminal', message: 'Scenario must have at least one terminal state' });
    }

    for (const [name, state] of definition.states) {
      checkReferences(name, state, stateNames, errors);
      checkDeadEnd(name, state, errors);
    }

    checkReachability(definition, stateNames, errors);

    return errors;
  }
}

function checkReferences(
  name: string,
  state: StateDefinition,
  stateNames: Set<string>,
  errors: ValidationError[],
): void {
  if (state.next && !stateNames.has(state.next)) {
    errors.push({ rule: 'valid-ref', message: `State '${name}' references unknown next state '${state.next}'` });
  }
  if (state.onFailure && !stateNames.has(state.onFailure)) {
    errors.push({ rule: 'valid-ref', message: `State '${name}' on-failure references unknown state '${state.onFailure}'` });
  }
  if (state.deadline) {
    const match = DEADLINE_PATTERN.exec(state.deadline);
    if (match) {
      const target = match[2]!;
      if (!stateNames.has(target)) {
        errors.push({ rule: 'valid-ref', message: `State '${name}' deadline target '${target}' is unknown` });
      }
    }
  }
  for (const [eventName, transition] of Object.entries(state.events)) {
    for (const target of eventTargets(transition)) {
      if (!stateNames.has(target)) {
        errors.push({ rule: 'valid-ref', message: `State '${name}' event '${eventName}' references unknown state '${target}'` });
      }
    }
  }
}

function eventTargets(transition: EventTransition): string[] {
  switch (transition.type) {
    case 'simple': return [transition.target];
    case 'guarded': return [transition.target];
    case 'match-based': return transition.cases.map(c => c.target);
  }
}

function checkDeadEnd(name: string, state: StateDefinition, errors: ValidationError[]): void {
  if (state.isTerminal) return;
  if (state.next) return;
  if (Object.keys(state.events).length > 0) return;
  errors.push({ rule: 'no-dead-end', message: `Non-terminal state '${name}' has no next state or events` });
}

function checkReachability(
  definition: ScenarioDefinition,
  stateNames: Set<string>,
  errors: ValidationError[],
): void {
  const visited = new Set<string>();
  const queue: string[] = [definition.initialState];

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (visited.has(current)) continue;
    visited.add(current);

    const state = definition.states.get(current);
    if (!state) continue;

    if (state.next && !visited.has(state.next)) queue.push(state.next);
    if (state.onFailure && !visited.has(state.onFailure)) queue.push(state.onFailure);
    if (state.deadline) {
      const match = DEADLINE_PATTERN.exec(state.deadline);
      if (match) {
        const target = match[2]!;
        if (!visited.has(target)) queue.push(target);
      }
    }
    for (const transition of Object.values(state.events)) {
      for (const target of eventTargets(transition)) {
        if (!visited.has(target)) queue.push(target);
      }
    }
  }

  for (const name of stateNames) {
    if (!visited.has(name)) {
      errors.push({ rule: 'reachable', message: `State '${name}' is unreachable from initial state '${definition.initialState}'` });
    }
  }
}
