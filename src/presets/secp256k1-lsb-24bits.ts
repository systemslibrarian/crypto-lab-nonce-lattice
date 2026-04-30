import { Preset } from './index';

export const secp256k1_lsb_24bits: Preset = {
  name: 'secp256k1-lsb-24bits',
  curve: 'secp256k1',
  mode: 'lsb',
  signatureCount: 8,
  leakedBits: 24,
  seed: 'fixture-seed-2',
  expectedResult: 'demo-key',
  runtime: 'fast',
  explanation: 'LSB 24 bits leaked, secp256k1, known-good demo.',
  realityLabel: 'Educational Leakage Model',
};
