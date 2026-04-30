import { describe, it, expect } from 'vitest';
import { secp256k1 } from '../src/curves/secp256k1';
import { mod, invert } from '../src/crypto/modular';

// Simulate two ECDSA signatures with same nonce k
const priv = 7n;
const k = 11n;
const msg1 = 20n;
const msg2 = 33n;
const G = secp256k1.Point.BASE;
const R = G.multiply(k).toAffine();
const r = mod(R.x, secp256k1.order);
const s1 = mod(invert(k, secp256k1.order) * (msg1 + r * priv), secp256k1.order);
const s2 = mod(invert(k, secp256k1.order) * (msg2 + r * priv), secp256k1.order);

function recoverKeyFromRepeatedNonce(r: bigint, s1: bigint, s2: bigint, m1: bigint, m2: bigint, n: bigint) {
  // Standard algebraic recovery
  const k_rec = mod((m1 - m2) * invert(s1 - s2, n), n);
  const d_rec = mod((s1 * k_rec - m1) * invert(r, n), n);
  return { k_rec, d_rec };
}

describe('Repeated Nonce Recovery', () => {
  it('recovers key from two signatures with repeated nonce', () => {
    const { d_rec } = recoverKeyFromRepeatedNonce(r, s1, s2, msg1, msg2, secp256k1.order);
    expect(d_rec).toBe(priv);
  });
});
