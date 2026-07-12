import { describe, it, expect } from 'vitest';

import { recoverKey } from '../src/attacks/recover-key';
import { buildHnpInstance } from '../src/attacks/hnp-builder';
import { createNonceGenerator } from '../src/crypto/biased-nonce';
import { sign, verify } from '../src/crypto/ecdsa';
import { bigIntToBytes, randomScalar } from '../src/crypto/modular';
import { secp256k1Curve } from '../src/curves/secp256k1';
import { p256Curve } from '../src/curves/p256';
import type { CurveContext, LeakConfig, SignatureRecord } from '../src/types';

/**
 * These tests drive the SHIPPED recoverKey() (buildHnpInstance -> LLL -> Babai /
 * embedding) end to end against signatures produced by the real ECDSA + biased
 * nonce generator. They are the headline attack path; earlier tests only checked
 * that LLL preserves dimensions and Babai on the identity basis, and re-derived
 * the repeated-nonce algebra locally, so the real recovery code was unverified.
 */

function makeSignatures(
  privateKey: bigint,
  leak: LeakConfig,
  curve: CurveContext,
  count: number,
): SignatureRecord[] {
  const generator = createNonceGenerator(leak, curve, privateKey);
  return Array.from({ length: count }, (_value, index) =>
    sign(privateKey, `nonce-lattice recover test sample ${index + 1}`, curve, leak, index, generator),
  );
}

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

describe('recoverKey end-to-end (HNP lattice)', () => {
  // The lattice attack needs enough signatures to constrain the HNP, but this
  // demo's LLL/Babai use floating-point Gram-Schmidt, so very large bases lose
  // numerical precision. n = 12 (the app's default signature count) with 24
  // leaked bits sits firmly in the reliable window and recovers deterministically
  // on both curves. This is exactly the operating point the UI exposes by default.
  const RECOVERABLE_N = 12;

  const cases: Array<{ label: string; curve: CurveContext; mode: LeakConfig['mode'] }> = [
    { label: 'secp256k1 / MSB leak', curve: secp256k1Curve, mode: 'msb' },
    { label: 'secp256k1 / LSB leak', curve: secp256k1Curve, mode: 'lsb' },
    { label: 'secp256k1 / fixed-prefix leak', curve: secp256k1Curve, mode: 'fixed-prefix' },
    { label: 'p256 / MSB leak', curve: p256Curve, mode: 'msb' },
  ];

  for (const testCase of cases) {
    it(`recovers the private key from biased nonces (${testCase.label})`, () => {
      const curve = testCase.curve;
      const leak: LeakConfig = { mode: testCase.mode, bits: 24, fixedPrefixVariant: 'random-tail' };
      const privateKey = randomScalar(curve);
      const signatures = makeSignatures(privateKey, leak, curve, RECOVERABLE_N);

      // Sanity: the signatures we attack are genuine, verifiable ECDSA signatures.
      expect(
        signatures.every((sig) => verify(sig.publicKey, sig.digest, sig.r, sig.s, curve)),
      ).toBe(true);

      const result = recoverKey(signatures, leak, curve);

      expect(result.recoveredKey).not.toBeNull();
      expect(result.matches).toBe(true);
      // The recovered scalar must equal the ACTUAL secret, not merely a public-key match.
      expect(result.recoveredKey).toBe(privateKey);
      // And it was found through the lattice path, not the algebraic shortcut.
      expect(['embedding', 'babai']).toContain(result.trace.mode);

      const recoveredBytes = bigIntToBytes(result.recoveredKey as bigint, curve.orderBytes);
      const actualBytes = bigIntToBytes(privateKey, curve.orderBytes);
      expect(bytesEqual(recoveredBytes, actualBytes)).toBe(true);
    });
  }

  it('recovers the private key from a repeated nonce via the algebraic path', () => {
    const curve = secp256k1Curve;
    const leak: LeakConfig = { mode: 'fixed-constant', bits: 0 };
    const privateKey = randomScalar(curve);
    const signatures = makeSignatures(privateKey, leak, curve, 4);

    // All signatures share r (same nonce) — the tell-tale of nonce reuse.
    expect(signatures.every((sig) => sig.r === signatures[0].r)).toBe(true);

    const result = recoverKey(signatures, leak, curve);
    expect(result.recoveredKey).toBe(privateKey);
    expect(result.matches).toBe(true);
    expect(result.trace.mode).toBe('algebra');
  });
});

describe('recoverKey fails below the leakage/sample threshold', () => {
  // This pins the "recovery fails below threshold" narrative. With only a handful
  // of signatures the HNP lattice is under-constrained: LLL/Babai does not reveal
  // a short vector whose secret coordinate is an exact multiple of the bound, so
  // extractEmbeddingCandidates / the Babai divisibility check reject every
  // candidate and recoverKey honestly reports failure (recoveredKey === null).
  it('returns null for too few signatures (near-miss / non-divisible branch)', () => {
    const curve = secp256k1Curve;
    const leak: LeakConfig = { mode: 'msb', bits: 24 };
    const privateKey = randomScalar(curve);
    const signatures = makeSignatures(privateKey, leak, curve, 3);

    const result = recoverKey(signatures, leak, curve);

    expect(result.recoveredKey).toBeNull();
    expect(result.matches).toBe(false);
    // It still built and reduced a real lattice; failure is reported, not faked.
    expect(['embedding', 'babai']).toContain(result.trace.mode);
    expect(result.trace.diagnostics.join(' ')).toMatch(/LLL did not reveal|does not yield/i);
  });

  it('does not build an HNP lattice for RFC 6979 (defended) signatures', () => {
    const curve = secp256k1Curve;
    const leak: LeakConfig = { mode: 'rfc6979', bits: 0 };
    const privateKey = randomScalar(curve);
    const signatures = makeSignatures(privateKey, leak, curve, 8);

    // No leaked bits are exposed, so there is no HNP instance to solve.
    expect(buildHnpInstance(signatures, leak, curve)).toBeNull();

    const result = recoverKey(signatures, leak, curve);
    expect(result.recoveredKey).toBeNull();
    expect(result.matches).toBe(false);
  });

  it('a single signature cannot be attacked', () => {
    const curve = secp256k1Curve;
    const leak: LeakConfig = { mode: 'msb', bits: 24 };
    const privateKey = randomScalar(curve);
    const signatures = makeSignatures(privateKey, leak, curve, 1);

    expect(buildHnpInstance(signatures, leak, curve)).toBeNull();
    const result = recoverKey(signatures, leak, curve);
    expect(result.recoveredKey).toBeNull();
  });
});
