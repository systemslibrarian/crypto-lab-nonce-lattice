import { describe, it, expect } from 'vitest';
import { exportDemo, importDemo } from '../src/app-export';

describe('Serialization', () => {
  it('export/import preserves demo state', () => {
    const fixture = {
      curve: 'secp256k1',
      mode: 'msb',
      publicKey: 'abcdef',
      signatures: [ { r: 1, s: 2 } ],
      messageHashes: ['1234'],
      leakMetadata: { bits: 24 },
      latticeParams: { dim: 2 },
      recoveryDiagnostics: 'ok',
      presetName: 'secp256k1-msb-24bits',
      fixtureSeed: 'seed',
    };
    const json = exportDemo(fixture);
    const state = importDemo(json);
    expect(state).toEqual(fixture);
  });
});
