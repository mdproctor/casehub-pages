import { describe, it, expect } from 'vitest';
import { ForEachExpander } from './foreach-expander.js';
import type { ForEachAdapter, Reference } from './foreach-expander.js';
import type { ForEachDirective } from './types.js';
import { parseForEachDirective } from './types.js';
import { VariableResolver } from './variable-resolver.js';
import { CsvParser } from './csv-parser.js';

interface TestElement {
  id: string;
  spec: Record<string, unknown>;
  'for-each': ForEachDirective | null;
  condition: string | null;
}

const testAdapter: ForEachAdapter<TestElement> = {
  stamp(template, stampedId, scopedResolver) {
    const resolvedSpec = scopedResolver.resolveMap(template.spec, stampedId);
    return { id: stampedId, spec: resolvedSpec, 'for-each': null, condition: null };
  },
  getForEach(element) { return element['for-each']; },
  getCondition(element) { return element.condition; },
  getReferences() { return []; },
  withReferences(element) { return element; },
};

const resolver = new VariableResolver({}, new Set());

describe('ForEachExpander — inline for-each', () => {
  it('stamps three copies', () => {
    const elements = new Map<string, TestElement>();
    elements.set('regional-source', {
      id: 'regional-source',
      spec: { name: 'customers-${each.region}', uri: 's3://${each.region}/data.csv' },
      'for-each': { type: 'inline', as: 'region', in: ['us-east', 'eu-west', 'ap-south'] },
      condition: null,
    });

    const result = ForEachExpander.expand(elements, {}, resolver, testAdapter, 1000);

    expect(result.elements.size).toBe(3);
    expect([...result.elements.keys()]).toEqual([
      'regional-source.us-east', 'regional-source.eu-west', 'regional-source.ap-south',
    ]);
    const usEast = result.elements.get('regional-source.us-east')!;
    expect(usEast.spec).toEqual({ name: 'customers-us-east', uri: 's3://us-east/data.csv' });
  });

  it('resolves variables in iteration values', () => {
    const varResolver = new VariableResolver(
      { var: (name) => name === 'suffix' ? 'prod' : undefined }, new Set());
    const elements = new Map<string, TestElement>();
    elements.set('node', {
      id: 'node',
      spec: { name: '${each.env}' },
      'for-each': { type: 'inline', as: 'env', in: ['${var.suffix}'] },
      condition: null,
    });

    const result = ForEachExpander.expand(elements, {}, varResolver, testAdapter, 1000);

    expect(result.elements.size).toBe(1);
    expect(result.elements.get('node.prod')!.spec).toEqual({ name: 'prod' });
  });

  it('zero values produces empty', () => {
    const elements = new Map<string, TestElement>();
    elements.set('template', {
      id: 'template', spec: { name: 'x' },
      'for-each': { type: 'inline', as: 'idx', in: [] }, condition: null,
    });

    const result = ForEachExpander.expand(elements, {}, resolver, testAdapter, 1000);
    expect(result.elements.size).toBe(0);
  });

  it('duplicate values throws', () => {
    const elements = new Map<string, TestElement>();
    elements.set('node', {
      id: 'node', spec: { name: '${each.x}' },
      'for-each': { type: 'inline', as: 'x', in: ['same', 'same'] }, condition: null,
    });

    expect(() => ForEachExpander.expand(elements, {}, resolver, testAdapter, 1000))
      .toThrow('Duplicate stamped ID');
  });
});

describe('ForEachExpander — named groups', () => {
  it('stamps from shared iteration group', () => {
    const groups = { regional: { as: 'region', in: ['us-east', 'eu-west'] } };
    const elements = new Map<string, TestElement>();
    elements.set('regional-source', {
      id: 'regional-source', spec: { name: '${each.region}' },
      'for-each': { type: 'group-ref', groupName: 'regional' }, condition: null,
    });

    const result = ForEachExpander.expand(elements, groups, resolver, testAdapter, 1000);

    expect(result.elements.size).toBe(2);
    expect([...result.elements.keys()]).toEqual([
      'regional-source.us-east', 'regional-source.eu-west',
    ]);
  });

  it('two for-each same group expand independently', () => {
    const groups = { regional: { as: 'region', in: ['us-east', 'eu-west'] } };
    const elements = new Map<string, TestElement>();
    elements.set('source', {
      id: 'source', spec: { name: '${each.region}' },
      'for-each': { type: 'group-ref', groupName: 'regional' }, condition: null,
    });
    elements.set('ingest', {
      id: 'ingest', spec: { name: '${each.region}-ingest' },
      'for-each': { type: 'group-ref', groupName: 'regional' }, condition: null,
    });

    const result = ForEachExpander.expand(elements, groups, resolver, testAdapter, 1000);

    expect(result.elements.size).toBe(4);
    expect([...result.elements.keys()]).toEqual([
      'source.us-east', 'source.eu-west', 'ingest.us-east', 'ingest.eu-west',
    ]);
  });

  it('groupRef as override used instead of group as', () => {
    const groups = { 'team-members': { as: 'tm', in: ['Alice', 'Bob'] } };
    const elements = new Map<string, TestElement>();
    elements.set('step', {
      id: 'step', spec: { name: '${each.member}' },
      'for-each': { type: 'group-ref', groupName: 'team-members', as: 'member' }, condition: null,
    });

    const result = ForEachExpander.expand(elements, groups, resolver, testAdapter, 1000);

    expect(result.elements.size).toBe(2);
    expect(result.elements.get('step.Alice')!.spec).toEqual({ name: 'Alice' });
  });
});

describe('ForEachExpander — fixed elements', () => {
  it('passes through', () => {
    const elements = new Map<string, TestElement>();
    elements.set('db', {
      id: 'db', spec: { name: 'database' }, 'for-each': null, condition: null,
    });

    const result = ForEachExpander.expand(elements, {}, resolver, testAdapter, 1000);

    expect(result.elements.size).toBe(1);
    expect(result.elements.get('db')!.spec).toEqual({ name: 'database' });
  });

  it('resolves variables', () => {
    const varResolver = new VariableResolver(
      { var: (name) => name === 'prod' ? 'production' : undefined }, new Set());
    const elements = new Map<string, TestElement>();
    elements.set('db', {
      id: 'db', spec: { env: '${var.prod}' }, 'for-each': null, condition: null,
    });

    const result = ForEachExpander.expand(elements, {}, varResolver, testAdapter, 1000);
    expect(result.elements.get('db')!.spec).toEqual({ env: 'production' });
  });
});

describe('ForEachExpander — mixed elements', () => {
  it('correct count', () => {
    const groups = { regional: { as: 'region', in: ['us-east', 'eu-west'] } };
    const elements = new Map<string, TestElement>();
    elements.set('fixed-db', { id: 'fixed-db', spec: { name: 'db' }, 'for-each': null, condition: null });
    elements.set('fixed-schema', { id: 'fixed-schema', spec: { name: 'schema' }, 'for-each': null, condition: null });
    elements.set('regional-source', {
      id: 'regional-source', spec: { name: '${each.region}' },
      'for-each': { type: 'group-ref', groupName: 'regional' }, condition: null,
    });

    const result = ForEachExpander.expand(elements, groups, resolver, testAdapter, 1000);
    expect(result.elements.size).toBe(4);
  });

  it('preserves element order', () => {
    const groups = { env: { as: 'e', in: ['a', 'b'] } };
    const elements = new Map<string, TestElement>();
    elements.set('first', { id: 'first', spec: { name: '1' }, 'for-each': null, condition: null });
    elements.set('expand', {
      id: 'expand', spec: { name: '${each.e}' },
      'for-each': { type: 'group-ref', groupName: 'env' }, condition: null,
    });
    elements.set('last', { id: 'last', spec: { name: '3' }, 'for-each': null, condition: null });

    const result = ForEachExpander.expand(elements, groups, resolver, testAdapter, 1000);
    expect([...result.elements.keys()]).toEqual(['first', 'expand.a', 'expand.b', 'last']);
  });
});

describe('ForEachExpander — expansion limit', () => {
  it('exceeded throws', () => {
    const elements = new Map<string, TestElement>();
    elements.set('node', {
      id: 'node', spec: { name: '${each.idx}' },
      'for-each': { type: 'inline', as: 'idx', in: ['1', '2', '3', '4', '5'] }, condition: null,
    });

    expect(() => ForEachExpander.expand(elements, {}, resolver, testAdapter, 3))
      .toThrow(/node.*5.*3/);
  });
});

describe('ForEachExpander — when conditions', () => {
  it('when true includes element', () => {
    const varResolver = new VariableResolver(
      { var: (name) => name === 'enabled' ? 'true' : undefined }, new Set());
    const elements = new Map<string, TestElement>();
    elements.set('node', {
      id: 'node', spec: { name: 'x' }, 'for-each': null, condition: '${var.enabled}',
    });

    const result = ForEachExpander.expand(elements, {}, varResolver, testAdapter, 1000);
    expect(result.elements.size).toBe(1);
    expect(result.excludedIds.size).toBe(0);
  });

  it('when false excludes element', () => {
    const varResolver = new VariableResolver(
      { var: (name) => name === 'enabled' ? 'false' : undefined }, new Set());
    const elements = new Map<string, TestElement>();
    elements.set('node', {
      id: 'node', spec: { name: 'x' }, 'for-each': null, condition: '${var.enabled}',
    });

    const result = ForEachExpander.expand(elements, {}, varResolver, testAdapter, 1000);
    expect(result.elements.size).toBe(0);
    expect(result.excludedIds.has('node')).toBe(true);
  });

  it('for-each when false excludes all copies', () => {
    const varResolver = new VariableResolver(
      { var: (name) => name === 'enable_sources' ? 'false' : undefined }, new Set());
    const elements = new Map<string, TestElement>();
    elements.set('source', {
      id: 'source', spec: { name: '${each.region}' },
      'for-each': { type: 'inline', as: 'region', in: ['us-east', 'eu-west'] },
      condition: '${var.enable_sources}',
    });

    const result = ForEachExpander.expand(elements, {}, varResolver, testAdapter, 1000);
    expect(result.elements.size).toBe(0);
    expect(result.excludedIds).toEqual(new Set(['source.us-east', 'source.eu-west']));
  });

  it('for-each when per-copy selective exclusion', () => {
    const elements = new Map<string, TestElement>();
    elements.set('source', {
      id: 'source', spec: { name: '${each.flag}' },
      'for-each': { type: 'inline', as: 'flag', in: ['true', 'false'] },
      condition: '${each.flag}',
    });

    const result = ForEachExpander.expand(elements, {}, resolver, testAdapter, 1000);
    expect(result.elements.size).toBe(1);
    expect(result.elements.has('source.true')).toBe(true);
    expect(result.excludedIds.has('source.false')).toBe(true);
  });
});

describe('ForEachExpander — value expander', () => {
  it('splits values', () => {
    const groups = { regional: { as: 'region', in: ['us-east|eu-west'] } };
    const elements = new Map<string, TestElement>();
    elements.set('source', {
      id: 'source', spec: { name: '${each.region}' },
      'for-each': { type: 'group-ref', groupName: 'regional' }, condition: null,
    });

    const expander = (resolved: string) => {
      if (resolved.includes('|')) return resolved.split('|');
      return [resolved];
    };

    const result = ForEachExpander.expand(elements, groups, resolver, testAdapter, 1000, expander);
    expect(result.elements.size).toBe(2);
    expect(result.elements.has('source.us-east')).toBe(true);
    expect(result.elements.has('source.eu-west')).toBe(true);
  });

  it('null uses default', () => {
    const elements = new Map<string, TestElement>();
    elements.set('node', {
      id: 'node', spec: { name: '${each.x}' },
      'for-each': { type: 'inline', as: 'x', in: ['a', 'b'] }, condition: null,
    });

    const result = ForEachExpander.expand(elements, {}, resolver, testAdapter, 1000, null);
    expect(result.elements.size).toBe(2);
  });
});

describe('ForEachExpander — reference rewriting', () => {
  interface RefElement {
    id: string;
    spec: Record<string, unknown>;
    'for-each': ForEachDirective | null;
    condition: string | null;
    refs: Reference[];
  }

  const refAdapter: ForEachAdapter<RefElement> = {
    stamp(template, stampedId, scopedResolver) {
      return {
        id: stampedId,
        spec: scopedResolver.resolveMap(template.spec, stampedId),
        'for-each': null, condition: null, refs: template.refs,
      };
    },
    getForEach(element) { return element['for-each']; },
    getCondition(element) { return element.condition; },
    getReferences(element) { return element.refs; },
    withReferences(element, rewritten) {
      return { ...element, refs: rewritten };
    },
  };

  it('static reference unchanged', () => {
    const elements = new Map<string, RefElement>();
    elements.set('static-node', {
      id: 'static-node', spec: {}, 'for-each': null, condition: null, refs: [],
    });
    elements.set('consumer', {
      id: 'consumer', spec: {}, 'for-each': null, condition: null,
      refs: [{ targetId: 'static-node', optional: false }],
    });

    const result = ForEachExpander.expand(elements, {}, resolver, refAdapter, 1000);
    expect(result.elements.get('consumer')!.refs).toEqual([
      { targetId: 'static-node', optional: false },
    ]);
  });

  it('same group paired', () => {
    const groups = { regional: { as: 'region', in: ['us', 'eu'] } };
    const elements = new Map<string, RefElement>();
    elements.set('source', {
      id: 'source', spec: {},
      'for-each': { type: 'group-ref', groupName: 'regional' },
      condition: null, refs: [],
    });
    elements.set('sink', {
      id: 'sink', spec: {},
      'for-each': { type: 'group-ref', groupName: 'regional' },
      condition: null, refs: [{ targetId: 'source', optional: false }],
    });

    const result = ForEachExpander.expand(elements, groups, resolver, refAdapter, 1000);
    expect(result.elements.get('sink.us')!.refs).toEqual([
      { targetId: 'source.us', optional: false },
    ]);
    expect(result.elements.get('sink.eu')!.refs).toEqual([
      { targetId: 'source.eu', optional: false },
    ]);
  });

  it('cross group optional skipped', () => {
    const groups = {
      g1: { as: 'a', in: ['x'] },
      g2: { as: 'b', in: ['y'] },
    };
    const elements = new Map<string, RefElement>();
    elements.set('src', {
      id: 'src', spec: {},
      'for-each': { type: 'group-ref', groupName: 'g1' },
      condition: null, refs: [],
    });
    elements.set('sink', {
      id: 'sink', spec: {},
      'for-each': { type: 'group-ref', groupName: 'g2' },
      condition: null, refs: [{ targetId: 'src', optional: true }],
    });

    const result = ForEachExpander.expand(elements, groups, resolver, refAdapter, 1000);
    expect(result.elements.get('sink.y')!.refs).toEqual([]);
  });

  it('cross group required throws', () => {
    const groups = {
      g1: { as: 'a', in: ['x'] },
      g2: { as: 'b', in: ['y'] },
    };
    const elements = new Map<string, RefElement>();
    elements.set('src', {
      id: 'src', spec: {},
      'for-each': { type: 'group-ref', groupName: 'g1' },
      condition: null, refs: [],
    });
    elements.set('sink', {
      id: 'sink', spec: {},
      'for-each': { type: 'group-ref', groupName: 'g2' },
      condition: null, refs: [{ targetId: 'src', optional: false }],
    });

    expect(() => ForEachExpander.expand(elements, groups, resolver, refAdapter, 1000))
      .toThrow('different group');
  });

  it('reference to excluded required throws', () => {
    const elements = new Map<string, RefElement>();
    elements.set('excluded', {
      id: 'excluded', spec: {}, 'for-each': null, condition: 'false', refs: [],
    });
    elements.set('consumer', {
      id: 'consumer', spec: {}, 'for-each': null, condition: null,
      refs: [{ targetId: 'excluded', optional: false }],
    });

    expect(() => ForEachExpander.expand(elements, {}, resolver, refAdapter, 1000))
      .toThrow('excluded');
  });
});

describe('ForEachExpander — CSV data sources', () => {
  it('stamps per row', () => {
    const csv = CsvParser.parse('members',
      'name:STRING,role:STRING\nAlice,Developer\nBob,Viewer');
    const groups = { members: { as: 'member', in: [] as string[] } };
    const elements = new Map<string, TestElement>();
    elements.set('create-member', {
      id: 'create-member',
      spec: { fullName: '${each.member.name}', memberRole: '${each.member.role}' },
      'for-each': { type: 'group-ref', groupName: 'members' }, condition: null,
    });

    const result = ForEachExpander.expandWithCsv(
      elements, groups, { members: csv }, resolver, testAdapter, 1000);

    expect(result.elements.size).toBe(2);
    expect([...result.elements.keys()]).toEqual([
      'create-member.Alice', 'create-member.Bob',
    ]);
    expect(result.elements.get('create-member.Alice')!.spec).toEqual({
      fullName: 'Alice', memberRole: 'Developer',
    });
  });

  it('when condition excludes rows', () => {
    const csv = CsvParser.parse('members',
      'name:STRING,admin:BOOLEAN\nAlice,true\nBob,false');
    const groups = { members: { as: 'member', in: [] as string[] } };
    const elements = new Map<string, TestElement>();
    elements.set('grant-admin', {
      id: 'grant-admin',
      spec: { user: '${each.member.name}' },
      'for-each': { type: 'group-ref', groupName: 'members' },
      condition: '${each.member.admin}',
    });

    const result = ForEachExpander.expandWithCsv(
      elements, groups, { members: csv }, resolver, testAdapter, 1000);

    expect(result.elements.size).toBe(1);
    expect(result.elements.has('grant-admin.Alice')).toBe(true);
    expect(result.excludedIds.has('grant-admin.Bob')).toBe(true);
  });

  it('mixed with regular groups', () => {
    const csv = CsvParser.parse('users', 'name:STRING\nAlice\nBob');
    const groups = {
      users: { as: 'user', in: [] as string[] },
      env: { as: 'e', in: ['dev', 'prod'] },
    };
    const elements = new Map<string, TestElement>();
    elements.set('user-step', {
      id: 'user-step', spec: { n: '${each.user.name}' },
      'for-each': { type: 'group-ref', groupName: 'users' }, condition: null,
    });
    elements.set('env-step', {
      id: 'env-step', spec: { n: '${each.e}' },
      'for-each': { type: 'group-ref', groupName: 'env' }, condition: null,
    });

    const result = ForEachExpander.expandWithCsv(
      elements, groups, { users: csv }, resolver, testAdapter, 1000);

    expect(result.elements.size).toBe(4);
    expect([...result.elements.keys()]).toEqual([
      'user-step.Alice', 'user-step.Bob', 'env-step.dev', 'env-step.prod',
    ]);
  });
});

describe('parseForEachDirective', () => {
  it('string returns group-ref', () => {
    const result = parseForEachDirective('members');
    expect(result).toEqual({ type: 'group-ref', groupName: 'members' });
  });

  it('map with list in returns inline', () => {
    const result = parseForEachDirective({ as: 'env', in: ['dev', 'prod'] });
    expect(result).toEqual({ type: 'inline', as: 'env', in: ['dev', 'prod'] });
  });

  it('map with string in returns group-ref', () => {
    const result = parseForEachDirective({ as: 'member', in: 'team-members' });
    expect(result).toEqual({ type: 'group-ref', groupName: 'team-members', as: 'member' });
  });

  it('null returns null', () => {
    expect(parseForEachDirective(null)).toBeNull();
  });

  it('invalid type throws', () => {
    expect(() => parseForEachDirective(42)).toThrow('Invalid for-each');
  });
});
