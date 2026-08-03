import { describe, expect, it } from 'vitest';
import { runAnalysis } from '../src/analysis';
import {
  MAX_SWEEP_SIGNATURES,
  infoFloorBits,
  planLadder,
  practicalBits,
  summarizeSweep,
  type ProbeResult,
} from '../src/boundary';
import { secp256k1Curve } from '../src/curves/secp256k1';
import type { AppConfigView } from '../src/types';

const base: AppConfigView = {
  curve: 'secp256k1',
  leakMode: 'msb',
  leakedBits: 24,
  signatureCount: 12,
  fixedPrefixVariant: 'random-tail',
  fixedPrefixValue: '',
};

describe('ladder planning', () => {
  it('straddles the information floor so every sweep includes an impossible rung', () => {
    const plan = planLadder({ ...base, signatureCount: 12 }, secp256k1Curve);
    expect(plan.refusal).toBeUndefined();
    const floor = infoFloorBits(12, secp256k1Curve);
    expect(plan.floor).toBeCloseTo(floor, 6);
    expect(plan.practical).toBeCloseTo(practicalBits(12, secp256k1Curve), 6);
    expect(plan.levels.length).toBeGreaterThan(1);
    expect(Math.min(...plan.levels)).toBeLessThan(floor);
    expect(Math.max(...plan.levels)).toBeGreaterThan(floor);
    // Levels must be a strictly ascending run of integers inside the control range.
    for (let i = 1; i < plan.levels.length; i += 1) {
      expect(plan.levels[i]).toBe(plan.levels[i - 1] + 1);
    }
    expect(Math.max(...plan.levels)).toBeLessThanOrEqual(32);
    expect(Math.min(...plan.levels)).toBeGreaterThanOrEqual(1);
  });

  it('refuses a leak mode with no bits axis', () => {
    expect(planLadder({ ...base, leakMode: 'rfc6979' }, secp256k1Curve).refusal).toBe('no-bit-axis');
    expect(planLadder({ ...base, leakMode: 'fixed-constant' }, secp256k1Curve).refusal).toBe(
      'no-bit-axis',
    );
  });

  it('refuses signature counts whose runs would take minutes in a browser', () => {
    expect(
      planLadder({ ...base, signatureCount: MAX_SWEEP_SIGNATURES + 1 }, secp256k1Curve).refusal,
    ).toBe('too-many-signatures');
    expect(
      planLadder({ ...base, signatureCount: MAX_SWEEP_SIGNATURES }, secp256k1Curve).refusal,
    ).toBeUndefined();
  });

  it('refuses columns whose information floor is past the 32-bit leak control', () => {
    // 256 / 4 = 64 bits per signature; nothing reachable clears the floor.
    const plan = planLadder({ ...base, signatureCount: 4 }, secp256k1Curve);
    expect(plan.refusal).toBe('floor-above-cap');
    expect(plan.levels).toEqual([]);
  });
});

describe('sweep summary', () => {
  const plan = planLadder({ ...base, signatureCount: 12 }, secp256k1Curve);

  const probe = (bits: number, recovered: number): ProbeResult => ({
    bits,
    trials: 3,
    recovered,
    elapsedMs: 1,
  });

  it('takes the lowest rung reaching a 50% success rate as the measured boundary', () => {
    const s = summarizeSweep(plan, [probe(20, 0), probe(21, 1), probe(22, 2), probe(23, 3)]);
    expect(s.measuredBits).toBe(22);
    expect(s.measuredRate).toBeCloseTo(2 / 3, 6);
    expect(s.totalRuns).toBe(12);
    expect(s.totalRecovered).toBe(6);
  });

  it('reports the ramp — rungs that recovered sometimes but not always', () => {
    const s = summarizeSweep(plan, [probe(20, 0), probe(21, 1), probe(22, 2), probe(23, 3)]);
    expect(s.rampBits).toEqual([21, 22]);
  });

  it('reports no boundary rather than guessing one when nothing reached 50%', () => {
    const s = summarizeSweep(plan, [probe(20, 0), probe(21, 0), probe(22, 1)]);
    expect(s.measuredBits).toBeNull();
    expect(s.gapToPractical).toBeNull();
  });

  it('flags a recovery below the information floor as suspect', () => {
    const belowFloor = Math.floor(plan.floor) - 1;
    expect(summarizeSweep(plan, [probe(belowFloor, 1)]).recoveredBelowFloor).toBe(true);
    expect(summarizeSweep(plan, [probe(Math.ceil(plan.floor) + 1, 3)]).recoveredBelowFloor).toBe(
      false,
    );
  });

  it('signs the gap against the drawn practical curve', () => {
    const below = summarizeSweep(plan, [probe(22, 3)]);
    expect(below.gapToPractical).toBeLessThan(0);
    const above = summarizeSweep(plan, [probe(30, 3)]);
    expect(above.gapToPractical).toBeGreaterThan(0);
  });
});

describe('the sweep measures the same attack the page runs', () => {
  it('a rung well above the floor really recovers, and one well below really does not', () => {
    // These are the runs a sweep performs, unchanged: full key generation, real
    // signatures, real LLL, byte-for-byte validation.
    const strong = runAnalysis({ ...base, signatureCount: 10, leakedBits: 30 });
    expect(strong.verificationPassed).toBe(true);
    expect(strong.byteMatch).toBe(true);

    // 10 signatures x 20 bits = 200 bits, well under the 256-bit secret.
    const starved = runAnalysis({ ...base, signatureCount: 10, leakedBits: 20 });
    expect(starved.verificationPassed).toBe(true);
    expect(starved.byteMatch).toBe(false);
    expect(starved.recovery.recoveredKey).toBeNull();
  }, 120_000);
});
