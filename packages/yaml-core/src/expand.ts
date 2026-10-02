import type {
  ExpandResult, ExpansionDiagnostic, ForEachDirective, IterationGroup,
  VariableSource, YamlImport, YamlModule,
} from './types.js';
import {
  UnresolvedVariableError, forEachContextSource, nestedSource,
  parseForEachDirective,
} from './types.js';
import { isTruthy } from './truthiness.js';
import { VariableResolver } from './variable-resolver.js';
import { ModuleExpander } from './module-expander.js';
import { ForEachExpander } from './foreach-expander.js';
import type { ForEachAdapter, Reference } from './foreach-expander.js';
import { CsvParser } from './csv-parser.js';
import type { CsvDataSource } from './csv-parser.js';
import { ImportExpander } from './import-expander.js';

const YAML_CORE_KEYS = new Set(['variables', 'modules', 'imports', 'iterations', 'data']);

interface ExpandOptions {
  strict?: boolean;
}

interface MapElement {
  id: string;
  raw: Record<string, unknown>;
  forEach: ForEachDirective | null;
  condition: string | null;
}

const mapAdapter: ForEachAdapter<MapElement> = {
  stamp(template, stampedId, scopedResolver) {
    const raw = { ...template.raw };
    delete raw['forEach'];
    delete raw['if'];
    const resolved = scopedResolver.resolveMap(raw, stampedId);
    return { id: stampedId, raw: resolved, forEach: null, condition: null };
  },
  getForEach(element) { return element.forEach; },
  getCondition(element) { return element.condition; },
  getReferences() { return []; },
  withReferences(element) { return element; },
};

function extractVariableSources(
  variables: Record<string, unknown>,
): Record<string, VariableSource> {
  const sources: Record<string, VariableSource> = {};
  for (const [prefix, value] of Object.entries(variables)) {
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      const map = value as Record<string, unknown>;
      const hasNested = Object.values(map).some(
        (v) => typeof v === 'object' && v !== null);
      if (hasNested) {
        sources[prefix] = nestedSource(map as Record<string, Record<string, unknown>>);
      } else {
        sources[prefix] = (name) => {
          const v = map[name];
          return v !== undefined ? String(v) : undefined;
        };
      }
    }
  }
  return sources;
}

function parseModules(
  rawModules: Record<string, unknown>,
): Record<string, YamlModule> {
  const modules: Record<string, YamlModule> = {};
  for (const [name, rawDef] of Object.entries(rawModules)) {
    if (typeof rawDef !== 'object' || rawDef === null) continue;
    const def = rawDef as Record<string, unknown>;
    modules[name] = {
      name,
      parameters: (def['parameters'] ?? {}) as Record<string, any>,
      outputs: (def['outputs'] ?? {}) as Record<string, any>,
      sections: (def['sections'] ?? {}) as Record<string, Record<string, unknown>>,
    };
  }
  return modules;
}

function parseImports(rawImports: unknown): YamlImport[] {
  if (!Array.isArray(rawImports)) return [];
  return rawImports.map((raw) => ({
    module: raw.module as string | undefined,
    actions: raw.actions as string | undefined,
    steps: raw.steps as string | undefined,
    as: raw.as as string,
    condition: raw.if as string | undefined,
    parameters: (raw.parameters ?? {}) as Record<string, string>,
    forEach: raw.forEach as unknown,
    loop: raw.loop as unknown,
  }));
}

function parseIterationGroups(
  rawIterations: Record<string, unknown>,
): Record<string, IterationGroup> {
  const groups: Record<string, IterationGroup> = {};
  for (const [name, raw] of Object.entries(rawIterations)) {
    if (typeof raw === 'object' && raw !== null) {
      const spec = raw as Record<string, unknown>;
      groups[name] = {
        as: spec['as'] as string | undefined,
        in: (spec['in'] as unknown[]) ?? [],
      };
    }
  }
  return groups;
}

function expandForEachInSection(
  section: Record<string, unknown>,
  resolver: VariableResolver,
  iterationGroups: Record<string, IterationGroup>,
  dataSources: Record<string, CsvDataSource>,
): Record<string, unknown> {
  const elements = new Map<string, MapElement>();
  const nonMapEntries: Array<[string, unknown]> = [];

  for (const [key, value] of Object.entries(section)) {
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      const raw = value as Record<string, unknown>;
      const forEach = parseForEachDirective(raw['forEach'] ?? null);
      const condition = raw['if'] as string | null ?? null;
      elements.set(key, { id: key, raw, forEach, condition });
    } else {
      nonMapEntries.push([key, value]);
    }
  }

  if (elements.size === 0) return section;

  const hasForEach = [...elements.values()].some((e) => e.forEach !== null);
  const hasCondition = [...elements.values()].some((e) => e.condition !== null);
  if (!hasForEach && !hasCondition) return section;

  const hasCsv = Object.keys(dataSources).length > 0;
  const result = hasCsv
    ? ForEachExpander.expandWithCsv(elements, iterationGroups, dataSources, resolver, mapAdapter, 10000)
    : ForEachExpander.expand(elements, iterationGroups, resolver, mapAdapter, 10000);

  const output: Record<string, unknown> = {};
  for (const [key, value] of nonMapEntries) {
    output[key] = value;
  }
  for (const [key, element] of result.elements) {
    output[key] = element.raw;
  }
  return output;
}

export function expand(
  map: Record<string, unknown>,
  options?: ExpandOptions,
): ExpandResult {
  const strict = options?.strict ?? false;
  const diagnostics: ExpansionDiagnostic[] = [];

  const rawVariables = (map['variables'] ?? {}) as Record<string, unknown>;
  const rawModules = (map['modules'] ?? {}) as Record<string, unknown>;
  const rawImports = map['imports'];
  const rawIterations = (map['iterations'] ?? {}) as Record<string, unknown>;
  const rawData = (map['data'] ?? {}) as Record<string, unknown>;

  let dataSources: Record<string, CsvDataSource> = {};
  try {
    dataSources = CsvParser.fromDataBlock(rawData);
  } catch (e) {
    if (strict) throw e;
    diagnostics.push({
      severity: 'error',
      message: e instanceof Error ? e.message : String(e),
      path: ['data'],
      category: 'expansion-error',
    });
  }

  const iterationGroups = parseIterationGroups(rawIterations);

  let workingMap = { ...map };

  const modules = parseModules(rawModules);
  const rawParsedImports = parseImports(rawImports);
  const imports = ImportExpander.expand(rawParsedImports, iterationGroups, dataSources);

  if (imports.length > 0) {
    try {
      const existingSections: Record<string, Record<string, unknown>> = {};
      for (const [key, value] of Object.entries(workingMap)) {
        if (YAML_CORE_KEYS.has(key)) continue;
        if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
          existingSections[key] = value as Record<string, unknown>;
        }
      }

      const moduleDeferredPrefixes = new Set(['each', 'module', ...Object.keys(rawVariables)]);
      const expanded = ModuleExpander.expand(imports, modules, existingSections, moduleDeferredPrefixes);

      for (const [sectionName, sectionContent] of Object.entries(expanded.sections)) {
        workingMap[sectionName] = sectionContent;
      }
    } catch (e) {
      if (strict) throw e;
      diagnostics.push({
        severity: 'error',
        message: e instanceof Error ? e.message : String(e),
        path: ['imports'],
        category: 'expansion-error',
      });
    }
  }

  const prefixSources = extractVariableSources(rawVariables);
  const varResolver = new VariableResolver(prefixSources, new Set(['each']));
  const forEachResolver = new VariableResolver(prefixSources, new Set());

  const resultMap: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(workingMap)) {
    if (YAML_CORE_KEYS.has(key)) continue;

    try {
      const resolved = varResolver.resolve(value);

      if (typeof resolved === 'object' && resolved !== null && !Array.isArray(resolved)) {
        const section = resolved as Record<string, unknown>;
        resultMap[key] = expandForEachInSection(section, forEachResolver, iterationGroups, dataSources);
      } else if (Array.isArray(resolved)) {
        resultMap[key] = resolved.map((item) => {
          if (typeof item === 'object' && item !== null && !Array.isArray(item)) {
            const obj = item as Record<string, unknown>;
            if (obj['components'] && typeof obj['components'] === 'object' && !Array.isArray(obj['components'])) {
              return {
                ...obj,
                components: expandForEachInSection(
                  obj['components'] as Record<string, unknown>,
                  forEachResolver, iterationGroups, dataSources,
                ),
              };
            }
          }
          return item;
        });
      } else {
        resultMap[key] = resolved;
      }
    } catch (e) {
      if (strict) throw e;
      if (e instanceof UnresolvedVariableError) {
        diagnostics.push({
          severity: 'error',
          message: e.message,
          path: [key],
          category: 'unresolved-variable',
        });
        resultMap[key] = value;
      } else {
        diagnostics.push({
          severity: 'error',
          message: e instanceof Error ? e.message : String(e),
          path: [key],
          category: 'expansion-error',
        });
        resultMap[key] = value;
      }
    }
  }

  return { map: resultMap, diagnostics };
}
