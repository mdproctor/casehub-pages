import type { ResolvedStep } from '@casehubio/yaml-core/step';

export type PreExtractedStep =
  | { kind: 'signal-fire'; name: string; decorators: Record<string, unknown> }
  | { kind: 'await-signal'; name: string; decorators: Record<string, unknown> }
  | { kind: 'await-barrier'; name: string; decorators: Record<string, unknown> };

export type SchedulerStep = ResolvedStep | PreExtractedStep;

export interface TutorialMeta {
  title: string;
  description: string;
  area: string;
  labels?: string[];
  tags?: string[];
  estimated?: string;
  prerequisites?: string[];
  hero?: { title: string; subtitle?: string; icon?: string };
}

export interface SectionContent {
  type: 'inline' | 'template';
  markdown?: string;
  path?: string;
  section?: string;
}

export interface TutorialSection {
  title: string;
  content?: SectionContent;
  scenarioRef?: string;
  steps: SchedulerStep[];
}

export interface ScenarioBase {
  scenario?: string;
  meta?: TutorialMeta;
  orchestration?: OrchestrationBlock;
}

export interface FlatScenario extends ScenarioBase {
  steps: SchedulerStep[];
}

export interface SectionedScenario extends ScenarioBase {
  sections: TutorialSection[];
}

export type Scenario = FlatScenario | SectionedScenario;

export function isSectioned(s: Scenario): s is SectionedScenario {
  return 'sections' in s;
}

// --- Orchestration types (DES scheduler) ---

export interface DataTrigger {
  type: 'data';
  channel: string;
  condition?: string;
}

export interface TimeTrigger {
  type: 'time';
  delay: string;
  repeat?: boolean;
  fireTime?: number;
}

export interface StateMachineDefinition {
  initial: string;
  states: string[];
  transitions: Array<{ from: string; to: string; guard?: string }>;
  terminal?: string[];
}

export interface OrchestrationBlock {
  machines?: Record<string, StateMachineDefinition>;
  barriers?: Record<string, { count: number }>;
  quorums?: Record<string, { required: number; of: string[] }>;
  channels?: Record<string, { capacity?: number }>;
  signals?: string[];
}
