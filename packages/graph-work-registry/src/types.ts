import type { JSONSchema7Compatible } from '@casehubio/graph-core';

export interface WorkStencilDescriptor {
  name: string;
  displayName: string;
  category: string;
  icon: string;
  async: boolean;
  properties: JSONSchema7Compatible;
  input: JSONSchema7Compatible;
  output: JSONSchema7Compatible;
}

export interface WorkStencilCategory {
  name: string;
  displayName: string;
  stencils: WorkStencilDescriptor[];
}
