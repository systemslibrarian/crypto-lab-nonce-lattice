import { describe, expect, it } from 'vitest';

import { DEFAULT_CONFIG, normalizeConfig, parseFixedPrefix } from '../src/config';
import { createNonceGenerator } from '../src/crypto/biased-nonce';
import { sign, verify } from '../src/crypto/ecdsa';
import { bigIntToBytes, hexToBytes, pow2 } from '../src/crypto/modular';
import { p256Curve } from '../src/curves/p256';
import { secp256k1Curve } from '../src/curves/secp256k1';
import { renderConfigPanel } from '../src/ui/config-panel';
import { renderFeasibility } from '../src/ui/feasibility';
import type { AppConfigView, GeneratedNonce } from '../src/types';

describe('untrusted configuration boundaries', () => {
  it('normalizes runtime values from storage or worker messages', () => {
    expect(normalizeConfig({
      curve: 'not-a-curve',
      leakMode: '<img>',
      leakedBits: Number.NaN,
      signatureCount: Number.POSITIVE_INFINITY,
      fixedPrefixVariant: 'unknown',
      fixedPrefixValue: 123,
    })).toEqual(DEFAULT_CONFIG);
  });

  it('rejects malformed or oversized fixed prefixes without echoing attacker text', () => {
    const payload = '"><img data-xss src=x>';
    expect(() => parseFixedPrefix(payload, 24)).toThrow('hexadecimal digits only');
    try {
      parseFixedPrefix(payload, 24);
    } catch (error) {
      expect(String(error)).not.toContain(payload);
    }
    expect(() => parseFixedPrefix('1000000', 24)).toThrow('fit within the selected 24-bit');
  });

  it('bounds persisted prefix text before it reaches HTML or BigInt parsing', () => {
    const config = normalizeConfig({ ...DEFAULT_CONFIG, fixedPrefixValue: 'a'.repeat(10_000) });
    expect(config.fixedPrefixValue.length).toBeLessThan(100);
    expect(config.fixedPrefixValue.endsWith('!')).toBe(true);
    expect(() => parseFixedPrefix(config.fixedPrefixValue, 24)).toThrow('hexadecimal digits only');
  });

  it('escapes saved values and worker errors before HTML templating', () => {
    const payload = '"><img data-xss src=x onerror=alert(1)>';
    const config: AppConfigView = { ...DEFAULT_CONFIG, fixedPrefixValue: payload };
    const form = renderConfigPanel(config);
    expect(form).not.toContain('<img data-xss');
    expect(form).toContain('&quot;&gt;&lt;img data-xss');

    const panel = renderFeasibility(config, secp256k1Curve, {
      plan: null,
      probes: [],
      running: false,
      error: payload,
      columns: [],
    });
    expect(panel).not.toContain('<img data-xss');
    expect(panel).toContain('&quot;&gt;&lt;img data-xss');
  });
});

describe('nonce and scalar validation', () => {
  it('rejects impossible fixed-prefix constant nonces instead of looping', () => {
    expect(() => createNonceGenerator({
      mode: 'fixed-prefix',
      bits: 24,
      fixedPrefixVariant: 'constant-nonce',
      fixedPrefixValue: 0n,
    }, secp256k1Curve, 1n)).toThrow('invalid constant nonce');
  });

  it('does not replace an invalid custom nonce with unrelated randomness', () => {
    let attempts = 0;
    const invalid = (): GeneratedNonce => {
      attempts += 1;
      return { k: 0n, knownLeak: null, leakedLabel: 'invalid test nonce' };
    };
    expect(() => sign(1n, 'test', secp256k1Curve, { mode: 'rfc6979', bits: 0 }, 0, invalid))
      .toThrow('Failed to derive a valid signature');
    expect(attempts).toBe(8);
  });

  it('treats malformed public-key encodings as verification failure', () => {
    expect(verify(new Uint8Array([0xff]), new Uint8Array(32), 1n, 1n, secp256k1Curve)).toBe(false);
  });

  it('rejects lossy scalar and hex conversions', () => {
    expect(() => bigIntToBytes(-1n, 32)).toThrow('does not fit');
    expect(() => bigIntToBytes(256n, 1)).toThrow('does not fit');
    expect(() => hexToBytes('12zz')).toThrow('non-hexadecimal');
    expect(() => pow2(-1)).toThrow('non-negative');
  });
});

describe('RFC 6979 conformance', () => {
  it('matches the P-256/SHA-256 sample vector from RFC 6979 appendix A.2.5', () => {
    const privateKey = BigInt('0xC9AFA9D845BA75166B5C215767B1D6934E50C3DB36E89B127B8A622B120F6721');
    const signature = sign(privateKey, 'sample', p256Curve, { mode: 'rfc6979', bits: 0 }, 0);

    expect(signature.k).toBe(BigInt('0xA6E3C57DD01ABE90086538398355DD4C3B17AA873382B0F24D6129493D8AAD60'));
    expect(signature.r).toBe(BigInt('0xEFD48B2AACB6A8FD1140DD9CD45E81D69D2C877B56AAF991C34D0EA84EAF3716'));
    expect(signature.s).toBe(BigInt('0xF7CB1C942D657C41D436C7A1B6E29F65F3E900DBB9AFF4064DC4AB2F843ACDA8'));
    expect(verify(signature.publicKey, signature.digest, signature.r, signature.s, p256Curve)).toBe(true);
  });
});
