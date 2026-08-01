import { describe, it, expect } from 'vitest';
import { presets, getPreset } from '../src/presets';
import { runAnalysis } from '../src/analysis';
import type { AppConfigView, LeakConfig } from '../src/types';

describe('Recovery Presets', () => {
  it('loads all known-good presets', () => {
    for (const preset of presets) {
      expect(getPreset(preset.name)).toBeDefined();
      expect(typeof preset.curve).toBe('string');
      expect(typeof preset.mode).toBe('string');
      expect(typeof preset.signatureCount).toBe('number');
      expect(typeof preset.leakedBits).toBe('number');
      expect(typeof preset.explanation).toBe('string');
      expect(typeof preset.realityLabel).toBe('string');
    }
  });
});

/**
 * The shape assertions above never touched the presets' central claim: that a preset
 * labelled `expectedResult: 'demo-key'` recovers the key. It did not. Every lattice
 * preset shipped 8 signatures at 24 leaked bits -- 192 bits of leakage against a
 * 256-bit curve order, below the information floor -- and recovered nothing on any
 * run. These tests push each preset through the real pipeline so the label cannot
 * drift away from the behaviour again.
 */
describe('every preset does what its expectedResult says', () => {
  const toConfig = (preset: (typeof presets)[number]): AppConfigView => ({
    curve: preset.curve as AppConfigView['curve'],
    leakMode: (preset.mode === 'repeated' ? 'fixed-constant' : preset.mode) as LeakConfig['mode'],
    leakedBits: preset.leakedBits,
    signatureCount: preset.signatureCount,
    fixedPrefixVariant: preset.mode === 'repeated' ? 'constant-nonce' : 'random-tail',
    fixedPrefixValue: '',
  });

  for (const preset of presets) {
    it(`${preset.name} -> ${preset.expectedResult}`, () => {
      const analysis = runAnalysis(toConfig(preset));

      // Whatever the outcome, the signatures under attack must be genuine ECDSA.
      expect(analysis.verificationPassed).toBe(true);

      if (preset.expectedResult === 'demo-key') {
        expect(analysis.recovery.recoveredKey).toBe(analysis.privateKey);
        expect(analysis.byteMatch).toBe(true);
      } else {
        expect(analysis.recovery.recoveredKey).toBeNull();
        expect(analysis.byteMatch).toBe(false);
      }
    });
  }
});
