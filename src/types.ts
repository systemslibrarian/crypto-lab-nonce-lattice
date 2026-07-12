export type CurveName = 'secp256k1' | 'p256';

export type LeakMode = 'rfc6979' | 'msb' | 'lsb' | 'fixed-prefix' | 'fixed-constant';

export type FixedPrefixVariant = 'random-tail' | 'constant-nonce';

export interface AppConfigView {
  curve: CurveName;
  leakMode: LeakMode;
  leakedBits: number;
  signatureCount: number;
  fixedPrefixVariant: FixedPrefixVariant;
  fixedPrefixValue: string;
}

export interface KnownNonceLeak {
  kind: 'msb' | 'lsb' | 'fixed-prefix';
  bits: number;
  value: bigint;
}

export interface CurveContext {
  id: CurveName;
  label: string;
  order: bigint;
  bits: number;
  orderBytes: number;
  lowS: boolean;
  Point: {
    BASE: {
      multiply(scalar: bigint): {
        add(other: unknown): unknown;
        toAffine(): { x: bigint; y: bigint };
        toRawBytes(isCompressed?: boolean): Uint8Array;
      };
    };
    fromHex(hex: Uint8Array | string): {
      add(other: unknown): unknown;
      multiply(scalar: bigint): unknown;
      toAffine(): { x: bigint; y: bigint };
      toRawBytes(isCompressed?: boolean): Uint8Array;
    };
  };
  getPublicKey(secretKey: Uint8Array, isCompressed?: boolean): Uint8Array;
}

export interface LeakConfig {
  mode: LeakMode;
  bits: number;
  fixedPrefixValue?: bigint;
  fixedPrefixVariant?: FixedPrefixVariant;
}

export interface GeneratedNonce {
  k: bigint;
  knownLeak: KnownNonceLeak | null;
  leakedLabel: string;
}

export type NonceGenerator = (digest: Uint8Array, sampleIndex: number, attempt: number) => GeneratedNonce;

export interface SignatureRecord {
  index: number;
  message: string;
  digest: Uint8Array;
  h: bigint;
  r: bigint;
  s: bigint;
  k: bigint;
  leakedBits: KnownNonceLeak | null;
  leakedLabel: string;
  publicKey: Uint8Array;
  signatureBytes: Uint8Array;
}

export interface AttackTrace {
  mode: 'algebra' | 'embedding' | 'babai';
  diagnostics: string[];
  target?: bigint[];
  basisBefore?: bigint[][];
  basisAfter?: bigint[][];
  reducedLengths?: bigint[];
  /** Index (into basisAfter) of the reduced row whose secret coordinate revealed d.
   *  For 'babai' this is the last (embedding/target) row of the reduced CVP basis. */
  winningRowIndex?: number;
  /** The row[len-2] entry of the winning short vector: secretCoordinate = ±d · bound. */
  secretCoordinate?: bigint;
  /** The HNP scaling bound B; secretCoordinate / bound (mod n) = the recovered scalar. */
  bound?: bigint;
  /** The scalar that secretCoordinate / bound resolved to (equals d on success). */
  recoveredScalar?: bigint;
  /** The two-signature nonce-reuse worked derivation, populated only in 'algebra' mode. */
  algebra?: AlgebraDerivation;
}

/** Step-by-step numbers for the PS3-style repeated-nonce recovery, so the UI can
 *  show the actual arithmetic (k, then d) with the real r/s/h values. */
export interface AlgebraDerivation {
  r: bigint;
  h1: bigint;
  h2: bigint;
  s1: bigint;
  s2: bigint;
  k: bigint;
  d: bigint;
}

export interface RecoveryResult {
  recoveredKey: bigint | null;
  matches: boolean;
  trace: AttackTrace;
}