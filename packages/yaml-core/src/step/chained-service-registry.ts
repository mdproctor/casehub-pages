import type { ServiceRegistry } from './walker.js';

export class ChainedServiceRegistry implements ServiceRegistry {
  constructor(
    private readonly local: ServiceRegistry,
    private readonly parent: ServiceRegistry,
  ) {}

  lookup<T>(type: { readonly name: string }): T {
    try {
      return this.local.lookup(type);
    } catch {
      return this.parent.lookup(type);
    }
  }
}
