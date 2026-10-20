import type { ParameterType } from '../types.js';
import type { Portability } from './portability.js';

export interface Parameter {
  type: ParameterType;
  required: boolean;
  defaultValue?: string;
  allowedValues?: string[];
  format?: string;
  description?: string;
}

export type InvokeBinding =
  | McpBinding
  | RestBinding
  | GraphqlBinding
  | ScriptBinding
  | AgentBinding
  | ProcessBinding
  | AriaBinding
  | GraphqlDomainBinding
  | SimulatedBinding
  | ElementMethodBinding;

export interface McpBinding {
  kind: 'mcp';
  tool: string;
}

export interface RestBinding {
  kind: 'rest';
  method: string;
  url: string;
  headers: Record<string, string>;
  body: Record<string, string>;
}

export interface GraphqlBinding {
  kind: 'graphql';
  query: string;
}

export interface ScriptBinding {
  kind: 'script';
  runtime: string;
  script: string;
  timeout: string;
  workingDir?: string;
  env: Record<string, string>;
}

export interface AgentBinding {
  kind: 'agent';
  descriptor: string;
  model?: string;
  timeout?: string;
  structuredOutput: boolean;
}

export interface ProcessBinding {
  kind: 'process';
  command: string;
  args: string[];
  output: string;
  timeout?: string;
  env: Record<string, string>;
  workingDir?: string;
  onError: string;
}

export interface ElementMethodBinding {
  kind: 'element-method';
  method: string;
}

export interface Definition {
  name: string;
  description?: string;
  inputs: Record<string, Parameter>;
  outputs: Record<string, Parameter>;
  invoke?: InvokeBinding;
  portability?: Portability;
}

export interface DefinitionFile {
  namespace?: string;
  actions: Record<string, Definition>;
}

export interface AriaBinding {
  kind: 'aria';
  action: string;
}

export interface GraphqlDomainBinding {
  kind: 'graphql-domain';
}

export interface SimulatedBinding {
  kind: 'simulated';
}

export const CE_NAMED_FIELDS = new Set([
  'type', 'data', 'source', 'id', 'specversion',
  'time', 'subject', 'datacontenttype',
]);

export interface CloudEventSpec {
  readonly type: string;
  readonly data: Record<string, unknown>;
  readonly source?: string;
  readonly id?: string;
  readonly specversion?: string;
  readonly time?: string;
  readonly subject?: string;
  readonly datacontenttype?: string;
  readonly [extensionKey: string]: unknown;
}

export const RUNTIME_PYTHON = 'python3';
export const RUNTIME_NODE = 'node';
