import { describe, it, expect } from 'vitest';
import {
  createPlaybookSchemaRegistry,
  domainSchema,
  PLAYBOOK_CAPABILITIES,
} from './playbook-schema.js';

describe('PlaybookSchemaRegistry', () => {
  it('has client and server built-in', () => {
    const registry = createPlaybookSchemaRegistry();
    expect(registry.isKnown('client')).toBe(true);
    expect(registry.isKnown('server')).toBe(true);
  });

  it('client has client-specific capabilities', () => {
    const registry = createPlaybookSchemaRegistry();
    const client = registry.resolve('client')!;

    expect(client.capabilities.has(PLAYBOOK_CAPABILITIES.STEPS)).toBe(true);
    expect(client.capabilities.has(PLAYBOOK_CAPABILITIES.ARIA)).toBe(true);
    expect(client.capabilities.has(PLAYBOOK_CAPABILITIES.CHAPTERS)).toBe(true);
    expect(client.capabilities.has(PLAYBOOK_CAPABILITIES.ORCHESTRATION)).toBe(false);
    expect(client.baseSchema).toBeNull();
  });

  it('server has server-specific capabilities', () => {
    const registry = createPlaybookSchemaRegistry();
    const server = registry.resolve('server')!;

    expect(server.capabilities.has(PLAYBOOK_CAPABILITIES.STEPS)).toBe(true);
    expect(server.capabilities.has(PLAYBOOK_CAPABILITIES.ORCHESTRATION)).toBe(true);
    expect(server.capabilities.has(PLAYBOOK_CAPABILITIES.CORRELATION)).toBe(true);
    expect(server.capabilities.has(PLAYBOOK_CAPABILITIES.ARIA)).toBe(false);
    expect(server.baseSchema).toBeNull();
  });

  it('registers domain schema', () => {
    const registry = createPlaybookSchemaRegistry();
    registry.register(domainSchema('clinical-server', 'server', ['clinical-trial']));

    const clinical = registry.resolve('clinical-server')!;
    expect(clinical.baseSchema).toBe('server');
    expect(clinical.capabilities.has('clinical-trial')).toBe(true);
  });

  it('unknown schema returns null', () => {
    const registry = createPlaybookSchemaRegistry();
    expect(registry.resolve('nonexistent')).toBeNull();
  });

  it('all() returns all registered', () => {
    const registry = createPlaybookSchemaRegistry();
    expect(registry.all()).toHaveLength(2);

    registry.register(domainSchema('aml-server', 'server', []));
    expect(registry.all()).toHaveLength(3);
  });
});
