import type { ForEachAdapter, Reference } from './foreach-expander.js';
import { ForEachExpander } from './foreach-expander.js';
import type { ForEachDirective, IterationGroup, YamlImport } from './types.js';
import { parseForEachDirective, forEachContextSource } from './types.js';
import { VariableResolver } from './variable-resolver.js';
import type { CsvDataSource } from './csv-parser.js';
import { parseLoopDirective } from './orchestration/directives.js';

const MAX_IMPORT_EXPANSION = 10000;

const importAdapter: ForEachAdapter<YamlImport> = {
  stamp(template, stampedId, scopedResolver) {
    const resolvedParams: Record<string, string> = {};
    for (const [key, value] of Object.entries(template.parameters)) {
      resolvedParams[key] = value.includes('${')
        ? scopedResolver.resolveString(value, `${stampedId}.parameters.${key}`)
        : value;
    }
    return {
      module: template.module,
      actions: template.actions,
      as: stampedId,
      parameters: resolvedParams,
    };
  },
  getForEach(element) {
    return parseForEachDirective(element.forEach ?? null);
  },
  getCondition(element) {
    return element.condition ?? null;
  },
  getReferences() { return []; },
  withReferences(element) { return element; },
};

function loopToForEach(loop: unknown): ForEachDirective {
  const directive = parseLoopDirective(loop);
  const count = 'count' in directive ? directive.count : 0;
  const values: string[] = [];
  for (let i = 0; i < count; i++) values.push(String(i));
  return { type: 'inline', as: 'i', in: values };
}

function normaliseForEach(imp: YamlImport): YamlImport {
  if (imp.forEach != null) return imp;
  if (imp.loop != null) {
    return { ...imp, forEach: loopToForEach(imp.loop), loop: undefined };
  }
  return imp;
}

export class ImportExpander {
  static expand(
    imports: YamlImport[],
    iterationGroups: Record<string, IterationGroup>,
    dataSources: Record<string, CsvDataSource>,
  ): YamlImport[] {
    const moduleImports = imports.filter(imp => imp.steps == null);

    const hasExpansion = moduleImports.some(imp => imp.forEach != null || imp.loop != null);
    if (!hasExpansion) return moduleImports;

    const result: YamlImport[] = [];
    const seenAliases = new Set<string>();
    const resolver = new VariableResolver({}, new Set());
    const hasCsv = Object.keys(dataSources).length > 0;

    for (const rawImp of moduleImports) {
      const imp = normaliseForEach(rawImp);

      if (imp.forEach == null) {
        validateUniqueAlias(imp.as, seenAliases);
        result.push(imp);
        continue;
      }

      const elements = new Map<string, YamlImport>();
      elements.set(imp.as, imp);

      const expanded = hasCsv
        ? ForEachExpander.expandWithCsv(elements, iterationGroups, dataSources, resolver, importAdapter, MAX_IMPORT_EXPANSION)
        : ForEachExpander.expand(elements, iterationGroups, resolver, importAdapter, MAX_IMPORT_EXPANSION);

      for (const [stampedId, stampedImport] of expanded.elements) {
        const value = stampedId.substring(imp.as.length + 1);
        if (value.includes('.')) {
          throw new Error(
            `Import '${imp.as}' forEach value '${value}' contains '.', which is reserved as the ID separator.`,
          );
        }
        validateUniqueAlias(stampedId, seenAliases);
        result.push(stampedImport);
      }
    }

    return result;
  }
}

function validateUniqueAlias(alias: string, seen: Set<string>): void {
  if (seen.has(alias)) {
    throw new Error(
      `Duplicate stamped import alias '${alias}'. forEach values must be unique.`,
    );
  }
  seen.add(alias);
}
