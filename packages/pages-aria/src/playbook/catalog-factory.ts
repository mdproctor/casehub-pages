import type { Catalog, CatalogEntry, InvokeHandler } from '@casehubio/yaml-core/step';
import type { ElementMethodBinding } from '@casehubio/yaml-core/step';
import { stepSuccess } from '@casehubio/yaml-core/step';
import { AriaInvokeHandler } from './invoke/aria-handler.js';
import { InferredMethodHandler } from './invoke/inferred-method-handler.js';
import { loadScenarioDefinitions } from './invoke/definitions.js';

const handlers: InvokeHandler[] = [new AriaInvokeHandler()];
const inferredHandler = new InferredMethodHandler();

export function createScenarioCatalog(): Catalog {
  const entries = new Map<string, CatalogEntry>();
  for (const file of loadScenarioDefinitions()) {
    for (const [name, def] of Object.entries(file.actions)) {
      if (def.invoke) {
        const handler = handlers.find(h => h.supports(def.invoke!));
        const action = handler
          ? handler.create(def, def.invoke)
          : { async execute() { return stepSuccess({}); } };
        entries.set(name, { qualifiedName: name, definition: def, action });
      }
    }
  }
  return {
    resolve: (n: string) => entries.get(n),
    resolveInferred(name: string) {
      if (!/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/.test(name)) return undefined;
      const binding: ElementMethodBinding = { kind: 'element-method', method: name };
      const definition = {
        name,
        inputs: {},
        outputs: {},
        invoke: binding,
        portability: 'ts' as const,
      };
      return {
        qualifiedName: name,
        definition,
        action: inferredHandler.create(definition, binding),
      };
    },
    availableActions: () => new Set(entries.keys()),
  };
}
