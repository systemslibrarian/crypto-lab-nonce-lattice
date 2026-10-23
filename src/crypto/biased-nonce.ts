import { hmac } from '@noble/hashes/hmac.js';
import { sha256 } from '@noble/hashes/sha2.js';

import {
  bigIntToBytes,
  bytesToBigInt,
  centerMod,
  pow2,
  randomScalar,
  truncateToOrder,
} from './modular';
import type { CurveContext, GeneratedNonce, LeakConfig, NonceGenerator } from '../types';

const MAX_SAMPLING_ATTEMPTS = 256;

function concatBytes(...parts: Uint8Array[]): Uint8Array {
  const totalLength = parts.reduce((sum, part) => sum + part.length, 0);
  const output = new Uint8Array(totalLength);
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
}

function hmacSha256(key: Uint8Array, ...parts: Uint8Array[]): Uint8Array {
  return new Uint8Array(hmac(sha256, key, concatBytes(...parts)));
}

function intToOctets(value: bigint, curve: CurveContext): Uint8Array {
  return bigIntToBytes(value, curve.orderBytes);
}

function bitsToOctets(digest: Uint8Array, curve: CurveContext): Uint8Array {
  return intToOctets(truncateToOrder(digest, curve), curve);
}

function rfc6979Nonce(privateKey: bigint, digest: Uint8Array, curve: CurveContext): bigint {
  let key: Uint8Array = new Uint8Array(32);
  let value: Uint8Array = new Uint8Array(32).fill(1);
  const secret = intToOctets(privateKey, curve);
  const hashed = bitsToOctets(digest, curve);
  key = hmacSha256(key, value, new Uint8Array([0]), secret, hashed);
  value = hmacSha256(key, value);
  key = hmacSha256(key, value, new Uint8Array([1]), secret, hashed);
  value = hmacSha256(key, value);
  while (true) {
    let generated: Uint8Array = new Uint8Array();
    while (generated.length < curve.orderBytes) {
      value = hmacSha256(key, value);
      generated = concatBytes(generated, value);
    }
    const candidate = bytesToBigInt(generated.slice(0, curve.orderBytes));
    if (candidate > 0n && candidate < curve.order) {
      return candidate;
    }
    key = hmacSha256(key, value, new Uint8Array([0]));
    value = hmacSha256(key, value);
  }
}

function topMask(bits: number): bigint {
  return pow2(bits) - 1n;
}

function randomBits(bitCount: number): bigint {
  if (bitCount <= 0) {
    return 0n;
  }
  const byteLength = Math.ceil(bitCount / 8);
  const bytes = crypto.getRandomValues(new Uint8Array(byteLength));
  const extraBits = byteLength * 8 - bitCount;
  if (extraBits > 0) {
    bytes[0] &= 0xff >>> extraBits;
  }
  return bytesToBigInt(bytes);
}

function isValidNonce(candidate: bigint, curve: CurveContext): boolean {
  return candidate > 0n && candidate < curve.order;
}

function sampleNonce(factory: () => bigint, curve: CurveContext): bigint {
  for (let attempt = 0; attempt < MAX_SAMPLING_ATTEMPTS; attempt += 1) {
    const candidate = factory();
    if (isValidNonce(candidate, curve)) {
      return candidate;
    }
  }
  throw new Error('Unable to sample a valid nonce for this leakage configuration.');
}

function validateConfig(config: LeakConfig, curve: CurveContext, privateKey: bigint): void {
  const modes = new Set<LeakConfig['mode']>(['rfc6979', 'msb', 'lsb', 'fixed-prefix', 'fixed-constant']);
  if (!modes.has(config.mode)) {
    throw new Error('Unsupported nonce mode.');
  }
  if (!Number.isInteger(config.bits) || config.bits < 0 || config.bits > curve.bits) {
    throw new Error(`Leak size must be an integer from 0 through ${curve.bits}.`);
  }
  if ((config.mode === 'msb' || config.mode === 'lsb') && config.bits === curve.bits) {
    throw new Error('MSB and LSB demo modes must leave at least one unknown nonce bit.');
  }
  if (privateKey <= 0n || privateKey >= curve.order) {
    throw new Error('Private key must be a scalar in the curve order range.');
  }
  if (
    config.fixedPrefixVariant !== undefined &&
    config.fixedPrefixVariant !== 'random-tail' &&
    config.fixedPrefixVariant !== 'constant-nonce'
  ) {
    throw new Error('Unsupported fixed-prefix variant.');
  }
  if (config.fixedPrefixValue !== undefined) {
    const limit = pow2(config.bits);
    if (config.fixedPrefixValue < 0n || config.fixedPrefixValue >= limit) {
      throw new Error('Fixed prefix does not fit within the configured leak size.');
    }
  }
}

export function createNonceGenerator(config: LeakConfig, curve: CurveContext, privateKey: bigint): NonceGenerator {
  validateConfig(config, curve, privateKey);
  const fixedPrefixBits = config.bits;
  const prefixShift = curve.bits - fixedPrefixBits;
  const prefixLimit = pow2(fixedPrefixBits);
  let storedPrefix = 0n;
  let constantPrefixNonce: bigint | null = null;
  if (config.mode === 'fixed-prefix') {
    const variant = config.fixedPrefixVariant ?? 'random-tail';
    if (config.fixedPrefixValue !== undefined) {
      storedPrefix = config.fixedPrefixValue;
    } else if (variant === 'constant-nonce') {
      if (fixedPrefixBits === 0) {
        throw new Error('A constant fixed-prefix nonce needs at least one nonzero prefix bit.');
      }
      constantPrefixNonce = sampleNonce(() => randomBits(fixedPrefixBits) << BigInt(prefixShift), curve);
      storedPrefix = constantPrefixNonce >> BigInt(prefixShift);
    } else {
      storedPrefix = randomBits(fixedPrefixBits);
    }
    if (storedPrefix < 0n || storedPrefix >= prefixLimit) {
      throw new Error('Fixed prefix does not fit within the configured leak size.');
    }
    if (variant === 'constant-nonce' && constantPrefixNonce === null) {
      const candidate = storedPrefix << BigInt(prefixShift);
      if (!isValidNonce(candidate, curve)) {
        throw new Error('The selected prefix would produce an invalid constant nonce.');
      }
      constantPrefixNonce = candidate;
    }
  }
  const reusedNonce = config.mode === 'fixed-constant' ? randomScalar(curve) : null;

  return (digest, _sampleIndex, _attempt): GeneratedNonce => {
    if (config.mode === 'rfc6979') {
      return {
        k: rfc6979Nonce(privateKey, digest, curve),
        knownLeak: null,
        leakedLabel: 'RFC 6979 deterministic nonce',
      };
    }

    if (config.mode === 'fixed-constant' && reusedNonce !== null) {
      return {
        k: reusedNonce,
        knownLeak: null,
        leakedLabel: 'reused nonce across signatures',
      };
    }

    if (config.mode === 'msb') {
      const unknownBits = curve.bits - config.bits;
      const candidate = sampleNonce(() => randomBits(unknownBits), curve);
      return {
        k: candidate,
        knownLeak: { kind: 'msb', bits: config.bits, value: 0n },
        leakedLabel: `${config.bits} known MSBs = ${'0'.repeat(config.bits)}`,
      };
    }

    if (config.mode === 'lsb') {
      const unknownBits = curve.bits - config.bits;
      const candidate = sampleNonce(() => randomBits(unknownBits) << BigInt(config.bits), curve);
      return {
        k: candidate,
        knownLeak: { kind: 'lsb', bits: config.bits, value: 0n },
        leakedLabel: `${config.bits} known LSBs = ${'0'.repeat(config.bits)}`,
      };
    }

    if (config.mode === 'fixed-prefix') {
      const candidate = constantPrefixNonce ?? sampleNonce(
        () => (storedPrefix << BigInt(prefixShift)) | randomBits(prefixShift),
        curve,
      );
      return {
        k: candidate,
        knownLeak: { kind: 'fixed-prefix', bits: config.bits, value: storedPrefix & topMask(config.bits) },
        leakedLabel: `fixed prefix ${storedPrefix.toString(16)} (${config.bits} MSBs)`,
      };
    }

    throw new Error('Unsupported nonce mode.');
  };
}

export function centeredKnownNonce(knownPrefix: bigint, tailBits: number): { estimate: bigint; bound: bigint } {
  const half = tailBits > 0 ? pow2(tailBits - 1) : 0n;
  return {
    estimate: (knownPrefix << BigInt(tailBits)) + half,
    bound: tailBits > 0 ? half : 1n,
  };
}

export function centeredLsbQuotient(bits: number, curve: CurveContext): { center: bigint; bound: bigint } {
  const remaining = Math.max(curve.bits - bits, 1);
  const half = pow2(remaining - 1);
  return {
    center: half,
    bound: half,
  };
}

export function nonceError(value: bigint, estimate: bigint, modulus: bigint): bigint {
  return centerMod(value - estimate, modulus);
}
