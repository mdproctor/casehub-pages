export const PLAYBOOK_ACTIONS: unique symbol =
  Symbol.for('playbook-actions') as any;

export interface PlaybookMethodDescriptor {
  params?: Record<string, string | { type: string; required?: boolean }>;
  returns?: string;
  description?: string;
  portability?: 'universal' | 'java' | 'ts' | 'both';
}

export type PlaybookCapability = Record<string, PlaybookMethodDescriptor>;
