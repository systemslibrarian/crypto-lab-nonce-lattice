import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { sha256 } from '@noble/hashes/sha2.js';

import { recoverKey } from '../src/attacks/recover-key';
import { sign, verify } from '../src/crypto/ecdsa';
import { bigIntToBytes } from '../src/crypto/modular';
import { secp256k1Curve } from '../src/curves/secp256k1';
import type { LeakConfig, SignatureRecord } from '../src/types';

/** A pinned transcript, with deterministic test nonce material rather than a claimed
 * published attack-output vector. The Python solver builds its own HNP basis and
 * performs LLL without importing any of the lab's lattice/recovery functions. */
function seededTranscript(unknownBits: number, count: number): SignatureRecord[] {
  const curve = secp256k1Curve;
  const secret = 0x1c3a74f2d8e91b5a9c7d0e5f4a2b6789cdef0123456789abcdef0123456789abn;
  const leak: LeakConfig = { mode: 'msb', bits: curve.bits - unknownBits };
  return Array.from({ length: count }, (_, index) => {
    const digest = sha256(new TextEncoder().encode(`nonce-lattice independent fixture ${index}`));
    const nonce = 1n + BigInt(`0x${Array.from(digest, (b) => b.toString(16).padStart(2, '0')).join('')}`)
      % ((1n << BigInt(unknownBits)) - 1n);
    return sign(secret, `independent HNP message ${index}`, curve, leak, index, () => ({
      k: nonce,
      knownLeak: { kind: 'msb', bits: leak.bits, value: 0n },
      leakedLabel: 'known zero MSBs',
    }));
  });
}

describe('independent seeded HNP solver', () => {
  it('recovers the same secp256k1 key from a separate Python lattice reduction', () => {
    const curve = secp256k1Curve;
    const unknownBits = 224;
    const leak: LeakConfig = { mode: 'msb', bits: curve.bits - unknownBits };
    const signatures = seededTranscript(unknownBits, 10);
    const expected = 0x1c3a74f2d8e91b5a9c7d0e5f4a2b6789cdef0123456789abcdef0123456789abn;
    expect(signatures.every((sig) => verify(sig.publicKey, sig.digest, sig.r, sig.s, curve))).toBe(true);

    const input = JSON.stringify({
      order: curve.order.toString(),
      bits: unknownBits,
      signatures: signatures.map(({ r, s, h }) => ({ r: r.toString(), s: s.toString(), h: h.toString() })),
    });
    const solver = fileURLToPath(new URL('../verification/solve_hnp.py', import.meta.url));
    const independentlyRecovered = BigInt(execFileSync('python3', [solver], {
      input, encoding: 'utf8', timeout: 120_000,
    }).trim());
    const labRecovered = recoverKey(signatures, leak, curve);

    expect(labRecovered.recoveredKey).toBe(expected);
    expect(['embedding', 'babai']).toContain(labRecovered.trace.mode);
    expect(independentlyRecovered).toBe(expected);
    expect(bigIntToBytes(independentlyRecovered, curve.orderBytes)).toEqual(
      bigIntToBytes(labRecovered.recoveredKey!, curve.orderBytes),
    );
    expect(curve.getPublicKey(bigIntToBytes(independentlyRecovered, curve.orderBytes), false))
      .toEqual(signatures[0].publicKey);
  }, 120_000);
});
