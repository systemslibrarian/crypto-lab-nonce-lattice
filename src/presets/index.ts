// Preset system for known-good demo configurations
export interface Preset {
  name: string;
  curve: string;
  mode: string;
  signatureCount: number;
  leakedBits: number;
  seed?: string;
  expectedResult: string;
  runtime: string;
  explanation: string;
  realityLabel: string;
}

import { secp256k1_msb_24bits } from './secp256k1-msb-24bits';
import { secp256k1_lsb_24bits } from './secp256k1-lsb-24bits';
import { secp256k1_fixed_prefix } from './secp256k1-fixed-prefix';
import { p256_msb_24bits } from './p256-msb-24bits';
import { repeated_nonce } from './repeated-nonce';
import { rfc6979_defender } from './rfc6979-defender';

export const presets: Preset[] = [
  secp256k1_msb_24bits,
  secp256k1_lsb_24bits,
  secp256k1_fixed_prefix,
  p256_msb_24bits,
  repeated_nonce,
  rfc6979_defender,
];

export function getPreset(name: string): Preset | undefined {
  return presets.find(p => p.name === name);
}
