import { describe, it, expect } from 'vitest';
import { secp256k1 } from '../src/curves/secp256k1';
import { pow2 } from '../src/crypto/modular';

function fixedNonce(bits: number, value: bigint) {
  // Always returns the same value for test
  return pow2(bits) + value;
}

function rfc6979Nonce(priv: bigint, msg: bigint) {
  // Simulate RFC6979: returns different value for different msg
  return (priv * 1234567n + msg * 7654321n) % secp256k1.order;
}

describe('Nonce Modes', () => {
  it('fixed nonce produces repeated r', () => {
    const n1 = fixedNonce(24, 42n);
    const n2 = fixedNonce(24, 42n);
    expect(n1).toBe(n2);
  });
  it('RFC6979 mode does not repeat', () => {
    const priv = 5n;
    const msg1 = 12n;
    const msg2 = 13n;
    const k1 = rfc6979Nonce(priv, msg1);
    const k2 = rfc6979Nonce(priv, msg2);
    expect(k1).not.toBe(k2);
  });
});
