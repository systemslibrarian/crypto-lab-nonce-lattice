import type { AppConfigView, CurveName, FixedPrefixVariant, LeakMode } from './types';

export const MAX_LEAKED_BITS = 32;
export const MAX_SIGNATURE_COUNT = 32;

export const DEFAULT_CONFIG: AppConfigView = {
  curve: 'secp256k1',
  leakMode: 'msb',
  leakedBits: 24,
  signatureCount: 12,
  fixedPrefixVariant: 'random-tail',
  fixedPrefixValue: '',
};

const CURVES = new Set<CurveName>(['secp256k1', 'p256']);
const LEAK_MODES = new Set<LeakMode>(['rfc6979', 'msb', 'lsb', 'fixed-prefix', 'fixed-constant']);
const PREFIX_VARIANTS = new Set<FixedPrefixVariant>(['random-tail', 'constant-nonce']);
const MAX_PREFIX_INPUT_LENGTH = 64;

function record(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? value as Record<string, unknown> : {};
}

function boundedInteger(value: unknown, fallback: number, minimum: number, maximum: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(minimum, Math.min(maximum, Math.trunc(value)));
}

/**
 * Treat persisted state and worker messages as untrusted runtime data. TypeScript
 * types disappear at those boundaries, so every enum and number is checked again
 * before it can select a curve or size an attack.
 */
export function normalizeConfig(value: unknown): AppConfigView {
  const candidate = record(value);
  const curve = CURVES.has(candidate.curve as CurveName)
    ? candidate.curve as CurveName
    : DEFAULT_CONFIG.curve;
  const leakMode = LEAK_MODES.has(candidate.leakMode as LeakMode)
    ? candidate.leakMode as LeakMode
    : DEFAULT_CONFIG.leakMode;
  const fixedPrefixVariant = PREFIX_VARIANTS.has(candidate.fixedPrefixVariant as FixedPrefixVariant)
    ? candidate.fixedPrefixVariant as FixedPrefixVariant
    : DEFAULT_CONFIG.fixedPrefixVariant;

  const rawPrefix = typeof candidate.fixedPrefixValue === 'string'
    ? candidate.fixedPrefixValue.trim()
    : '';
  // A sibling page on the shared GitHub Pages origin can write this storage
  // key. Keep a malicious multi-megabyte value out of both BigInt parsing and
  // the next innerHTML render; the trailing non-hex marker makes it fail closed.
  const fixedPrefixValue = rawPrefix.length > MAX_PREFIX_INPUT_LENGTH
    ? `${rawPrefix.slice(0, MAX_PREFIX_INPUT_LENGTH)}!`
    : rawPrefix;

  return {
    curve,
    leakMode,
    leakedBits: boundedInteger(
      candidate.leakedBits,
      DEFAULT_CONFIG.leakedBits,
      0,
      MAX_LEAKED_BITS,
    ),
    signatureCount: boundedInteger(
      candidate.signatureCount,
      DEFAULT_CONFIG.signatureCount,
      2,
      MAX_SIGNATURE_COUNT,
    ),
    fixedPrefixVariant,
    fixedPrefixValue,
  };
}

/** Parse the optional fixed-prefix field without reflecting its raw contents in errors. */
export function parseFixedPrefix(value: string, bits: number): bigint | undefined {
  if (!Number.isInteger(bits) || bits < 0 || bits > MAX_LEAKED_BITS) {
    throw new Error(`Fixed-prefix leak size must be an integer from 0 through ${MAX_LEAKED_BITS}.`);
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }
  if (!/^(?:0x)?[0-9a-f]+$/i.test(trimmed)) {
    throw new Error('Fixed prefix must contain hexadecimal digits only.');
  }

  const digits = trimmed.toLowerCase().startsWith('0x') ? trimmed.slice(2) : trimmed;
  if (digits.length > Math.ceil(bits / 4)) {
    throw new Error(`Fixed prefix must fit within the selected ${bits}-bit leak size.`);
  }
  const parsed = BigInt(`0x${digits}`);
  const limit = 1n << BigInt(bits);
  if (parsed >= limit) {
    throw new Error(`Fixed prefix must fit within the selected ${bits}-bit leak size.`);
  }
  return parsed;
}
