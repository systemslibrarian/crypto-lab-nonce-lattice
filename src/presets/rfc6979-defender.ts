import { Preset } from './index';

export const rfc6979_defender: Preset = {
  name: 'rfc6979-defender',
  curve: 'secp256k1',
  mode: 'rfc6979',
  signatureCount: 8,
  leakedBits: 0,
  seed: 'fixture-seed-6',
  expectedResult: 'no-recovery',
  runtime: 'fast',
  explanation: 'RFC6979 deterministic nonce, secp256k1, defender mode.',
  realityLabel: 'Defender Mode',
};
