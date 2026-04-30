import { describe, it, expect } from 'vitest';
import { buildHnpInstance } from '../src/attacks/hnp-builder';
import { secp256k1 } from '../src/curves/secp256k1';

describe('HNP Builder', () => {
  it('builds correct equations for MSB leakage', () => {
    // Fake signatures with MSB leakage
    const signatures = [
      { r: 1n, s: 2n, h: 3n, leakedBits: { bits: 24, value: 0x123456n }, publicKey: new Uint8Array(33) },
      { r: 2n, s: 3n, h: 4n, leakedBits: { bits: 24, value: 0x654321n }, publicKey: new Uint8Array(33) },
    ];
    const leakConfig = { mode: 'msb' };
    const hnp = buildHnpInstance(signatures as any, leakConfig as any, secp256k1);
    expect(hnp).toBeDefined();
    expect(hnp?.basis.length).toBe(2);
    expect(hnp?.basis[0].length).toBe(3);
  });
});
