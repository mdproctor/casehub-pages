import { autocompletion, type CompletionContext, type CompletionResult } from '@codemirror/autocomplete';
import { type Extension } from '@codemirror/state';
import { z } from 'zod';

interface CompletionEntry {
  label: string;
  detail?: string;
  type: 'property' | 'enum';
  apply?: string;
}

export interface YamlContext {
  path: string[];
  siblings: Record<string, string>;
}

function getIndentLevel(line: string): number {
  const match = line.match(/^(\s*)/);
  return match?.[1]?.length ?? 0;
}

function extractKeyValue(line: string): { key: string; value: string } | null {
  const trimmed = line.trim().replace(/^-\s*/, '');
  const match = trimmed.match(/^(\w[\w-]*):\s*(.*)/);
  if (!match) return null;
  return { key: match[1]!, value: (match[2] ?? '').trim() };
}

function effectiveIndent(line: string): number {
  const base = getIndentLevel(line);
  if (line.substring(base).startsWith('- ')) {
    return base + 2;
  }
  return base;
}

export function buildYamlContext(doc: string, pos: number): YamlContext {
  const lines = doc.substring(0, pos).split('\n');
  const currentLine = lines[lines.length - 1] ?? '';
  const currentEI = effectiveIndent(currentLine);
  const path: string[] = [];
  const siblings: Record<string, string> = {};
  let targetEI = currentEI;

  for (let i = lines.length - 2; i >= 0; i--) {
    const rawLine = lines[i] ?? '';
    if (rawLine.trim() === '') continue;
    const lineEI = effectiveIndent(rawLine);

    if (lineEI === currentEI || lineEI === targetEI) {
      const kv = extractKeyValue(rawLine);
      if (kv && !(kv.key in siblings)) {
        siblings[kv.key] = kv.value;
      }
    }

    if (lineEI < targetEI) {
      const kv = extractKeyValue(rawLine);
      if (kv) {
        path.unshift(kv.key);
        targetEI = lineEI;
      }
      if (lineEI === 0) break;
    }
  }
  return { path, siblings };
}

function typeName(schema: z.ZodType): string {
  return (schema._def as Record<string, unknown>).typeName as string ?? '';
}

function getShape(schema: z.ZodType): Record<string, z.ZodType> | null {
  const def = schema._def as Record<string, unknown>;
  if (typeof def.shape === 'function') return (def.shape as () => Record<string, z.ZodType>)();
  if (typeof def.shape === 'object' && def.shape) return def.shape as Record<string, z.ZodType>;
  return null;
}

function unwrap(schema: z.ZodType): z.ZodType {
  const tn = typeName(schema);
  if (tn === 'ZodOptional' || tn === 'ZodDefault' || tn === 'ZodNullable') {
    return unwrap((schema._def as { innerType: z.ZodType }).innerType);
  }
  if (tn === 'ZodLazy') {
    return unwrap((schema._def as { getter: () => z.ZodType }).getter());
  }
  return schema;
}

function navigateObjectKey(shape: Record<string, z.ZodType>, key: string): z.ZodType | null {
  if (!(key in shape)) return null;
  let field = unwrap(shape[key] as z.ZodType);
  if (typeName(field) === 'ZodArray') {
    field = unwrap((field._def as { type: z.ZodType }).type);
  }
  return field;
}

export function navigateSchema(
  schema: z.ZodType,
  path: string[],
  siblings?: Record<string, string>,
): z.ZodType | null {
  let current = unwrap(schema);

  for (let pi = 0; pi < path.length; pi++) {
    const key = path[pi]!;
    current = unwrap(current);

    const tn = typeName(current);
    if (tn === 'ZodObject') {
      const shape = getShape(current);
      if (!shape) return null;
      const result = navigateObjectKey(shape, key);
      if (!result) return null;
      current = result;
    } else if (tn === 'ZodArray') {
      current = unwrap((current._def as { type: z.ZodType }).type);
      const innerShape = getShape(current);
      if (!innerShape) return null;
      const result = navigateObjectKey(innerShape, key);
      if (!result) return null;
      current = result;
    } else if (tn === 'ZodDiscriminatedUnion') {
      const def = current._def as { discriminator: string; optionsMap: Map<string, z.ZodType> };
      if (key === def.discriminator) {
        const literals = [...def.optionsMap.keys()];
        return z.enum(literals as [string, ...string[]]);
      }
      const typeValue = siblings?.[def.discriminator];
      if (!typeValue) return null;
      const branch = def.optionsMap.get(typeValue);
      if (!branch) return null;
      const branchObj = unwrap(branch);
      const branchShape = getShape(branchObj);
      if (!branchShape) return null;
      const result = navigateObjectKey(branchShape, key);
      if (!result) return null;
      current = result;
    } else if (tn === 'ZodUnion') {
      let found: z.ZodType | null = null;
      for (const option of (current._def as { options: z.ZodType[] }).options) {
        const result = navigateSchema(option, [key], siblings);
        if (result) { found = result; break; }
      }
      if (!found) return null;
      current = found;
    } else if (tn === 'ZodIntersection') {
      const def = current._def as { left: z.ZodType; right: z.ZodType };
      const left = navigateSchema(def.left, [key], siblings);
      if (left) { current = left; continue; }
      const right = navigateSchema(def.right, [key], siblings);
      if (right) { current = right; continue; }
      return null;
    } else {
      return null;
    }
  }
  return current;
}

function describeType(schema: z.ZodType): string | undefined {
  const tn = typeName(schema);
  if (tn === 'ZodString') return 'string';
  if (tn === 'ZodNumber') return 'number';
  if (tn === 'ZodBoolean') return 'boolean';
  if (tn === 'ZodEnum') return ((schema._def as { values: string[] }).values).join(' | ');
  if (tn === 'ZodArray') return 'array';
  if (tn === 'ZodObject') return 'object';
  if (tn === 'ZodRecord') return 'record';
  return undefined;
}

export function schemaToCompletions(schema: z.ZodType): CompletionEntry[] {
  const unwrapped = unwrap(schema);

  const tn = typeName(unwrapped);

  if (tn === 'ZodObject') {
    const shape = getShape(unwrapped);
    if (!shape) return [];
    return Object.entries(shape).map(([key, fieldSchema]) => {
      const detail = fieldSchema.description ?? describeType(unwrap(fieldSchema));
      return {
        label: key,
        ...(detail ? { detail } : {}),
        type: 'property' as const,
        apply: key + ': ',
      };
    });
  }

  if (tn === 'ZodEnum') {
    return ((unwrapped._def as { values: string[] }).values).map(v => ({
      label: v,
      type: 'enum' as const,
    }));
  }

  if (tn === 'ZodNativeEnum') {
    const values = Object.values((unwrapped._def as { values: Record<string, string | number> }).values)
      .filter((v): v is string => typeof v === 'string');
    return values.map(v => ({
      label: v,
      type: 'enum' as const,
    }));
  }

  if (tn === 'ZodLiteral') {
    return [{
      label: String((unwrapped._def as { value: unknown }).value),
      type: 'enum' as const,
    }];
  }

  if (tn === 'ZodBoolean') {
    return [
      { label: 'true', type: 'enum' as const },
      { label: 'false', type: 'enum' as const },
    ];
  }

  if (tn === 'ZodDiscriminatedUnion') {
    const def = unwrapped._def as { discriminator: string; optionsMap: Map<string, z.ZodType> };
    const typeValues = [...def.optionsMap.keys()];
    const firstBranch = def.optionsMap.values().next().value;
    const branchCompletions = firstBranch ? schemaToCompletions(firstBranch) : [];
    const commonKeys = branchCompletions.filter(c => c.label !== def.discriminator);
    return [
      { label: def.discriminator, detail: typeValues.join(' | '), type: 'property' as const, apply: def.discriminator + ': ' },
      ...commonKeys,
    ];
  }

  if (tn === 'ZodUnion') {
    const allCompletions: CompletionEntry[] = [];
    for (const option of (unwrapped._def as { options: z.ZodType[] }).options) {
      allCompletions.push(...schemaToCompletions(option));
    }
    const seen = new Set<string>();
    return allCompletions.filter(c => {
      if (seen.has(c.label)) return false;
      seen.add(c.label);
      return true;
    });
  }

  if (tn === 'ZodIntersection') {
    const def = unwrapped._def as { left: z.ZodType; right: z.ZodType };
    const left = schemaToCompletions(def.left);
    const right = schemaToCompletions(def.right);
    const seen = new Set(left.map(c => c.label));
    return [...left, ...right.filter(c => !seen.has(c.label))];
  }

  return [];
}

function schemaCompletionSource(
  schema: z.ZodType,
): (context: CompletionContext) => CompletionResult | null {
  return (context: CompletionContext) => {
    const line = context.state.doc.lineAt(context.pos);
    const textBefore = line.text.substring(0, context.pos - line.from);
    const doc = context.state.doc.toString();
    const yamlCtx = buildYamlContext(doc, context.pos);

    const afterValueColon = textBefore.match(/(?:^|\s)-?\s*(\w[\w-]*):\s*(\S*)$/);
    if (afterValueColon) {
      const key = afterValueColon[1] ?? '';
      const prefix = afterValueColon[2] ?? '';
      const resolved = navigateSchema(schema, [...yamlCtx.path, key], yamlCtx.siblings);
      if (resolved) {
        const completions = schemaToCompletions(resolved);
        if (completions.length > 0 && completions[0]?.type === 'enum') {
          return {
            from: context.pos - prefix.length,
            options: completions.map(c => ({ ...c, type: 'enum' as const })),
          };
        }
      }
      return null;
    }

    const keyMatch = textBefore.match(/(?:^|\s)-?\s*(\w[\w-]*)$/);
    const resolved = navigateSchema(schema, yamlCtx.path, yamlCtx.siblings);
    if (!resolved) return null;
    const completions = schemaToCompletions(resolved);
    if (completions.length === 0) return null;

    if (keyMatch) {
      const prefix = keyMatch[1] ?? '';
      if (!prefix && !context.explicit) return null;
      return {
        from: context.pos - prefix.length,
        options: completions.map(c => ({
          label: c.label,
          ...(c.detail ? { detail: c.detail } : {}),
          type: c.type,
          ...(c.apply ? { apply: c.apply } : {}),
        })),
      };
    }

    const emptyMatch = textBefore.match(/(?:^|\s)-?\s*$/);
    if (emptyMatch && context.explicit) {
      return {
        from: context.pos,
        options: completions.map(c => ({
          label: c.label,
          ...(c.detail ? { detail: c.detail } : {}),
          type: c.type,
          ...(c.apply ? { apply: c.apply } : {}),
        })),
      };
    }

    return null;
  };
}

export function createSchemaCompletion(schema: z.ZodType): Extension {
  return autocompletion({
    override: [schemaCompletionSource(schema)],
    activateOnTyping: true,
  });
}
