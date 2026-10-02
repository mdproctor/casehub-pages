import { describe, it, expect } from 'vitest';
import { ImportExpander } from './import-expander.js';
import type { YamlImport, IterationGroup } from './types.js';
import type { CsvDataSource } from './csv-parser.js';

describe('ImportExpander', () => {
  describe('expand', () => {
    it('passes through imports without forEach or loop unchanged', () => {
      const imports: YamlImport[] = [
        { module: 'dashboard', as: 'dash', parameters: { title: 'Main' } },
      ];
      const result = ImportExpander.expand(imports, {}, {});
      expect(result).toHaveLength(1);
      expect(result[0]!.as).toBe('dash');
      expect(result[0]!.parameters).toEqual({ title: 'Main' });
    });

    it('expands import with inline forEach', () => {
      const imports: YamlImport[] = [
        {
          module: 'regional',
          as: 'region',
          parameters: { region: '${each.env}' },
          forEach: { as: 'env', in: ['us', 'eu'] },
        },
      ];
      const result = ImportExpander.expand(imports, {}, {});
      expect(result).toHaveLength(2);
      expect(result[0]!.as).toBe('region.us');
      expect(result[0]!.parameters).toEqual({ region: 'us' });
      expect(result[1]!.as).toBe('region.eu');
      expect(result[1]!.parameters).toEqual({ region: 'eu' });
    });

    it('expands import with group-ref forEach', () => {
      const imports: YamlImport[] = [
        {
          module: 'svc',
          as: 'service',
          parameters: { env: '${each.env}' },
          forEach: 'envs',
        },
      ];
      const groups: Record<string, IterationGroup> = {
        envs: { as: 'env', in: ['dev', 'staging', 'prod'] },
      };
      const result = ImportExpander.expand(imports, groups, {});
      expect(result).toHaveLength(3);
      expect(result[0]!.as).toBe('service.dev');
      expect(result[0]!.parameters).toEqual({ env: 'dev' });
      expect(result[1]!.as).toBe('service.staging');
      expect(result[2]!.as).toBe('service.prod');
    });

    it('strips forEach and loop from expanded imports', () => {
      const imports: YamlImport[] = [
        {
          module: 'mod',
          as: 'a',
          parameters: {},
          forEach: { as: 'x', in: ['1'] },
        },
      ];
      const result = ImportExpander.expand(imports, {}, {});
      expect(result[0]!.forEach).toBeUndefined();
      expect(result[0]!.loop).toBeUndefined();
    });

    it('evaluates conditions per stamped import', () => {
      const imports: YamlImport[] = [
        {
          module: 'regional',
          as: 'region',
          parameters: { env: '${each.env}' },
          forEach: { as: 'env', in: ['us', 'eu', 'ap'] },
          condition: 'true',
        },
      ];
      const result = ImportExpander.expand(imports, {}, {});
      expect(result).toHaveLength(3);
      expect(result.map(r => r.as)).toEqual(['region.us', 'region.eu', 'region.ap']);
    });

    it('excludes stamped imports where condition is falsy', () => {
      const imports: YamlImport[] = [
        {
          module: 'regional',
          as: 'region',
          parameters: {},
          forEach: { as: 'flag', in: ['true', 'false', 'no'] },
          condition: '${each.flag}',
        },
      ];
      const result = ImportExpander.expand(imports, {}, {});
      expect(result).toHaveLength(1);
      expect(result[0]!.as).toBe('region.true');
    });

    it('mixes expanded and non-expanded imports preserving order', () => {
      const imports: YamlImport[] = [
        { module: 'base', as: 'base', parameters: {} },
        {
          module: 'regional',
          as: 'region',
          parameters: { env: '${each.env}' },
          forEach: { as: 'env', in: ['us', 'eu'] },
        },
        { module: 'footer', as: 'footer', parameters: {} },
      ];
      const result = ImportExpander.expand(imports, {}, {});
      expect(result).toHaveLength(4);
      expect(result.map(r => r.as)).toEqual(['base', 'region.us', 'region.eu', 'footer']);
    });

    it('resolves multiple parameters per iteration', () => {
      const imports: YamlImport[] = [
        {
          module: 'svc',
          as: 'svc',
          parameters: { name: '${each.name}-service', label: 'svc-${each.name}' },
          forEach: { as: 'name', in: ['web'] },
        },
      ];
      const result = ImportExpander.expand(imports, {}, {});
      expect(result[0]!.parameters['name']).toBe('web-service');
      expect(result[0]!.parameters['label']).toBe('svc-web');
    });

    it('preserves parameters without variable references as-is', () => {
      const imports: YamlImport[] = [
        {
          module: 'svc',
          as: 'svc',
          parameters: { name: '${each.name}', port: '8080' },
          forEach: { as: 'name', in: ['web'] },
        },
      ];
      const result = ImportExpander.expand(imports, {}, {});
      expect(result[0]!.parameters['name']).toBe('web');
      expect(result[0]!.parameters['port']).toBe('8080');
    });

    it('preserves module and actions fields on stamped imports', () => {
      const imports: YamlImport[] = [
        {
          module: 'mod-a',
          as: 'a',
          parameters: {},
          forEach: { as: 'x', in: ['1'] },
        },
        {
          actions: 'step-defs',
          as: 'b',
          parameters: {},
          forEach: { as: 'x', in: ['1'] },
        },
      ];
      const result = ImportExpander.expand(imports, {}, {});
      expect(result[0]!.module).toBe('mod-a');
      expect(result[0]!.actions).toBeUndefined();
      expect(result[1]!.actions).toBe('step-defs');
      expect(result[1]!.module).toBeUndefined();
    });

    it('throws for forEach referencing unknown group', () => {
      const imports: YamlImport[] = [
        {
          module: 'mod',
          as: 'a',
          parameters: {},
          forEach: 'nonexistent',
        },
      ];
      expect(() => ImportExpander.expand(imports, {}, {})).toThrow(/nonexistent/);
    });

    it('filters out steps-based imports', () => {
      const imports: YamlImport[] = [
        { module: 'dashboard', as: 'dash', parameters: {} },
        { steps: 'login-flow', as: 'login', parameters: {} },
        { module: 'footer', as: 'footer', parameters: {} },
      ];
      const result = ImportExpander.expand(imports, {}, {});
      expect(result).toHaveLength(2);
      expect(result.map(r => r.as)).toEqual(['dash', 'footer']);
    });

    it('filters out steps-based imports with forEach', () => {
      const imports: YamlImport[] = [
        {
          steps: 'flow',
          as: 'flow',
          parameters: { env: '${each.env}' },
          forEach: { as: 'env', in: ['us', 'eu'] },
        },
      ];
      const result = ImportExpander.expand(imports, {}, {});
      expect(result).toHaveLength(0);
    });

    it('throws when forEach value contains dot separator', () => {
      const imports: YamlImport[] = [
        {
          module: 'mod',
          as: 'region',
          parameters: {},
          forEach: { as: 'env', in: ['us.east'] },
        },
      ];
      expect(() => ImportExpander.expand(imports, {}, {})).toThrow(/us\.east/);
    });

    it('throws on duplicate stamped alias across imports', () => {
      const imports: YamlImport[] = [
        {
          module: 'mod-a',
          as: 'item',
          parameters: {},
          forEach: { as: 'x', in: ['one'] },
        },
        {
          module: 'mod-b',
          as: 'item',
          parameters: {},
          forEach: { as: 'x', in: ['one'] },
        },
      ];
      expect(() => ImportExpander.expand(imports, {}, {})).toThrow(/item\.one/);
    });

    it('throws on duplicate alias between expanded and non-expanded', () => {
      const imports: YamlImport[] = [
        { module: 'base', as: 'region.us', parameters: {} },
        {
          module: 'regional',
          as: 'region',
          parameters: {},
          forEach: { as: 'env', in: ['us'] },
        },
      ];
      expect(() => ImportExpander.expand(imports, {}, {})).toThrow(/region\.us/);
    });
  });

  describe('expand with CSV', () => {
    it('expands import with CSV data source', () => {
      const imports: YamlImport[] = [
        {
          module: 'env-dashboard',
          as: 'env',
          parameters: {
            name: '${each.e.name}',
            port: '${each.e.port}',
          },
          forEach: 'envs',
        },
      ];
      const groups: Record<string, IterationGroup> = {
        envs: { as: 'e', in: [] },
      };
      const dataSources: Record<string, CsvDataSource> = {
        envs: {
          name: 'envs',
          columns: [
            { name: 'name', type: 'STRING' },
            { name: 'port', type: 'INTEGER' },
          ],
          rows: [
            { name: 'staging', port: 8080 },
            { name: 'prod', port: 443 },
          ],
        },
      };
      const result = ImportExpander.expand(imports, groups, dataSources);
      expect(result).toHaveLength(2);
      expect(result[0]!.as).toBe('env.staging');
      expect(result[0]!.parameters).toEqual({ name: 'staging', port: '8080' });
      expect(result[1]!.as).toBe('env.prod');
      expect(result[1]!.parameters).toEqual({ name: 'prod', port: '443' });
    });
  });

  describe('loop expansion', () => {
    it('expands import with loop count', () => {
      const imports: YamlImport[] = [
        {
          module: 'worker',
          as: 'worker',
          parameters: { index: '${each.i}' },
          loop: 3,
        },
      ];
      const result = ImportExpander.expand(imports, {}, {});
      expect(result).toHaveLength(3);
      expect(result[0]!.as).toBe('worker.0');
      expect(result[0]!.parameters).toEqual({ index: '0' });
      expect(result[1]!.as).toBe('worker.1');
      expect(result[2]!.as).toBe('worker.2');
    });

    it('expands import with loop object', () => {
      const imports: YamlImport[] = [
        {
          module: 'replica',
          as: 'replica',
          parameters: { id: '${each.i}' },
          loop: { count: 2 },
        },
      ];
      const result = ImportExpander.expand(imports, {}, {});
      expect(result).toHaveLength(2);
      expect(result[0]!.as).toBe('replica.0');
      expect(result[1]!.as).toBe('replica.1');
    });

    it('forEach takes precedence over loop when both present', () => {
      const imports: YamlImport[] = [
        {
          module: 'mod',
          as: 'a',
          parameters: {},
          forEach: { as: 'x', in: ['one', 'two'] },
          loop: 5,
        },
      ];
      const result = ImportExpander.expand(imports, {}, {});
      expect(result).toHaveLength(2);
      expect(result[0]!.as).toBe('a.one');
    });
  });
});
