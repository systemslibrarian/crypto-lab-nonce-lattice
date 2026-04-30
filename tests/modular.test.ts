import { modInv } from '../src/crypto/modular';
import { describe, it, expect } from 'vitest';

describe('modInv', () => {
  it('computes modular inverse correctly', () => {
    expect(modInv(3, 11)).toBe(4);
  });
  it('throws on non-invertible', () => {
    expect(() => modInv(2, 4)).toThrow();
  });
});
