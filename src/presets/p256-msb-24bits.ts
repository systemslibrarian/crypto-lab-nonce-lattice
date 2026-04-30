import { Preset } from './index';

export const p256_msb_24bits: Preset = {
  name: 'p256-msb-24bits',
  curve: 'p256',
  mode: 'msb',
  signatureCount: 8,
  leakedBits: 24,
  seed: 'fixture-seed-4',
  expectedResult: 'demo-key',
  runtime: 'fast',
  explanation: 'MSB 24 bits leaked, p256, known-good demo.',
  realityLabel: 'Educational Leakage Model',
};
