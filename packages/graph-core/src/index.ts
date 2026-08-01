// Graph model
export interface GraphNode {
  id: string;
  type: string;           // stencil type key
  label: string;
  parentId?: string;      // containment
  properties: Record<string, unknown>;
  position?: { x: number; y: number };  // set by layout engine
}

export interface GraphEdge {
  id: string;
  type: string;           // edge type key
  source: string;         // node id
  target: string;         // node id
  label?: string;
  properties?: Record<string, unknown>;
}

export interface GraphModel {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

// Stencil grammar — structural rules
export interface StencilGrammar {
  type: string;
  label: string;
  icon: string;
  containment: {
    canContain: string[];
    canBeContainedBy: string[];
  };
  connections: {
    inbound: { min: number; max: number; allowedFrom: string[] };
    outbound: { min: number; max: number; allowedTo: string[] };
  };
}

// Stencil descriptor — grammar + rendering metadata
export interface StencilDescriptor {
  grammar: StencilGrammar;
  properties: JSONSchema7Compatible;
}

// JSON Schema compatible type (avoid importing json-schema package for now)
export interface JSONSchema7Compatible {
  type?: string;
  properties?: Record<string, JSONSchema7Compatible>;
  required?: string[];
  items?: JSONSchema7Compatible;
  oneOf?: JSONSchema7Compatible[];
  anyOf?: JSONSchema7Compatible[];
  enum?: unknown[];
  description?: string;
  default?: unknown;
  [key: string]: unknown;
}

// Persistence SPI
export type PersistenceResult =
  | { status: 'ok'; content: string; version: string }
  | { status: 'not_found' }
  | { status: 'parse_error'; message: string }
  | { status: 'conflict'; currentVersion: string };

export interface PersistenceBackend {
  read(uri: string): Promise<PersistenceResult>;
  write(uri: string, content: string, expectedVersion: string): Promise<
    | { status: 'ok'; version: string }
    | { status: 'conflict'; currentVersion: string }
  >;
}

// Runtime overlay
export interface NodeDecoration {
  nodeId: string;
  badge?: { icon: string; color: string; pulse?: boolean };
  heatmapIntensity?: number;  // 0-1
  highlight?: boolean;
}

export interface RuntimeState {
  decorations: NodeDecoration[];
}

// Domain adapter contract
export interface DomainAdapter<T = unknown> {
  toGraph(source: T): GraphModel;
  applyEdit(model: T, edit: GraphEdit): T;
}

// Edit operations
export type GraphEdit =
  | { type: 'add-node'; parentId?: string; nodeType: string; properties: Record<string, unknown> }
  | { type: 'remove-node'; nodeId: string }
  | { type: 'replace-node'; nodeId: string; newType: string; properties: Record<string, unknown> }
  | { type: 'update-properties'; nodeId: string; properties: Record<string, unknown> }
  | { type: 'add-edge'; edgeType: string; source: string; target: string }
  | { type: 'remove-edge'; edgeId: string };

// Stencil registry
export interface StencilRegistry {
  register(descriptor: StencilDescriptor): void;
  get(type: string): StencilDescriptor | undefined;
  getAll(): StencilDescriptor[];
  validate(model: GraphModel): ValidationResult[];
}

export interface ValidationResult {
  nodeId?: string;
  edgeId?: string;
  rule: string;
  message: string;
  severity: 'error' | 'warning';
}
