import { secp256k1 as nobleSecp256k1 } from '@noble/curves/secp256k1';

import type { CurveContext } from '../types';

export const secp256k1Curve: CurveContext = {
  id: 'secp256k1',
  label: 'secp256k1',
  order: nobleSecp256k1.CURVE.n,
  bits: nobleSecp256k1.CURVE.nBitLength ?? nobleSecp256k1.CURVE.n.toString(2).length,
  orderBytes: nobleSecp256k1.CURVE.nByteLength ?? Math.ceil((nobleSecp256k1.CURVE.nBitLength ?? nobleSecp256k1.CURVE.n.toString(2).length) / 8),
  lowS: true,
  Point: nobleSecp256k1.Point,
  getPublicKey: nobleSecp256k1.getPublicKey,
};

// Tests import the curve context under the bare `secp256k1` name; the app code
// imports it as `secp256k1Curve`. Export both so neither import breaks.
export const secp256k1 = secp256k1Curve;
