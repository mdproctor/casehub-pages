export type EventTransition =
  | { type: 'simple'; target: string }
  | { type: 'guarded'; target: string; when: string }
  | { type: 'match-based'; cases: MatchCase[] };

export interface MatchCase {
  match: Record<string, unknown> | null;
  target: string;
}

export interface StateDefinition {
  readonly name: string;
  readonly steps: Array<Record<string, unknown>>;
  readonly next: string | null;
  readonly onFailure: string | null;
  readonly deadline: string | null;
  readonly events: Record<string, EventTransition>;
  readonly isTerminal: boolean;
}

export function terminalState(name: string, steps: Array<Record<string, unknown>> = []): StateDefinition {
  return { name, steps, next: null, onFailure: null, deadline: null, events: {}, isTerminal: true };
}

export function completionDrivenState(
  name: string,
  next: string,
  steps: Array<Record<string, unknown>>,
  onFailure: string | null = null,
  deadline: string | null = null,
): StateDefinition {
  return { name, steps, next, onFailure, deadline, events: {}, isTerminal: false };
}

export function eventDrivenState(
  name: string,
  events: Record<string, EventTransition>,
  steps: Array<Record<string, unknown>>,
  onFailure: string | null = null,
  deadline: string | null = null,
): StateDefinition {
  return { name, steps, next: null, onFailure, deadline, events, isTerminal: false };
}

export interface ScenarioDefinition {
  readonly name: string;
  readonly states: Map<string, StateDefinition>;
  readonly initialState: string;
}
