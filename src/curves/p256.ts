// @noble/curves v2 dropped the per-curve `./p256` subpath; the NIST curves
// (P-256/384/521) are now published together from `./nist.js`. secp256k1 keeps
// its own subpath.
import { p256 } from '@noble/curves/nist.js';

import type { CurveContext } from '../types';

// v2 removed the `CURVE` descriptor object; the scalar field moved to `Point.Fn`,
// where ORDER/BITS/BYTES carry the former CURVE.n / nBitLength / nByteLength.
export const p256Curve: CurveContext = {
  id: 'p256',
  label: 'P-256',
  order: p256.Point.Fn.ORDER,
  bits: p256.Point.Fn.BITS,
  orderBytes: p256.Point.Fn.BYTES,
  lowS: false,
  Point: p256.Point,
  getPublicKey: p256.getPublicKey,
};
