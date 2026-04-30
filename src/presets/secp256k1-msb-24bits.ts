import { Preset } from './index';

export const secp256k1_msb_24bits: Preset = {
  name: 'secp256k1-msb-24bits',
  curve: 'secp256k1',
  mode: 'msb',
  signatureCount: 8,
  leakedBits: 24,
  seed: 'fixture-seed-1',
  expectedResult: 'demo-key',
  runtime: 'fast',
  explanation: 'MSB 24 bits leaked, secp256k1, known-good demo.',
  realityLabel: 'Educational Leakage Model',
};
