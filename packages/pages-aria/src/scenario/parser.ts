import { parse } from 'yaml';
import type { Catalog, ResolvedStep } from '@casehubio/yaml-core/step';
import { Walker } from '@casehubio/yaml-core/step';
import { IncludeExpander } from '@casehubio/yaml-core';
import type { TemplateLoader } from '@casehubio/yaml-core';
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
]);

type SlotType = 'walker' | 'pre' | 'skip';

function hasActionKey(step: Record<string, unknown>): boolean {
  for (const key of Object.keys(step)) {
    if (!WALKER_KNOWN_KEYS.has(key) && key !== 'concurrent' && key !== 'await') return true;
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

function resolveStepArray(rawSteps: Record<string, unknown>[], catalog: Catalog): SchedulerStep[] {
  const { walkerSteps, preExtracted, slotTypes } = preExtract(rawSteps);
  const resolved = Walker.resolve(walkerSteps, catalog);
  return mergeSteps(resolved, preExtracted, slotTypes);
}

export function parseScenario(yamlString: string, catalog: Catalog): Scenario {
  const parsed = parse(yamlString) as Record<string, unknown>;
  return parseScenarioFromParsed(parsed, catalog);
}

export async function parseScenarioWithIncludes(
  yamlString: string,
  catalog: Catalog,
  loader: TemplateLoader,
): Promise<Scenario> {
  let parsed = parse(yamlString) as Record<string, unknown>;
  parsed = await IncludeExpander.expand(parsed, loader);
  return parseScenarioFromParsed(parsed, catalog);
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
        title: sec['title'] as string,
        content: sec['content'] as SectionContent | undefined,
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
