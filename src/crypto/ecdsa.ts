import { createNonceGenerator } from './biased-nonce';
import {
  bigIntToBytes,
  compactSignature,
  hashToScalar,
  invert,
  mod,
  randomScalar,
  truncateToOrder,
  utf8ToBytes,
} from './modular';
import type { CurveContext, LeakConfig, NonceGenerator, SignatureRecord } from '../types';

export function verify(publicKey: Uint8Array, digest: Uint8Array, r: bigint, s: bigint, curve: CurveContext): boolean {
  if (r <= 0n || r >= curve.order || s <= 0n || s >= curve.order) {
    return false;
  }
  const point = curve.Point.fromHex(publicKey);
  const hashScalar = truncateToOrder(digest, curve);
  const w = invert(s, curve.order);
  const u1 = mod(hashScalar * w, curve.order);
  const u2 = mod(r * w, curve.order);
  const resultPoint = curve.Point.BASE.multiply(u1).add(point.multiply(u2) as never) as {
    toAffine(): { x: bigint };
  };
  const affine = resultPoint.toAffine();
  return mod(affine.x, curve.order) === r;
}

function signDigest(privateKey: bigint, digest: Uint8Array, curve: CurveContext, nonceGenerator: NonceGenerator, sampleIndex: number): SignatureRecord {
  const publicKey = curve.getPublicKey(bigIntToBytes(privateKey, curve.orderBytes), false);
  const h = truncateToOrder(digest, curve);
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const nonce = nonceGenerator(digest, sampleIndex, attempt);
    const k = nonce.k === 0n ? randomScalar(curve) : nonce.k;
    const point = curve.Point.BASE.multiply(k);
    const affine = point.toAffine();
    const r = mod(affine.x, curve.order);
    if (r === 0n) {
      continue;
    }
    let s = mod(invert(k, curve.order) * mod(h + r * privateKey, curve.order), curve.order);
    if (s === 0n) {
      continue;
    }
    return {
      index: sampleIndex,
      message: '',
      digest,
      h,
      r,
      s,
      k,
      leakedBits: nonce.knownLeak,
      leakedLabel: nonce.leakedLabel,
      publicKey,
      signatureBytes: compactSignature(r, s, curve),
    };
  }
  throw new Error('Failed to derive a valid signature');
}

export function sign(privateKey: bigint, message: string, curve: CurveContext, leakConfig: LeakConfig, sampleIndex: number, nonceGenerator?: NonceGenerator): SignatureRecord {
  const messageBytes = utf8ToBytes(message);
  const { digest } = hashToScalar(messageBytes, curve);
  const generator = nonceGenerator ?? createNonceGenerator(leakConfig, curve, privateKey);
  const signed = signDigest(privateKey, digest, curve, generator, sampleIndex);
  return {
    ...signed,
    message,
  };
}