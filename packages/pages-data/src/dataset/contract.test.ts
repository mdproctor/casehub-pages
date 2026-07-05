import { describe, it, expect } from 'vitest';
import type { DatasetContract } from './contract.js';

describe('DatasetContract', () => {
  it('is a valid type with name, description, shape', () => {
    const contract: DatasetContract<{ id: string }> = {
      name: 'users',
      description: 'User dataset',
      shape: { id: '' },
    };
    expect(contract.name).toBe('users');
    expect(contract.description).toBe('User dataset');
    expect(contract.shape).toEqual({ id: '' });
  });
});
