import type { EventTransition, MatchCase, ScenarioDefinition, StateDefinition } from './types.js';
import { terminalState, completionDrivenState, eventDrivenState } from './types.js';

const METADATA_KEYS = new Set(['next', 'on-failure', 'deadline', 'on', 'terminal']);

export class ScenarioParser {
  static parse(name: string, raw: Record<string, unknown>): ScenarioDefinition {
    if (!name || !name.trim()) {
      throw new Error('Scenario name must not be blank');
    }

    const statesRaw = raw['states'] as Record<string, unknown> | undefined;
    if (!statesRaw || typeof statesRaw !== 'object') {
      throw new Error('Scenario must have a states block');
    }

    const entries = Object.entries(statesRaw);
    if (entries.length === 0) {
      throw new Error('Scenario must have at least one state');
    }

    const states = new Map<string, StateDefinition>();
    for (const [stateName, stateValue] of entries) {
      states.set(stateName, parseState(stateName, stateValue));
    }

    return { name: name.trim(), states, initialState: entries[0]![0] };
  }
}

function parseState(name: string, raw: unknown): StateDefinition {
  if (raw === 'terminal' || raw === true) {
    return terminalState(name);
  }

  if (!Array.isArray(raw)) {
    throw new Error(`State '${name}' must be a list of entries or 'terminal'`);
  }

  const steps: Array<Record<string, unknown>> = [];
  let next: string | null = null;
  let onFailure: string | null = null;
  let deadline: string | null = null;
  let isTerminal = false;
  const events: Record<string, EventTransition> = {};

  for (const entry of raw) {
    if (typeof entry === 'string') {
      if (entry === 'terminal') {
        isTerminal = true;
        continue;
      }
      throw new Error(`State '${name}': unexpected string entry '${entry}'`);
    }

    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
      throw new Error(`State '${name}': entries must be maps`);
    }

    const map = entry as Record<string, unknown>;
    const keys = Object.keys(map);

    for (const key of keys) {
      if (!METADATA_KEYS.has(key)) continue;
      switch (key) {
        case 'next':
          next = String(map['next']);
          break;
        case 'on-failure':
          onFailure = String(map['on-failure']);
          break;
        case 'deadline':
          deadline = String(map['deadline']);
          break;
        case 'terminal':
          isTerminal = map['terminal'] === true || map['terminal'] === 'true';
          break;
        case 'on':
          Object.assign(events, parseEvents(map['on'] as Record<string, unknown>, name));
          break;
      }
    }

    const stepKeys = keys.filter(k => !METADATA_KEYS.has(k));
    if (stepKeys.length > 0) {
      const step: Record<string, unknown> = {};
      for (const k of stepKeys) step[k] = map[k];
      steps.push(step);
    }
  }

  if (isTerminal) {
    return terminalState(name, steps);
  }

  if (Object.keys(events).length > 0) {
    return eventDrivenState(name, events, steps, onFailure, deadline);
  }

  if (next != null) {
    return completionDrivenState(name, next, steps, onFailure, deadline);
  }

  return completionDrivenState(name, '', steps, onFailure, deadline);
}

function parseEvents(raw: Record<string, unknown>, stateName: string): Record<string, EventTransition> {
  const events: Record<string, EventTransition> = {};
  for (const [eventName, value] of Object.entries(raw)) {
    events[eventName] = parseEventTransition(eventName, value, stateName);
  }
  return events;
}

function parseEventTransition(eventName: string, raw: unknown, stateName: string): EventTransition {
  if (typeof raw === 'string') {
    return { type: 'simple', target: raw };
  }

  if (Array.isArray(raw)) {
    const cases: MatchCase[] = raw.map((entry) => {
      if (typeof entry !== 'object' || entry === null) {
        throw new Error(`State '${stateName}' event '${eventName}': match cases must be objects`);
      }
      const obj = entry as Record<string, unknown>;
      const target = String(obj['to'] ?? '');
      const match = obj['match'] as Record<string, unknown> | undefined ?? null;
      return { match, target };
    });
    return { type: 'match-based', cases };
  }

  if (typeof raw === 'object' && raw !== null) {
    const obj = raw as Record<string, unknown>;
    const target = String(obj['to'] ?? '');
    const when = obj['when'] as string | undefined;
    if (when) {
      return { type: 'guarded', target, when };
    }
    return { type: 'simple', target };
  }

  throw new Error(`State '${stateName}' event '${eventName}': unsupported transition format`);
}
