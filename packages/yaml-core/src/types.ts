export type ParameterType = 'STRING' | 'INTEGER' | 'NUMBER' | 'BOOLEAN' | 'ARRAY' | 'OBJECT';

export type ParsedValue =
  | { type: 'string'; value: string }
  | { type: 'integer'; value: number }
  | { type: 'number'; value: number }
  | { type: 'boolean'; value: boolean }
  | { type: 'array'; value: string[] };

export function parseValue(paramType: ParameterType, raw: string): ParsedValue {
  switch (paramType) {
    case 'STRING': return { type: 'string', value: raw };
    case 'INTEGER': {
      const n = parseInt(raw, 10);
      if (isNaN(n)) throw new Error(`Cannot parse '${raw}' as INTEGER`);
      return { type: 'integer', value: n };
    }
    case 'NUMBER': {
      const n = parseFloat(raw);
      if (isNaN(n)) throw new Error(`Cannot parse '${raw}' as NUMBER`);
      return { type: 'number', value: n };
    }
    case 'BOOLEAN': {
      const lower = raw.toLowerCase();
      if (['true', 'yes', 'on', 'y', '1'].includes(lower)) return { type: 'boolean', value: true };
      if (['false', 'no', 'off', 'n', '0'].includes(lower)) return { type: 'boolean', value: false };
      throw new Error(`Cannot parse '${raw}' as BOOLEAN`);
    }
    case 'ARRAY': return { type: 'array', value: raw.split(',').map(s => s.trim()) };
    case 'OBJECT': throw new Error('Cannot parse OBJECT from a raw string');
  }
}

export function rawValue(parsed: ParsedValue): unknown {
  return parsed.value;
}

export function canAcceptType(target: ParameterType, source: ParameterType): boolean {
  if (target === source) return true;
  if (target === 'STRING' && source !== 'ARRAY' && source !== 'OBJECT') return true;
  if (target === 'NUMBER' && source === 'INTEGER') return true;
  return false;
}

export function isScalarParam(type: ParameterType): boolean {
  return type !== 'ARRAY' && type !== 'OBJECT';
}

export function parseParameterType(name: string): ParameterType {
  const upper = name.toUpperCase();
  if (upper === 'DECIMAL') return 'NUMBER';
  if (upper === 'LIST') return 'ARRAY';
  const valid: ParameterType[] = ['STRING', 'INTEGER', 'NUMBER', 'BOOLEAN', 'ARRAY', 'OBJECT'];
  if (valid.includes(upper as ParameterType)) return upper as ParameterType;
  throw new Error(`Unknown ParameterType: '${name}'`);
}

export function validateParamValue(type: ParameterType, value: unknown): boolean {
  switch (type) {
    case 'STRING': return typeof value === 'string';
    case 'INTEGER': return typeof value === 'number' && Number.isInteger(value);
    case 'NUMBER': return typeof value === 'number';
    case 'BOOLEAN': return typeof value === 'boolean';
    case 'ARRAY': return Array.isArray(value);
    case 'OBJECT': return value !== null && typeof value === 'object' && !Array.isArray(value);
  }
}

export function parseScalarParam(type: ParameterType, raw: string): unknown {
  switch (type) {
    case 'STRING': return raw;
    case 'INTEGER': {
      const n = parseInt(raw, 10);
      if (isNaN(n)) throw new Error(`Cannot parse '${raw}' as INTEGER`);
      return n;
    }
    case 'NUMBER': {
      const n = parseFloat(raw);
      if (isNaN(n)) throw new Error(`Cannot parse '${raw}' as NUMBER`);
      return n;
    }
    case 'BOOLEAN': {
      const lower = raw.toLowerCase();
      if (['true', 'yes', 'on', 'y', '1'].includes(lower)) return true;
      if (['false', 'no', 'off', 'n', '0'].includes(lower)) return false;
      throw new Error(`Cannot parse '${raw}' as BOOLEAN`);
    }
    case 'ARRAY':
    case 'OBJECT':
      throw new Error(`Cannot parse scalar default for compound type '${type}'`);
  }
}

export interface ObjectVariableSource {
  resolve(name: string): unknown;
  allowContainerReturn(): boolean;
}

export function drillOnlySource(source: ObjectVariableSource): ObjectVariableSource {
  return {
    resolve: (name: string) => source.resolve(name),
    allowContainerReturn: () => false,
  };
}

export interface YamlModuleParameter {
  type: ParameterType;
  required: boolean;
  defaultValue?: string;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  minimum?: number;
  maximum?: number;
  allowedValues?: string[];
  constraintDescription?: string;
}

export interface YamlModuleOutput {
  type: ParameterType;
  value: string;
}

export interface YamlModule {
  name: string;
  parameters: Record<string, YamlModuleParameter>;
  outputs: Record<string, YamlModuleOutput>;
  sections: Record<string, Record<string, unknown>>;
}

export interface YamlModuleHeader {
  name: string;
  parameters: Record<string, YamlModuleParameter>;
  outputs: Record<string, YamlModuleOutput>;
  extendsModule?: string;
}

export interface YamlModuleFile {
  module: YamlModuleHeader;
  sections: Record<string, Record<string, unknown>>;
  imports: YamlImport[];
}

export interface YamlImport {
  module?: string | undefined;
  actions?: string | undefined;
  steps?: string | undefined;
  as: string;
  condition?: string | undefined;
  parameters: Record<string, string>;
  forEach?: unknown;
  loop?: unknown;
}

export interface IterationGroup {
  as?: string | undefined;
  in: unknown[];
}

export type ForEachDirective =
  | { type: 'inline'; as: string; in: unknown[] }
  | { type: 'group-ref'; groupName: string; as?: string | undefined };

export type VariableSource = (key: string) => string | undefined;

export type DeferredPrefixHandler = (prefix: string, key: string, elementContext: string) => void;

export interface ExpansionDiagnostic {
  severity: 'error' | 'warning';
  message: string;
  path: string[];
  category: 'unresolved-variable' | 'invalid-parameter' | 'circular-module'
    | 'unknown-prefix' | 'expansion-error';
}

export interface ExpandResult {
  map: Record<string, unknown>;
  diagnostics: ExpansionDiagnostic[];
}

export class UnresolvedVariableError extends Error {
  constructor(
    public readonly variableName: string,
    public readonly elementContext: string,
    detail: string,
  ) {
    super(`Unresolved variable '${variableName}' in element '${elementContext}'. ${detail}`);
    this.name = 'UnresolvedVariableError';
  }
}

export function chainSources(...sources: VariableSource[]): VariableSource {
  return (name: string) => {
    for (const source of sources) {
      const value = source(name);
      if (value !== undefined) return value;
    }
    return undefined;
  };
}

export function drillFields(map: Record<string, unknown>, dotPath: string): unknown {
  let current: unknown = map;
  for (const part of dotPath.split('.')) {
    if (current !== null && typeof current === 'object' && !Array.isArray(current)) {
      current = (current as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }
  return current;
}

export function nestedSource(data: Record<string, Record<string, unknown>>): VariableSource {
  return (name: string) => {
    const dot = name.indexOf('.');
    const key = dot >= 0 ? name.substring(0, dot) : name;
    const entry = data[key];
    if (entry === undefined) return undefined;
    if (dot < 0) return String(entry);
    const value = drillFields(entry, name.substring(dot + 1));
    return value !== undefined ? String(value) : undefined;
  };
}

export function forEachContextSource(
  simple: Record<string, string> | null,
  rows: Record<string, Record<string, unknown>> | null,
): VariableSource {
  return (name: string) => {
    const dot = name.indexOf('.');
    if (dot >= 0 && rows) {
      const rowName = name.substring(0, dot);
      const row = rows[rowName];
      if (row) {
        const fieldPath = name.substring(dot + 1);
        const value = drillFields(row, fieldPath);
        if (value !== undefined) return String(value);
        throw new Error(
          `Field '${fieldPath}' not found in '${rowName}'. Available: ${Object.keys(row).join(', ')}`,
        );
      }
    }
    if (simple) {
      const value = simple[name];
      if (value !== undefined) return value;
    }
    if (rows && rows[name] !== undefined) {
      throw new Error(
        `'${name}' is a row — use field access like \${each.${name}.fieldName}. Available: ${Object.keys(rows[name]!).join(', ')}`,
      );
    }
    return undefined;
  };
}

export function parseForEachDirective(raw: unknown): ForEachDirective | null {
  if (raw == null) return null;
  if (typeof raw === 'string') return { type: 'group-ref', groupName: raw };
  if (typeof raw === 'object' && !Array.isArray(raw)) {
    const m = raw as Record<string, unknown>;
    const as = m['as'] as string | undefined;
    const inVal = m['in'];
    if (Array.isArray(inVal)) {
      if (!as) throw new Error("Inline forEach 'as' variable name is required");
      return { type: 'inline', as, in: inVal };
    }
    if (typeof inVal === 'string') return { type: 'group-ref', groupName: inVal, as };
    if (as) return { type: 'group-ref', groupName: as };
  }
  throw new Error(
    `Invalid forEach value: expected string, {as, in} map, or ForEachDirective — got ${typeof raw}`,
  );
}
