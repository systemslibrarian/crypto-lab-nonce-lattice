import { sha256 } from '@noble/hashes/sha2';

import type { CurveContext } from '../types';

export function mod(value: bigint, modulus: bigint): bigint {
  const result = value % modulus;
  return result >= 0n ? result : result + modulus;
}

export function gcd(a: bigint, b: bigint): bigint {
  let x = a < 0n ? -a : a;
  let y = b < 0n ? -b : b;
  while (y !== 0n) {
    const next = x % y;
    x = y;
    y = next;
  }
  return x;
}

export function invert(value: bigint, modulus: bigint): bigint {
  let oldR = mod(value, modulus);
  let r = modulus;
  let oldS = 1n;
  let s = 0n;
  while (r !== 0n) {
    const quotient = oldR / r;
    [oldR, r] = [r, oldR - quotient * r];
    [oldS, s] = [s, oldS - quotient * s];
  }
  if (oldR !== 1n) {
    throw new Error('Value is not invertible modulo n');
  }
  return mod(oldS, modulus);
}

export function bitLength(value: bigint): number {
  if (value === 0n) {
    return 0;
  }
  return value.toString(2).length;
}

export function pow2(bits: number): bigint {
  return 1n << BigInt(bits);
}

export function bytesToBigInt(bytes: Uint8Array): bigint {
  let result = 0n;
  for (const byte of bytes) {
    result = (result << 8n) | BigInt(byte);
  }
  return result;
}

export function bigIntToBytes(value: bigint, length: number): Uint8Array {
  let remaining = value;
  const output = new Uint8Array(length);
  for (let index = length - 1; index >= 0; index -= 1) {
    output[index] = Number(remaining & 0xffn);
    remaining >>= 8n;
  }
  return output;
}

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function hexToBytes(hex: string): Uint8Array {
  const normalized = hex.startsWith('0x') ? hex.slice(2) : hex;
  const padded = normalized.length % 2 === 0 ? normalized : `0${normalized}`;
  const output = new Uint8Array(padded.length / 2);
  for (let index = 0; index < padded.length; index += 2) {
    output[index / 2] = Number.parseInt(padded.slice(index, index + 2), 16);
  }
  return output;
}

export function utf8ToBytes(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

export function sha256Digest(message: Uint8Array): Uint8Array {
  return sha256(message);
}

export function truncateToOrder(bytes: Uint8Array, curve: CurveContext): bigint {
  const digest = bytesToBigInt(bytes);
  const extraBits = bytes.length * 8 - curve.bits;
  const truncated = extraBits > 0 ? digest >> BigInt(extraBits) : digest;
  return mod(truncated, curve.order);
}

export function hashToScalar(message: Uint8Array, curve: CurveContext): { digest: Uint8Array; scalar: bigint } {
  const digest = sha256Digest(message);
  return {
    digest,
    scalar: truncateToOrder(digest, curve),
  };
}

export function centerMod(value: bigint, modulus: bigint): bigint {
  const normalized = mod(value, modulus);
  const half = modulus / 2n;
  return normalized > half ? normalized - modulus : normalized;
}

export function absBigInt(value: bigint): bigint {
  return value < 0n ? -value : value;
}

export function isWithinBound(value: bigint, bound: bigint): boolean {
  return absBigInt(value) <= bound;
}

export function randomBytes(length: number): Uint8Array {
  const output = new Uint8Array(length);
  crypto.getRandomValues(output);
  return output;
}

export function randomScalar(curve: CurveContext): bigint {
  const spareBits = curve.orderBytes * 8 - curve.bits;
  while (true) {
    const bytes = randomBytes(curve.orderBytes);
    if (spareBits > 0) {
      const mask = 0xff >>> spareBits;
      bytes[0] &= mask;
    }
    const candidate = bytesToBigInt(bytes);
    if (candidate > 0n && candidate < curve.order) {
      return candidate;
    }
  }
}

export function compactSignature(r: bigint, s: bigint, curve: CurveContext): Uint8Array {
  const output = new Uint8Array(curve.orderBytes * 2);
  output.set(bigIntToBytes(r, curve.orderBytes), 0);
  output.set(bigIntToBytes(s, curve.orderBytes), curve.orderBytes);
  return output;
}

export function formatScalar(value: bigint, length: number): string {
  return value.toString(16).padStart(length * 2, '0');
}