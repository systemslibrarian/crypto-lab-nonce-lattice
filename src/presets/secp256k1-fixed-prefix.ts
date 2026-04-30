import { Preset } from './index';

export const secp256k1_fixed_prefix: Preset = {
  name: 'secp256k1-fixed-prefix',
  curve: 'secp256k1',
  mode: 'fixed-prefix',
  signatureCount: 8,
  leakedBits: 16,
  seed: 'fixture-seed-3',
  expectedResult: 'demo-key',
  runtime: 'fast',
  explanation: 'Fixed prefix leakage, secp256k1, known-good demo.',
  realityLabel: 'Toy Model',
};
