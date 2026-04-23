export type CurveName = 'secp256k1' | 'p256';

export type LeakMode = 'rfc6979' | 'msb' | 'lsb' | 'fixed-prefix' | 'fixed-constant';

export type FixedPrefixVariant = 'random-tail' | 'constant-nonce';

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
}

export interface RecoveryResult {
  recoveredKey: bigint | null;
  matches: boolean;
  trace: AttackTrace;
}