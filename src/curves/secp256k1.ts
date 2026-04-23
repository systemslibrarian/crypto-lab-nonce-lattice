import { secp256k1 } from '@noble/curves/secp256k1';

import type { CurveContext } from '../types';

export const secp256k1Curve: CurveContext = {
  id: 'secp256k1',
  label: 'secp256k1',
  order: secp256k1.CURVE.n,
  bits: secp256k1.CURVE.nBitLength ?? secp256k1.CURVE.n.toString(2).length,
  orderBytes: secp256k1.CURVE.nByteLength ?? Math.ceil((secp256k1.CURVE.nBitLength ?? secp256k1.CURVE.n.toString(2).length) / 8),
  lowS: true,
  Point: secp256k1.Point,
  getPublicKey: secp256k1.getPublicKey,
};