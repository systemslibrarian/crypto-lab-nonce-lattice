import { invert, mod } from '../src/crypto/modular';
import { describe, it, expect } from 'vitest';

describe('invert', () => {
  it('computes modular inverse correctly', () => {
    expect(invert(3n, 11n)).toBe(4n);
    expect(invert(10n, 17n)).toBe(12n);
    expect(mod(invert(7n, 13n) * 7n, 13n)).toBe(1n);
  });
  it('throws on non-invertible', () => {
    expect(() => invert(2n, 4n)).toThrow();
    expect(() => invert(0n, 7n)).toThrow();
  });
});
