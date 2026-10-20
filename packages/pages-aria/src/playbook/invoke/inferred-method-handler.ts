import type { InvokeHandler } from '@casehubio/yaml-core/step';
import type { Action, Result } from '@casehubio/yaml-core/step';
import type { InvokeBinding, Definition, ElementMethodBinding } from '@casehubio/yaml-core/step';
import { resolvePlaybookCapability, mapParams, kebabToCamel } from '../../executor/playbook-resolve.js';
import type { AriaTarget } from '@casehubio/pages-primitives';

function stepFailure(message: string): Result {
  return { kind: 'failure', message };
}

export class InferredMethodHandler implements InvokeHandler {
  supports(binding: InvokeBinding): boolean {
    return binding.kind === 'element-method';
  }

  create(_definition: Definition, binding: InvokeBinding): Action {
    const methodName = kebabToCamel((binding as ElementMethodBinding).method);
    return {
      async execute(params, _services) {
        const target = params.target as AriaTarget | undefined;
        if (!target) {
          return stepFailure(`Inferred method '${methodName}' requires a target`);
        }

        const { resolveTarget } = await import('../../executor/command-executor.js');
        const el = resolveTarget(target);
        const cap = resolvePlaybookCapability(el);
        if (!cap) {
          return stepFailure(
            `Target ${target.role} "${target.name}" is not playbook-callable — no [PLAYBOOK_ACTIONS] declared`,
          );
        }

        const desc = cap[methodName];
        if (!desc) {
          const available = Object.keys(cap).join(', ');
          return stepFailure(
            `Method '${methodName}' not playbook-callable on ${target.role} "${target.name}". Available: ${available}`,
          );
        }

        const method = (el as any)[methodName];
        if (typeof method !== 'function') {
          return stepFailure(`Target declares '${methodName}' but has no such method`);
        }

        try {
          const args = mapParams(params, desc);
          const result = method.call(el, ...args);
          if (result instanceof Promise) await result;
          return { kind: 'success', output: result ?? {}, executionMetadata: {} };
        } catch (e: any) {
          return stepFailure(e.message ?? String(e));
        }
      },
    };
  }
}
