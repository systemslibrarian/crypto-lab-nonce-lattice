import { fraction, type ColumnScales } from '../lattice/matrix';
import { centeredKnownNonce, centeredLsbQuotient } from '../crypto/biased-nonce';
import { centerMod, invert, mod, pow2 } from '../crypto/modular';
import type { CurveContext, LeakConfig, SignatureRecord } from '../types';

export interface HnpInstance {
  basis: bigint[][];
  embeddedBasis: bigint[][];
  target: bigint[];
  bound: bigint;
  embeddingFactor: bigint;
  basisScales: ColumnScales;
  embeddedScales: ColumnScales;
}

export function buildHnpInstance(signatures: SignatureRecord[], leakConfig: LeakConfig, curve: CurveContext): HnpInstance | null {
  if (signatures.length < 2) {
    return null;
  }
  if (leakConfig.mode === 'rfc6979' || leakConfig.mode === 'fixed-constant') {
    return null;
  }

  const tValues: bigint[] = [];
  const uValues: bigint[] = [];
  let bound = 0n;

  for (const signature of signatures) {
    const inverseS = invert(signature.s, curve.order);
    const alpha = mod(signature.r * inverseS, curve.order);
    const beta = mod(signature.h * inverseS, curve.order);

    if (leakConfig.mode === 'msb' || leakConfig.mode === 'fixed-prefix') {
      const knownLeak = signature.leakedBits;
      if (!knownLeak) {
        return null;
      }
      const tailBits = Math.max(curve.bits - knownLeak.bits, 1);
      const centered = centeredKnownNonce(knownLeak.value, tailBits);
      bound = centered.bound;
      tValues.push(centerMod(alpha, curve.order));
      uValues.push(centerMod(beta - centered.estimate, curve.order));
      continue;
    }

    if (leakConfig.mode === 'lsb') {
      const knownLeak = signature.leakedBits;
      if (!knownLeak) {
        return null;
      }
      const gamma = invert(pow2(knownLeak.bits), curve.order);
      const centered = centeredLsbQuotient(knownLeak.bits, curve);
      bound = centered.bound;
      tValues.push(centerMod(gamma * alpha, curve.order));
      uValues.push(centerMod(gamma * mod(beta - knownLeak.value, curve.order) - centered.center, curve.order));
      continue;
    }
  }

  const sampleCount = signatures.length;
  const basis: bigint[][] = Array.from({ length: sampleCount + 1 }, (_, rowIndex) => {
    if (rowIndex < sampleCount) {
      const row = Array.from({ length: sampleCount + 1 }, () => 0n);
      row[rowIndex] = curve.order;
      return row;
    }
    return [...tValues, bound];
  });

  const target = [...uValues, 0n];
  const embeddingFactor = curve.order * bound;
  const embeddedBasis = [
    ...basis.map((row) => [...row, 0n]),
    [...uValues, 0n, embeddingFactor],
  ];
  const basisScales = Array.from({ length: sampleCount + 1 }, (_value, index) => {
    return index === sampleCount ? fraction(1n, curve.order) : fraction(1n);
  });
  const embeddedScales = Array.from({ length: sampleCount + 2 }, (_value, index) => {
    return index === sampleCount ? fraction(1n, curve.order) : fraction(1n);
  });

  return {
    basis,
    embeddedBasis,
    target,
    bound,
    embeddingFactor,
    basisScales,
    embeddedScales,
  };
}