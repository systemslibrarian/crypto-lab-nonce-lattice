import { buildHnpInstance } from './hnp-builder';
import { babaiNearestPlane } from '../lattice/babai';
import { lllReduce } from '../lattice/lll';
import { absBigInt, invert, mod } from '../crypto/modular';
import type { CurveContext, LeakConfig, RecoveryResult, SignatureRecord } from '../types';

function publicKeysMatch(candidate: bigint, expectedPublicKey: Uint8Array, curve: CurveContext): boolean {
  const keyBytes = new Uint8Array(candidate.toString(16).padStart(curve.orderBytes * 2, '0').match(/.{1,2}/g)?.map((pair) => Number.parseInt(pair, 16)) ?? []);
  const derived = curve.getPublicKey(keyBytes, false);
  if (derived.length !== expectedPublicKey.length) {
    return false;
  }
  return derived.every((value, index) => value === expectedPublicKey[index]);
}

function recoverFromRepeatedNonce(signatures: SignatureRecord[], curve: CurveContext): bigint | null {
  for (let i = 0; i < signatures.length; i += 1) {
    for (let j = i + 1; j < signatures.length; j += 1) {
      const left = signatures[i];
      const right = signatures[j];
      if (left.r !== right.r || left.s === right.s) {
        continue;
      }
      const k = mod((left.h - right.h) * invert(left.s - right.s, curve.order), curve.order);
      const d = mod((left.s * k - left.h) * invert(left.r, curve.order), curve.order);
      if (publicKeysMatch(d, left.publicKey, curve)) {
        return d;
      }
    }
  }
  return null;
}

function extractEmbeddingCandidates(reducedBasis: bigint[][], bound: bigint, embeddingFactor: bigint, curve: CurveContext): bigint[] {
  const candidates = new Set<bigint>();
  for (const row of reducedBasis) {
    const tail = row[row.length - 1];
    if (absBigInt(tail) !== embeddingFactor) {
      continue;
    }
    const secretCoordinate = row[row.length - 2];
    if (secretCoordinate % bound !== 0n) {
      continue;
    }
    candidates.add(mod(secretCoordinate / bound, curve.order));
    candidates.add(mod(-secretCoordinate / bound, curve.order));
  }
  return [...candidates];
}

export function recoverKey(signatures: SignatureRecord[], leakConfig: LeakConfig, curve: CurveContext): RecoveryResult {
  const repeatedNonce = recoverFromRepeatedNonce(signatures, curve);
  if (repeatedNonce !== null) {
    return {
      recoveredKey: repeatedNonce,
      matches: publicKeysMatch(repeatedNonce, signatures[0].publicKey, curve),
      trace: {
        mode: 'algebra',
        diagnostics: ['Recovered from nonce reuse using two signatures with identical r.'],
      },
    };
  }

  const instance = buildHnpInstance(signatures, leakConfig, curve);
  if (!instance) {
    return {
      recoveredKey: null,
      matches: false,
      trace: {
        mode: 'embedding',
        diagnostics: ['Current leak mode does not yield an HNP lattice instance.'],
      },
    };
  }

  let embeddedReduced;
  try {
    embeddedReduced = lllReduce(instance.embeddedBasis, undefined, instance.embeddedScales);
  } catch (error) {
    return {
      recoveredKey: null,
      matches: false,
      trace: {
        mode: 'embedding',
        diagnostics: [
          error instanceof Error ? error.message : 'LLL reduction failed.',
          `Parameters: N=${signatures.length}, leaked bits=${leakConfig.bits}, curve=${curve.label}.`,
        ],
      },
    };
  }
  const embeddedCandidates = extractEmbeddingCandidates(
    embeddedReduced.basis,
    instance.bound,
    instance.embeddingFactor,
    curve,
  );
  for (const candidate of embeddedCandidates) {
    if (publicKeysMatch(candidate, signatures[0].publicKey, curve)) {
      return {
        recoveredKey: candidate,
        matches: true,
        trace: {
          mode: 'embedding',
          diagnostics: ['Recovered from a short vector in the embedded HNP lattice.'],
          basisBefore: instance.embeddedBasis,
          basisAfter: embeddedReduced.basis,
          reducedLengths: embeddedReduced.lengths,
        },
      };
    }
  }

  const cvpReduced = lllReduce(instance.basis, undefined, instance.basisScales);
  const closest = babaiNearestPlane(cvpReduced.basis, instance.target, instance.basisScales);
  const secretCoordinate = closest.closestVector[closest.closestVector.length - 1];
  const candidate = secretCoordinate % instance.bound === 0n ? mod(secretCoordinate / instance.bound, curve.order) : null;

  if (candidate !== null && publicKeysMatch(candidate, signatures[0].publicKey, curve)) {
    return {
      recoveredKey: candidate,
      matches: true,
      trace: {
        mode: 'babai',
        diagnostics: ['Recovered from Babai nearest-plane on the reduced CVP basis.'],
        basisBefore: instance.basis,
        basisAfter: cvpReduced.basis,
        reducedLengths: cvpReduced.lengths,
        target: instance.target,
      },
    };
  }

  return {
    recoveredKey: null,
    matches: false,
    trace: {
      mode: 'babai',
      diagnostics: [
        `LLL did not reveal a valid key at leak mode ${leakConfig.mode}.`,
        `Parameters: N=${signatures.length}, leaked bits=${leakConfig.bits}, curve=${curve.label}.`,
      ],
      basisBefore: instance.basis,
      basisAfter: cvpReduced.basis,
      reducedLengths: cvpReduced.lengths,
      target: instance.target,
    },
  };
}