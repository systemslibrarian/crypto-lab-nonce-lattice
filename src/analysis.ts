import { recoverKey } from './attacks/recover-key';
import { createNonceGenerator } from './crypto/biased-nonce';
import { sign, verify } from './crypto/ecdsa';
import { bigIntToBytes, randomScalar } from './crypto/modular';
import { p256Curve } from './curves/p256';
import { secp256k1Curve } from './curves/secp256k1';
import type { AppConfigView, CurveContext, LeakConfig, SignatureRecord } from './types';

const curveMap: Record<string, CurveContext> = {
  secp256k1: secp256k1Curve,
  p256: p256Curve,
};

export interface AnalysisBundle {
  curve: CurveContext;
  privateKey: bigint;
  publicKey: Uint8Array;
  signatures: SignatureRecord[];
  recovery: ReturnType<typeof recoverKey>;
  verificationPassed: boolean;
  byteMatch: boolean;
  elapsedMs: number;
}

export interface AnalysisRequest {
  requestId: number;
  config: AppConfigView;
}

export interface AnalysisResponse {
  requestId: number;
  analysis?: AnalysisBundle;
  error?: string;
}

function parseHexScalar(value: string): bigint | undefined {
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }
  return BigInt(`0x${trimmed.replace(/^0x/, '')}`);
}

function buildLeakConfig(config: AppConfigView): LeakConfig {
  return {
    mode: config.leakMode,
    bits: config.leakedBits,
    fixedPrefixVariant: config.fixedPrefixVariant,
    fixedPrefixValue: parseHexScalar(config.fixedPrefixValue),
  };
}

function now(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

export function runAnalysis(config: AppConfigView): AnalysisBundle {
  const startedAt = now();
  const curve = curveMap[config.curve];
  const privateKey = randomScalar(curve);
  const leakConfig = buildLeakConfig(config);
  const generator = createNonceGenerator(leakConfig, curve, privateKey);
  const signatures = Array.from({ length: config.signatureCount }, (_value, index) => {
    return sign(privateKey, `nonce-lattice sample ${index + 1}`, curve, leakConfig, index, generator);
  });
  const verificationPassed = signatures.every((signature) => verify(signature.publicKey, signature.digest, signature.r, signature.s, curve));
  const recovery = recoverKey(signatures, leakConfig, curve);
  const recoveredBytes = recovery.recoveredKey === null ? null : bigIntToBytes(recovery.recoveredKey, curve.orderBytes);
  const actualBytes = bigIntToBytes(privateKey, curve.orderBytes);
  const byteMatch = recoveredBytes !== null && recoveredBytes.every((value, index) => value === actualBytes[index]);

  return {
    curve,
    privateKey,
    publicKey: signatures[0]?.publicKey ?? curve.getPublicKey(actualBytes, false),
    signatures,
    recovery,
    verificationPassed,
    byteMatch,
    elapsedMs: Math.round(now() - startedAt),
  };
}