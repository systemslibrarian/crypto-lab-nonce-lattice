import { describe, it, expect } from 'vitest';
import { presets, getPreset } from '../src/presets';

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
