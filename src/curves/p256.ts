import { p256 } from '@noble/curves/p256';

import type { CurveContext } from '../types';

export const p256Curve: CurveContext = {
  id: 'p256',
  label: 'P-256',
  order: p256.CURVE.n,
  bits: p256.CURVE.nBitLength ?? p256.CURVE.n.toString(2).length,
  orderBytes: p256.CURVE.nByteLength ?? Math.ceil((p256.CURVE.nBitLength ?? p256.CURVE.n.toString(2).length) / 8),
  lowS: false,
  Point: p256.Point,
  getPublicKey: p256.getPublicKey,
};