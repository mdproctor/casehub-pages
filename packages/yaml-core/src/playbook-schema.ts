export interface PlaybookSchemaDescriptor {
  name: string;
  baseSchema: string | null;
  capabilities: Set<string>;
}

export const PLAYBOOK_CAPABILITIES = {
  // Shared
  STEPS: 'steps',
  VARIABLE_RESOLUTION: 'variable-resolution',
  DECORATORS: 'decorators',
  CONTROL_FLOW: 'control-flow',
  MODULES: 'modules',
  CONCURRENCY: 'concurrency',
  STATE_MACHINE: 'state-machine',

  // Client-only
  CHAPTERS: 'chapters',
  SECTIONS: 'sections',
  ARIA: 'aria',
  SPOTLIGHT: 'spotlight',
  TUTORIALS: 'tutorials',

  // Server-only
  ORCHESTRATION: 'orchestration',
  CORRELATION: 'correlation',
  MCP_INVOKE: 'mcp-invoke',
  GRAPHQL_INVOKE: 'graphql-invoke',
  CODEGEN: 'codegen',
} as const;

const SHARED_CAPABILITIES = new Set([
  PLAYBOOK_CAPABILITIES.STEPS,
  PLAYBOOK_CAPABILITIES.VARIABLE_RESOLUTION,
  PLAYBOOK_CAPABILITIES.DECORATORS,
  PLAYBOOK_CAPABILITIES.CONTROL_FLOW,
  PLAYBOOK_CAPABILITIES.MODULES,
  PLAYBOOK_CAPABILITIES.CONCURRENCY,
  PLAYBOOK_CAPABILITIES.STATE_MACHINE,
]);

function builtIn(name: string, extra: string[]): PlaybookSchemaDescriptor {
  const capabilities = new Set(SHARED_CAPABILITIES);
  for (const cap of extra) capabilities.add(cap);
  return { name, baseSchema: null, capabilities };
}

export function domainSchema(
  name: string,
  baseSchema: string,
  capabilities: string[],
): PlaybookSchemaDescriptor {
  return { name, baseSchema, capabilities: new Set(capabilities) };
}

export interface PlaybookSchemaRegistry {
  register(descriptor: PlaybookSchemaDescriptor): void;
  resolve(schemaName: string): PlaybookSchemaDescriptor | null;
  all(): PlaybookSchemaDescriptor[];
  isKnown(schemaName: string): boolean;
}

export function createPlaybookSchemaRegistry(): PlaybookSchemaRegistry {
  const schemas = new Map<string, PlaybookSchemaDescriptor>();

  schemas.set(
    'client',
    builtIn('client', [
      PLAYBOOK_CAPABILITIES.CHAPTERS,
      PLAYBOOK_CAPABILITIES.SECTIONS,
      PLAYBOOK_CAPABILITIES.ARIA,
      PLAYBOOK_CAPABILITIES.SPOTLIGHT,
      PLAYBOOK_CAPABILITIES.TUTORIALS,
    ]),
  );

  schemas.set(
    'server',
    builtIn('server', [
      PLAYBOOK_CAPABILITIES.ORCHESTRATION,
      PLAYBOOK_CAPABILITIES.CORRELATION,
      PLAYBOOK_CAPABILITIES.MCP_INVOKE,
      PLAYBOOK_CAPABILITIES.GRAPHQL_INVOKE,
      PLAYBOOK_CAPABILITIES.CODEGEN,
    ]),
  );

  return {
    register(descriptor: PlaybookSchemaDescriptor): void {
      schemas.set(descriptor.name, descriptor);
    },
    resolve(schemaName: string): PlaybookSchemaDescriptor | null {
      return schemas.get(schemaName) ?? null;
    },
    all(): PlaybookSchemaDescriptor[] {
      return [...schemas.values()];
    },
    isKnown(schemaName: string): boolean {
      return schemas.has(schemaName);
    },
  };
}
