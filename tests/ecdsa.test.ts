import { sign, verify } from '../src/crypto/ecdsa';
import { describe, it, expect } from 'vitest';

describe('ECDSA', () => {
  const priv = 1n;
  const msg = 2n;
  it('verifies valid signature', () => {
    const sig = sign(priv, msg);
    expect(verify(sig, msg)).toBe(true);
  });
  it('fails on tampered signature', () => {
    const sig = sign(priv, msg);
    sig.r++;
    expect(verify(sig, msg)).toBe(false);
  });
});
