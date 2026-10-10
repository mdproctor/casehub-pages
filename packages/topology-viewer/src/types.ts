export enum DriftStatus {
  NORMAL = 'NORMAL',
  PERMITTED_DRIFT = 'PERMITTED_DRIFT',
  UNEXPECTED_DRIFT = 'UNEXPECTED_DRIFT',
}

export interface TopologyNode {
  readonly id: string;
  readonly label: string;
  readonly type: string;
  readonly driftStatus: DriftStatus;
  readonly triggerSource?: string;
  readonly exemptUntil?: string;
}

export interface DriftExemptionGrantedPayload {
  readonly deviceId: string;
  readonly triggerSource: string;
  readonly exemptUntil: string;
}

export interface DriftExemptionRevokedPayload {
  readonly deviceId: string;
}
