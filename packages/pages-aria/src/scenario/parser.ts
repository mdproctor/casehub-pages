import { parse, parseAllDocuments } from 'yaml';
import type { Catalog, ResolvedStep } from '@casehubio/yaml-core/step';
import { Walker } from '@casehubio/yaml-core/step';
import { IncludeExpander, parsePlaybookFrontMatter } from '@casehubio/yaml-core';
import type { PlaybookFrontMatter, TemplateLoader } from '@casehubio/yaml-core';
import type {
  Scenario, FlatScenario, SectionedScenario,
  TutorialMeta, TutorialSection, SectionContent,
  SchedulerStep, PreExtractedStep,
  OrchestrationBlock,
} from './types.js';

const WALKER_KNOWN_KEYS = new Set([
  'step', 'invoke',
  'block', 'parallel', 'try', 'catch', 'finally', 'select',
  'if', 'then', 'else', 'match', 'cases',
  'on-success', 'on-failure', 'forEach', 'loop',
  'retry', 'timeout', 'delay', 'on-error', 'trigger',
  'transform', 'signal', 'publish', 'transition',
  'semaphore', 'barrier', 'quorum', 'race',
  'label', 'target', 'actor', 'when', 'speed', 'content', 'await', 'mode',
]);

type SlotType = 'walker' | 'pre' | 'skip';

function hasActionKey(step: Record<string, unknown>): boolean {
  for (const key of Object.keys(step)) {
    if (!WALKER_KNOWN_KEYS.has(key) && key !== 'concurrent') return true;
  }
  return false;
}

function collectDecorators(step: Record<string, unknown>, exclude: Set<string>): Record<string, unknown> {
  const decorators: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(step)) {
    if (!exclude.has(k)) decorators[k] = v;
  }
  return decorators;
}

function preExtract(rawSteps: Record<string, unknown>[]): {
  walkerSteps: Record<string, unknown>[];
  preExtracted: PreExtractedStep[];
  slotTypes: SlotType[];
} {
  const walkerSteps: Record<string, unknown>[] = [];
  const preExtracted: PreExtractedStep[] = [];
  const slotTypes: SlotType[] = [];

  for (const step of rawSteps) {
    if ('await' in step && typeof step['await'] === 'object' && step['await'] !== null) {
      const body = step['await'] as Record<string, unknown>;
      const decorators = collectDecorators(step, new Set(['await', 'step']));
      if (body['signal']) {
        preExtracted.push({ kind: 'await-signal', name: body['signal'] as string, decorators });
        slotTypes.push('pre');
        continue;
      }
      if (body['barrier']) {
        preExtracted.push({ kind: 'await-barrier', name: body['barrier'] as string, decorators });
        slotTypes.push('pre');
        continue;
      }
    }

    if ('concurrent' in step) {
      const branches = step['concurrent'] as Record<string, unknown[]>;
      const parallelChildren: Record<string, unknown>[] = [];
      for (const [name, branchSteps] of Object.entries(branches)) {
        parallelChildren.push({ step: name, block: branchSteps });
      }
      walkerSteps.push({
        ...(step['step'] ? { step: step['step'] } : {}),
        parallel: parallelChildren,
      });
      slotTypes.push('walker');
      continue;
    }

    if ('trigger' in step && 'steps' in step) {
      slotTypes.push('skip');
      continue;
    }

    if ('signal' in step && !hasActionKey(step)) {
      const decorators = collectDecorators(step, new Set(['signal', 'step']));
      preExtracted.push({ kind: 'signal-fire', name: step['signal'] as string, decorators });
      slotTypes.push('pre');
      continue;
    }

    walkerSteps.push(step);
    slotTypes.push('walker');
  }

  return { walkerSteps, preExtracted, slotTypes };
}

function mergeSteps(resolved: ResolvedStep[], preExtracted: PreExtractedStep[], slotTypes: SlotType[]): SchedulerStep[] {
  const result: SchedulerStep[] = [];
  let ri = 0;
  let pi = 0;
  for (const slot of slotTypes) {
    if (slot === 'walker') result.push(resolved[ri++]);
    else if (slot === 'pre') result.push(preExtracted[pi++]);
  }
  return result;
}

export function deriveStepName(step: ResolvedStep, index: number): string {
  if (step.name) return step.name;
  const label = step.decorators?.label as string | undefined;
  if (label) {
    return label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  }
  const action = 'entry' in step ? step.entry.name : step.kind;
  return `${action}-${index}`;
}

function resolveStepArray(rawSteps: Record<string, unknown>[], catalog: Catalog): SchedulerStep[] {
  const { walkerSteps, preExtracted, slotTypes } = preExtract(rawSteps);
  const resolved = Walker.resolve(walkerSteps, catalog);
  for (let i = 0; i < resolved.length; i++) {
    if (!resolved[i].name) {
      (resolved[i] as { name: string | null }).name = deriveStepName(resolved[i], i);
    }
  }
  return mergeSteps(resolved, preExtracted, slotTypes);
}

export interface ScenarioDocument {
  frontMatter: PlaybookFrontMatter | null;
  scenario: Scenario;
}

function splitMultiDoc(yamlString: string): { meta: Record<string, unknown> | null; content: Record<string, unknown> } {
  const docs = parseAllDocuments(yamlString);
  if (docs.length === 1) {
    return { meta: null, content: docs[0].toJSON() as Record<string, unknown> };
  }

  const firstDoc = docs[0].toJSON() as Record<string, unknown>;
  const secondDoc = docs[1].toJSON() as Record<string, unknown>;

  if ('playbook' in firstDoc) {
    return { meta: firstDoc, content: secondDoc };
  }

  const merged = { ...firstDoc, ...secondDoc };
  return { meta: firstDoc, content: merged };
}

export function parseScenario(yamlString: string, catalog: Catalog): Scenario {
  const { meta, content } = splitMultiDoc(yamlString);

  if (meta && !('playbook' in meta)) {
    return parseScenarioFromParsed(content, catalog);
  }

  if (meta && 'playbook' in meta) {
    return parseScenarioFromParsed(content, catalog);
  }

  return parseScenarioFromParsed(content, catalog);
}

export function parseScenarioDocument(yamlString: string, catalog: Catalog): ScenarioDocument {
  const { meta, content } = splitMultiDoc(yamlString);
  const frontMatter = meta ? parsePlaybookFrontMatter(meta) : null;
  const scenario = parseScenarioFromParsed(content, catalog);
  return { frontMatter, scenario };
}

export async function parseScenarioWithIncludes(
  yamlString: string,
  catalog: Catalog,
  loader: TemplateLoader,
): Promise<Scenario> {
  const { content } = splitMultiDoc(yamlString);
  const expanded = await IncludeExpander.expand(content, loader);
  return parseScenarioFromParsed(expanded, catalog);
}

function parseScenarioFromParsed(parsed: Record<string, unknown>, catalog: Catalog): Scenario {
  const hasSteps = Array.isArray(parsed['steps']);
  const hasSections = Array.isArray(parsed['sections']);

  if (hasSteps && hasSections) {
    throw new Error('Invalid scenario: "steps" and "sections" are mutually exclusive — use one or the other');
  }
  if (!hasSteps && !hasSections) {
    throw new Error('Invalid scenario: must have "steps" or "sections"');
  }

  const meta = parsed['meta'] as TutorialMeta | undefined;
  const orchestration = parsed['orchestration'] as OrchestrationBlock | undefined;

  if (hasSections) {
    const sections = (parsed['sections'] as unknown[]).map(raw => {
      const sec = raw as Record<string, unknown>;
      const steps = Array.isArray(sec['steps'])
        ? resolveStepArray(sec['steps'] as Record<string, unknown>[], catalog)
        : [];
      return {
        title: (sec['label'] ?? sec['title']) as string,
        content: sec['content'] as SectionContent | undefined,
        scenarioRef: sec['scenario-ref'] as string | undefined,
        steps,
      };
    });
    const result: SectionedScenario = { sections };
    if (parsed['scenario']) result.scenario = parsed['scenario'] as string;
    if (meta) result.meta = meta;
    if (orchestration) result.orchestration = orchestration;
    return result;
  }

  const steps = resolveStepArray(parsed['steps'] as Record<string, unknown>[], catalog);
  const result: FlatScenario = { steps };
  if (parsed['scenario']) result.scenario = parsed['scenario'] as string;
  if (meta) result.meta = meta;
  if (orchestration) result.orchestration = orchestration;
  return result;
}
