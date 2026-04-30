import { generateNonce } from '../src/crypto/biased-nonce';
import { describe, it, expect } from 'vitest';

describe('Nonce Modes', () => {
  it('fixed nonce produces repeated r', () => {
    const n1 = generateNonce('fixed', 24, 1);
    const n2 = generateNonce('fixed', 24, 1);
    expect(n1).toBe(n2);
  });
});
