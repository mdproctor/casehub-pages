import type { ResolvedStep } from '@casehubio/yaml-core/step';
import type { AriaTarget } from '@casehubio/pages-primitives';

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

export interface SimulationBlock {
  strategies: Record<string, string>;
  corpus?: string[];
  capture?: string[];
}

export interface PlaybookBase {
  playbook?: string;
  meta?: TutorialMeta;
  orchestration?: OrchestrationBlock;
  simulation?: SimulationBlock;
}

export interface FlatPlaybook extends PlaybookBase {
  steps: SchedulerStep[];
}

export interface SectionedPlaybook extends PlaybookBase {
  sections: TutorialSection[];
}

export type Playbook = FlatPlaybook | SectionedPlaybook;

export function isSectioned(s: Playbook): s is SectionedPlaybook {
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

// --- Dispatch protocol types (executor ↔ orchestrator) ---

export interface CommandPayload {
  id: string;
  action: string;
  element?: AriaTarget;
  value?: string;
  state?: Record<string, unknown>;
  timeout?: number;
}

export interface DispatchStep {
  name: string;
  label?: string;
  actor?: string;
  action: string;
  params: Record<string, unknown>;
  await?: { match?: Record<string, unknown>; timeout?: number; interval?: number; status?: number };
  mode?: string;
  delay?: number;
}

export interface DispatchSequence {
  op: 'dispatch-sequence';
  sessionId: string;
  steps: DispatchStep[];
  speed?: number;
  paused: boolean;
}

export interface ExecutorControl {
  op: 'executor-control';
  sessionId: string;
  command: 'pause' | 'resume' | 'step' | 'speed' | 'stop';
  speed?: number;
}
