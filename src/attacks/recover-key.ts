import { buildHnpInstance } from './hnp-builder';
import { babaiNearestPlane } from '../lattice/babai';
import { lllReduce } from '../lattice/lll';
import { absBigInt, invert, mod } from '../crypto/modular';
import type { AlgebraDerivation, CurveContext, LeakConfig, RecoveryResult, SignatureRecord } from '../types';

function publicKeysMatch(candidate: bigint, expectedPublicKey: Uint8Array, curve: CurveContext): boolean {
  const keyBytes = new Uint8Array(candidate.toString(16).padStart(curve.orderBytes * 2, '0').match(/.{1,2}/g)?.map((pair) => Number.parseInt(pair, 16)) ?? []);
  const derived = curve.getPublicKey(keyBytes, false);
  if (derived.length !== expectedPublicKey.length) {
    return false;
  }
  return derived.every((value, index) => value === expectedPublicKey[index]);
}

interface RepeatedNonceHit {
  d: bigint;
  algebra: AlgebraDerivation;
}

function recoverFromRepeatedNonce(signatures: SignatureRecord[], curve: CurveContext): RepeatedNonceHit | null {
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
        return {
          d,
          algebra: { r: left.r, h1: left.h, h2: right.h, s1: left.s, s2: right.s, k, d },
        };
      }
    }
  }
  return null;
}

interface EmbeddingHit {
  scalar: bigint;
  /** Row index into the reduced basis whose secret coordinate divided by bound gave the scalar. */
  rowIndex: number;
  /** The raw row[len-2] entry (= ±d · bound) of the winning short vector. */
  secretCoordinate: bigint;
}

/** Returns every scalar candidate the reduced lattice yields, tagging which reduced
 *  row (and which coordinate of it) each candidate came from. This lets the UI outline
 *  the specific short vector that carried the key and show secretCoordinate / bound = d. */
function extractEmbeddingCandidates(reducedBasis: bigint[][], bound: bigint, embeddingFactor: bigint, curve: CurveContext): EmbeddingHit[] {
  const hits: EmbeddingHit[] = [];
  reducedBasis.forEach((row, rowIndex) => {
    const tail = row[row.length - 1];
    if (absBigInt(tail) !== embeddingFactor) {
      return;
    }
    const secretCoordinate = row[row.length - 2];
    if (secretCoordinate % bound !== 0n) {
      return;
    }
    hits.push({ scalar: mod(secretCoordinate / bound, curve.order), rowIndex, secretCoordinate });
    hits.push({ scalar: mod(-secretCoordinate / bound, curve.order), rowIndex, secretCoordinate });
  });
  return hits;
}

export function recoverKey(signatures: SignatureRecord[], leakConfig: LeakConfig, curve: CurveContext): RecoveryResult {
  const repeatedNonce = recoverFromRepeatedNonce(signatures, curve);
  if (repeatedNonce !== null) {
    return {
      recoveredKey: repeatedNonce.d,
      matches: publicKeysMatch(repeatedNonce.d, signatures[0].publicKey, curve),
      trace: {
        mode: 'algebra',
        diagnostics: ['Recovered from nonce reuse using two signatures with identical r.'],
        algebra: repeatedNonce.algebra,
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
  for (const hit of embeddedCandidates) {
    if (publicKeysMatch(hit.scalar, signatures[0].publicKey, curve)) {
      return {
        recoveredKey: hit.scalar,
        matches: true,
        trace: {
          mode: 'embedding',
          diagnostics: ['Recovered from a short vector in the embedded HNP lattice.'],
          basisBefore: instance.embeddedBasis,
          basisAfter: embeddedReduced.basis,
          reducedLengths: embeddedReduced.lengths,
          winningRowIndex: hit.rowIndex,
          secretCoordinate: hit.secretCoordinate,
          bound: instance.bound,
          recoveredScalar: hit.scalar,
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
        // Babai's closest vector reconstructs the target (last) row; its final
        // coordinate carries d·bound, so mark that row as the winner.
        winningRowIndex: cvpReduced.basis.length - 1,
        secretCoordinate,
        bound: instance.bound,
        recoveredScalar: candidate,
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