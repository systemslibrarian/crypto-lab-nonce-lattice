import { Preset } from './index';

export const repeated_nonce: Preset = {
  name: 'repeated-nonce',
  curve: 'secp256k1',
  mode: 'repeated',
  signatureCount: 2,
  leakedBits: 0,
  seed: 'fixture-seed-5',
  expectedResult: 'demo-key',
  runtime: 'fast',
  explanation: 'Repeated nonce, secp256k1, classic attack.',
  realityLabel: 'Historical / Real-World Failure',
};
