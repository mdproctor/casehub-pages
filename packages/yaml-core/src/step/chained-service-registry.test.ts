import { describe, it, expect } from 'vitest';
import { MapServiceRegistry } from './walker.js';
import { ChainedServiceRegistry } from './chained-service-registry.js';

describe('ChainedServiceRegistry', () => {
  it('looks up from local registry first', () => {
    const parent = new MapServiceRegistry().register({ name: 'Foo' }, 'parent-foo');
    const local = new MapServiceRegistry().register({ name: 'Foo' }, 'local-foo');
    const chained = new ChainedServiceRegistry(local, parent);

    expect(chained.lookup({ name: 'Foo' })).toBe('local-foo');
  });

  it('delegates to parent when local does not have service', () => {
    const parent = new MapServiceRegistry().register({ name: 'Bar' }, 'parent-bar');
    const local = new MapServiceRegistry();
    const chained = new ChainedServiceRegistry(local, parent);

    expect(chained.lookup({ name: 'Bar' })).toBe('parent-bar');
  });

  it('throws when neither local nor parent has service', () => {
    const parent = new MapServiceRegistry();
    const local = new MapServiceRegistry();
    const chained = new ChainedServiceRegistry(local, parent);

    expect(() => chained.lookup({ name: 'Missing' })).toThrow("Service 'Missing' not found");
  });
});
