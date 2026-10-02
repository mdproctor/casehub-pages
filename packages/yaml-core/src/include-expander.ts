import { VariableResolver } from './variable-resolver.js';
import { ParameterValidator } from './parameter-validator.js';
import { isTruthy } from './truthiness.js';
import type { ParameterType, YamlModuleParameter } from './types.js';

export type TemplateLoader = (path: string) => Promise<Record<string, unknown>>;

export interface IncludeDirective {
  file: string;
  params?: Record<string, unknown>;
}

interface RawParamDescriptor {
  name: string;
  type?: string;
  required?: boolean;
  default?: unknown;
  enum?: unknown[];
}

function toModuleParams(
  raw: RawParamDescriptor[],
): Record<string, YamlModuleParameter> {
  const result: Record<string, YamlModuleParameter> = {};
  for (const p of raw) {
    const type = (p.type ?? 'string').toUpperCase() as ParameterType;
    result[p.name] = {
      type,
      required: p.required ?? false,
      defaultValue: p.default !== undefined ? String(p.default) : undefined,
      allowedValues: p.enum?.map(String),
    };
  }
  return result;
}

function toStringParams(
  params: Record<string, unknown> | undefined,
): Record<string, string> {
  if (!params) return {};
  const result: Record<string, string> = {};
  for (const [k, v] of Object.entries(params)) {
    result[k] = String(v);
  }
  return result;
}

function filterByWhen(
  steps: Record<string, unknown>[],
): Record<string, unknown>[] {
  return steps.filter(step => {
    const when = step['when'];
    if (when === undefined || when === null) return true;
    if (typeof when === 'boolean') return when;
    if (typeof when === 'string') {
      if (when === '') return false;
      try { return isTruthy(when); } catch { return true; }
    }
    return true;
  });
}

export class IncludeExpander {

  static async expand(
    parsed: Record<string, unknown>,
    loader: TemplateLoader,
    ancestors?: Set<string>,
  ): Promise<Record<string, unknown>> {
    const ancestorSet = ancestors ?? new Set<string>();
    const result = { ...parsed };

    if (Array.isArray(result['includes'])) {
      const includes = result['includes'] as IncludeDirective[];
      const expandedSteps = await IncludeExpander.expandIncludes(
        includes, loader, ancestorSet,
      );
      const existingSteps = Array.isArray(result['steps'])
        ? (result['steps'] as Record<string, unknown>[])
        : [];
      result['steps'] = [...expandedSteps, ...existingSteps];
      delete result['includes'];
    }

    if (Array.isArray(result['sections'])) {
      result['sections'] = await Promise.all(
        (result['sections'] as Record<string, unknown>[]).map(
          async (section) => {
            if (!Array.isArray(section['includes'])) return section;
            const sectionResult = { ...section };
            const includes = sectionResult['includes'] as IncludeDirective[];
            const expandedSteps = await IncludeExpander.expandIncludes(
              includes, loader, ancestorSet,
            );
            const existingSteps = Array.isArray(sectionResult['steps'])
              ? (sectionResult['steps'] as Record<string, unknown>[])
              : [];
            sectionResult['steps'] = [...expandedSteps, ...existingSteps];
            delete sectionResult['includes'];
            return sectionResult;
          },
        ),
      );
    }

    return result;
  }

  private static async expandIncludes(
    includes: IncludeDirective[],
    loader: TemplateLoader,
    ancestors: Set<string>,
  ): Promise<Record<string, unknown>[]> {
    const allSteps: Record<string, unknown>[] = [];

    for (const include of includes) {
      if (ancestors.has(include.file)) {
        const cycle = [...ancestors, include.file].join(' → ');
        throw new Error(`Circular include detected: ${cycle}`);
      }

      const template = await loader(include.file);

      const declaredRaw = Array.isArray(template['params'])
        ? (template['params'] as RawParamDescriptor[])
        : [];
      const declared = toModuleParams(declaredRaw);
      const provided = toStringParams(include.params);

      const violations = ParameterValidator.validate(declared, provided);
      const errors = violations.filter(v => v.constraint !== 'unknown');
      if (errors.length > 0) {
        const msgs = errors.map(v => v.message).join('; ');
        throw new Error(`Include '${include.file}': ${msgs}`);
      }

      // For optional params with no default that aren't provided,
      // set empty string so ${params.x} resolves to "" (falsy for when:)
      const effectiveDeclared = { ...declared };
      for (const [name, param] of Object.entries(effectiveDeclared)) {
        if (!param.required && param.defaultValue === undefined
            && !(name in provided)) {
          effectiveDeclared[name] = { ...param, defaultValue: '' };
        }
      }

      const resolver = VariableResolver.forParams(
        effectiveDeclared, provided, new Set<string>(),
      );

      const rawSteps = Array.isArray(template['steps'])
        ? (template['steps'] as Record<string, unknown>[])
        : [];

      const resolved = rawSteps.map(step =>
        resolver.resolveMap(step, 'include-step'),
      );
      const filtered = filterByWhen(resolved);

      // Resolve params in nested include directives before recursing
      let resolvedTemplate = template;
      if (Array.isArray(template['includes'])) {
        const nestedIncludes = (template['includes'] as IncludeDirective[]).map(
          nested => {
            if (!nested.params) return nested;
            const resolvedParams: Record<string, unknown> = {};
            for (const [k, v] of Object.entries(nested.params)) {
              if (typeof v === 'string' && v.includes('${')) {
                resolvedParams[k] = resolver.resolveString(v, 'include-params');
              } else {
                resolvedParams[k] = v;
              }
            }
            return { ...nested, params: resolvedParams };
          },
        );
        resolvedTemplate = { ...template, includes: nestedIncludes };
      }

      if (Array.isArray(resolvedTemplate['includes'])) {
        const nestedAncestors = new Set(ancestors);
        nestedAncestors.add(include.file);
        const nested: Record<string, unknown> = {
          ...resolvedTemplate,
          steps: filtered,
        };
        const expanded = await IncludeExpander.expand(
          nested, loader, nestedAncestors,
        );
        allSteps.push(
          ...(expanded['steps'] as Record<string, unknown>[]),
        );
      } else {
        allSteps.push(...filtered);
      }
    }

    return allSteps;
  }
}
