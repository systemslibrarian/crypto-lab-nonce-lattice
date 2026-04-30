import { describe, it, expect } from 'vitest';
import { secp256k1 } from '../src/curves/secp256k1';
import { mod, invert } from '../src/crypto/modular';

function sign(priv: bigint, msg: bigint) {
  // Deterministic test: k = 7n
  const k = 7n;
  const G = secp256k1.Point.BASE;
  const R = G.multiply(k).toAffine();
  const r = mod(R.x, secp256k1.order);
  const s = mod(invert(k, secp256k1.order) * (msg + r * priv), secp256k1.order);
  return { r, s };
}

function verify(pub: bigint, msg: bigint, r: bigint, s: bigint) {
  if (r <= 0n || r >= secp256k1.order || s <= 0n || s >= secp256k1.order) return false;
  const w = invert(s, secp256k1.order);
  const u1 = mod(msg * w, secp256k1.order);
  const u2 = mod(r * w, secp256k1.order);
  const G = secp256k1.Point.BASE;
  const Q = secp256k1.Point.BASE.multiply(pub);
  const P = G.multiply(u1).add(Q.multiply(u2));
  return mod(P.toAffine().x, secp256k1.order) === r;
}

describe('ECDSA', () => {
  const priv = 5n;
  const pub = priv; // For test, use scalar as pubkey for simplicity
  const msg = 12n;
  it('verifies valid signature', () => {
    const { r, s } = sign(priv, msg);
    expect(verify(pub, msg, r, s)).toBe(true);
  });
  it('fails on tampered signature', () => {
    const { r, s } = sign(priv, msg);
    expect(verify(pub, msg, r + 1n, s)).toBe(false);
    expect(verify(pub, msg, r, s + 1n)).toBe(false);
  });
});
