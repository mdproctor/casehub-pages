import type { WorkStencilDescriptor, WorkStencilCategory } from './types.js';

export class WorkRegistry {
  private readonly stencils = new Map<string, WorkStencilDescriptor>();

  async loadFromUrl(url: string): Promise<void> {
    // TODO: fetch and parse marketplace YAML
  }

  get(name: string): WorkStencilDescriptor | undefined {
    return this.stencils.get(name);
  }

  getCategories(): WorkStencilCategory[] {
    // TODO: group by category
    return [];
  }
}
