import { secp256k1 as nobleSecp256k1 } from '@noble/curves/secp256k1.js';

import type { CurveContext } from '../types';

// @noble/curves v2 removed the `CURVE` descriptor object; the scalar field is now
// reached through `Point.Fn`, where ORDER/BITS/BYTES carry what CURVE.n /
// CURVE.nBitLength / CURVE.nByteLength used to. Same numbers, new home.
export const secp256k1Curve: CurveContext = {
  id: 'secp256k1',
  label: 'secp256k1',
  order: nobleSecp256k1.Point.Fn.ORDER,
  bits: nobleSecp256k1.Point.Fn.BITS,
  orderBytes: nobleSecp256k1.Point.Fn.BYTES,
  lowS: true,
  Point: nobleSecp256k1.Point,
  getPublicKey: nobleSecp256k1.getPublicKey,
};

// Tests import the curve context under the bare `secp256k1` name; the app code
// imports it as `secp256k1Curve`. Export both so neither import breaks.
export const secp256k1 = secp256k1Curve;
