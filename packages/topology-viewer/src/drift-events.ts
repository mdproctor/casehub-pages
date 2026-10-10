import { onPagesEvent } from '@casehubio/pages-data';
import { DriftStatus } from './types.js';
import type {
  DriftExemptionGrantedPayload,
  DriftExemptionRevokedPayload,
} from './types.js';

export interface DriftNodePatch {
  readonly driftStatus: DriftStatus;
  readonly triggerSource?: string;
  readonly exemptUntil?: string;
}

export interface DriftEventCallbacks {
  onNodeUpdate(nodeId: string, patch: DriftNodePatch): void;
}

export function subscribeDriftEvents(
  target: EventTarget,
  callbacks: DriftEventCallbacks,
): () => void {
  const unsubGranted = onPagesEvent<DriftExemptionGrantedPayload>(
    target,
    'drift:exemption:granted',
    (payload) => {
      callbacks.onNodeUpdate(payload.deviceId, {
        driftStatus: DriftStatus.PERMITTED_DRIFT,
        triggerSource: payload.triggerSource,
        exemptUntil: payload.exemptUntil,
      });
    },
  );

  const unsubRevoked = onPagesEvent<DriftExemptionRevokedPayload>(
    target,
    'drift:exemption:revoked',
    (payload) => {
      callbacks.onNodeUpdate(payload.deviceId, {
        driftStatus: DriftStatus.NORMAL,
      });
    },
  );

  return () => {
    unsubGranted();
    unsubRevoked();
  };
}
