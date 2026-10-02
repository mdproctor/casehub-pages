import { describe, it, expect } from 'vitest';
import { expand } from './expand.js';

describe('expand', () => {
  it('passes through documents without yaml-core constructs', () => {
    const input = { pages: [{ name: 'test' }] };
    const result = expand(input);
    expect(result.map).toEqual(input);
    expect(result.diagnostics).toEqual([]);
  });

  it('resolves variables', () => {
    const input = {
      variables: { theme: { color: 'blue' } },
      pages: [{ name: '${theme.color}-dashboard' }],
    };
    const result = expand(input);
    expect(result.map['pages']).toEqual([{ name: 'blue-dashboard' }]);
    expect(result.diagnostics).toEqual([]);
  });

  it('resolves nested variables', () => {
    const input = {
      variables: { app: { title: 'Dashboard', env: 'prod' } },
      pages: [{ name: '${app.title}', config: { env: '${app.env}' } }],
    };
    const result = expand(input);
    const pages = result.map['pages'] as Record<string, unknown>[];
    expect(pages[0]!['name']).toBe('Dashboard');
    expect((pages[0]!['config'] as Record<string, unknown>)['env']).toBe('prod');
  });

  it('expands forEach with inline values', () => {
    const input = {
      pages: [{
        name: 'dashboard',
        components: {
          '${item}-metric': {
            forEach: { as: 'item', in: ['cpu', 'mem'] },
            type: 'metric',
            properties: { field: '${each.item}' },
          },
        },
      }],
    };
    const result = expand(input);
    const comps = (result.map['pages'] as any[])[0].components;
    expect(Object.keys(comps)).toContain('${item}-metric.cpu');
    expect(Object.keys(comps)).toContain('${item}-metric.mem');
    expect(comps['${item}-metric.cpu'].properties.field).toBe('cpu');
  });

  it('expands modules with section merging', () => {
    const input = {
      modules: {
        greeting: {
          parameters: { name: { type: 'STRING', required: true } },
          sections: {
            pages: { 'welcome-page': { name: 'hello' } },
          },
        },
      },
      imports: [{ module: 'greeting', as: 'hello', parameters: { name: 'world' } }],
      pages: {},
    };
    const result = expand(input);
    expect((result.map['pages'] as Record<string, unknown>)['hello.welcome-page']).toBeDefined();
  });

  it('removes yaml-core keys from output', () => {
    const input = {
      variables: { app: { title: 'test' } },
      modules: {},
      imports: [],
      iterations: {},
      data: {},
      pages: [{ name: '${app.title}' }],
    };
    const result = expand(input);
    expect(result.map['variables']).toBeUndefined();
    expect(result.map['modules']).toBeUndefined();
    expect(result.map['imports']).toBeUndefined();
    expect(result.map['iterations']).toBeUndefined();
    expect(result.map['data']).toBeUndefined();
    expect(result.map['pages']).toBeDefined();
  });

  it('returns diagnostics in lenient mode for unresolved variables', () => {
    const input = {
      pages: [{ name: '${missing.var}' }],
    };
    const result = expand(input, { strict: false });
    expect(result.diagnostics.length).toBeGreaterThan(0);
    expect(result.diagnostics[0]!.category).toBe('unresolved-variable');
  });

  it('throws in strict mode for unresolved variables', () => {
    const input = {
      pages: [{ name: '${missing.var}' }],
    };
    expect(() => expand(input, { strict: true })).toThrow();
  });

  it('lenient mode preserves unresolved values and collects diagnostics', () => {
    const input = {
      variables: { app: { title: 'test' } },
      pages: [{ name: '${app.title}', desc: '${missing.key}' }],
    };
    const result = expand(input, { strict: false });
    expect(result.diagnostics.length).toBeGreaterThan(0);
    expect(result.diagnostics[0]!.category).toBe('unresolved-variable');
  });

  it('resolves variables then forEach in correct order', () => {
    const input = {
      variables: { config: { regions: 'us,eu,ap' } },
      pages: [{
        name: 'dashboard',
        components: {
          'regional': {
            forEach: { as: 'r', in: ['${config.regions}'] },
            type: 'metric',
            properties: { region: '${each.r}' },
          },
        },
      }],
    };
    const result = expand(input);
    const comps = (result.map['pages'] as any[])[0].components;
    expect(comps['regional.us,eu,ap']).toBeDefined();
  });

  it('expands modules then resolves variables in section values', () => {
    const input = {
      variables: { env: { name: 'production' } },
      modules: {
        svc: {
          parameters: { port: { type: 'STRING', required: true } },
          outputs: {},
          sections: {
            services: { 'main-svc': { port: '8080', env: '${env.name}' } },
          },
        },
      },
      imports: [{ module: 'svc', as: 'web', parameters: { port: '8080' } }],
      services: {},
    };
    const result = expand(input);
    const svc = (result.map['services'] as Record<string, unknown>)['web.main-svc'] as Record<string, unknown>;
    expect(svc).toBeDefined();
    expect(svc['env']).toBe('production');
  });

  it('handles CSV data sources with forEach', () => {
    const input = {
      data: {
        envs: { inline: 'name:STRING,port:INTEGER\nstaging,8080\nprod,443' },
      },
      iterations: { envs: { as: 'env', in: [] } },
      pages: [{
        name: 'deploy',
        components: {
          'deploy-step': {
            forEach: 'envs',
            type: 'deploy',
            properties: { host: '${each.env.name}', port: '${each.env.port}' },
          },
        },
      }],
    };
    const result = expand(input);
    const comps = (result.map['pages'] as any[])[0].components;
    expect(comps['deploy-step.staging']).toBeDefined();
    expect(comps['deploy-step.staging'].properties.host).toBe('staging');
    expect(comps['deploy-step.staging'].properties.port).toBe('8080');
    expect(comps['deploy-step.prod']).toBeDefined();
  });

  it('handles when conditions on forEach elements', () => {
    const input = {
      variables: { features: { showMetrics: 'true', showTable: 'false' } },
      pages: [{
        name: 'dashboard',
        components: {
          'metric': { type: 'metric', if: '${features.showMetrics}' },
          'table': { type: 'data-table', if: '${features.showTable}' },
        },
      }],
    };
    const result = expand(input);
    const comps = (result.map['pages'] as any[])[0].components;
    expect(comps['metric']).toBeDefined();
    expect(comps['table']).toBeUndefined();
  });

  it('expands imports with forEach before module expansion', () => {
    const input = {
      modules: {
        regional: {
          parameters: { region: { type: 'STRING', required: true } },
          outputs: {},
          sections: {
            components: { 'status': { type: 'status', properties: { region: '${var.region}' } } },
          },
        },
      },
      imports: [
        {
          module: 'regional',
          as: 'r',
          forEach: { as: 'region', in: ['us', 'eu'] },
          parameters: { region: '${each.region}' },
        },
      ],
      components: {},
    };
    const result = expand(input);
    const comps = result.map['components'] as Record<string, unknown>;
    expect(comps['r.us.status']).toBeDefined();
    expect(comps['r.eu.status']).toBeDefined();
    expect((comps['r.us.status'] as any).properties.region).toBe('us');
    expect((comps['r.eu.status'] as any).properties.region).toBe('eu');
    expect(result.diagnostics).toEqual([]);
  });

  it('expands imports with loop before module expansion', () => {
    const input = {
      modules: {
        worker: {
          parameters: { index: { type: 'STRING', required: true } },
          outputs: {},
          sections: {
            services: { 'task-runner': { type: 'worker', index: '${var.index}' } },
          },
        },
      },
      imports: [
        {
          module: 'worker',
          as: 'w',
          loop: 2,
          parameters: { index: '${each.i}' },
        },
      ],
      services: {},
    };
    const result = expand(input);
    const svcs = result.map['services'] as Record<string, unknown>;
    expect(svcs['w.0.task-runner']).toBeDefined();
    expect(svcs['w.1.task-runner']).toBeDefined();
    expect((svcs['w.0.task-runner'] as any).index).toBe('0');
    expect((svcs['w.1.task-runner'] as any).index).toBe('1');
  });

  it('expands imports with forEach using iteration groups', () => {
    const input = {
      iterations: {
        envs: { as: 'env', in: ['dev', 'prod'] },
      },
      modules: {
        dashboard: {
          parameters: { env: { type: 'STRING', required: true } },
          outputs: {},
          sections: {
            pages: { 'main': { name: '${var.env}-dashboard' } },
          },
        },
      },
      imports: [
        {
          module: 'dashboard',
          as: 'dash',
          forEach: 'envs',
          parameters: { env: '${each.env}' },
        },
      ],
      pages: {},
    };
    const result = expand(input);
    const pages = result.map['pages'] as Record<string, unknown>;
    expect(pages['dash.dev.main']).toBeDefined();
    expect(pages['dash.prod.main']).toBeDefined();
    expect((pages['dash.dev.main'] as any).name).toBe('dev-dashboard');
    expect((pages['dash.prod.main'] as any).name).toBe('prod-dashboard');
  });

  it('filters steps imports from module expansion', () => {
    const input: Record<string, unknown> = {
      modules: {
        dashboard: {
          parameters: { title: {} },
          sections: { pages: { main: { title: '${module.title}' } } },
        },
      },
      imports: [
        { module: 'dashboard', as: 'dash', parameters: { title: 'Home' } },
        { steps: 'login-flow', as: 'login', parameters: {} },
      ],
      pages: {},
    };
    const result = expand(input);
    const pages = result.map['pages'] as Record<string, unknown>;
    expect(pages['dash.main']).toBeDefined();
    expect(pages['login.main']).toBeUndefined();
  });
});
