import type { AppConfigView, CurveContext } from './types';

/**
 * The feasibility gauge draws two curves. This module *measures* them.
 *
 * The drawn curves are a model: an information floor (bits × signatures must
 * exceed the secret's entropy) plus a hand-calibrated numerical margin for the
 * demo's floating-point LLL. Nothing on the page ever checked that model
 * against what the attack actually does. A measured sweep does: for one
 * signature count it runs the REAL end-to-end attack — fresh key, fresh
 * signatures, real LLL, real byte-for-byte validation — several times at each
 * of a ladder of leak sizes, and reports the success rate it observed.
 *
 * Two things fall out that the drawn curve cannot show:
 *   - whether the drawn boundary is where the attack's boundary really is, and
 *   - that the boundary is a probabilistic ramp rather than a line: near it the
 *     same configuration recovers the key on some runs and not on others.
 */

/** The lab's leak-size control caps at 32 bits; a ladder cannot exceed it. */
export const MAX_LADDER_BITS = 32;

/**
 * Sweeps run the full attack `TRIALS_PER_LEVEL × levels` times in a worker.
 * Above this many signatures a single run takes tens of seconds (the lattice
 * dimension is signatures + 2), so a sweep would leave the page waiting for
 * minutes. The limit is this page's budget, and the UI says so.
 */
export const MAX_SWEEP_SIGNATURES = 16;

/** Independent runs per ladder rung. Each is a fresh key and fresh signatures. */
export const TRIALS_PER_LEVEL = 3;

/** Rungs below and above ceil(information floor) that the ladder covers. */
const LEVELS_BELOW = 2;
const LEVELS_ABOVE = 3;

/** Minimum leaked bits per signature that keeps bits·signatures above the info floor. */
export function infoFloorBits(signatureCount: number, curve: CurveContext): number {
  return curve.bits / Math.max(signatureCount, 1);
}

/** Practical boundary for this demo's float LLL: info floor plus a numerical margin
 *  that shrinks as more signatures pile on redundant constraints. Calibrated against
 *  the shipped recover-key tests — the default (24 leaked bits × 12 signatures) recovers
 *  reliably and must land above this line, while thin configs (e.g. 24 bits × 3 sigs) do
 *  not, matching the "fails below threshold" unit tests. */
export function practicalBits(signatureCount: number, curve: CurveContext): number {
  const floor = infoFloorBits(signatureCount, curve);
  const margin = 1.5 + 6 / Math.max(signatureCount, 1);
  return floor + margin;
}

export type LadderRefusal =
  /** Leak mode has no leaked-bits axis to sweep (reuse / RFC 6979). */
  | 'no-bit-axis'
  /** Too many signatures for an in-browser sweep. */
  | 'too-many-signatures'
  /** Even the lowest rung above the information floor is past the 32-bit control cap. */
  | 'floor-above-cap';

export interface LadderPlan {
  signatureCount: number;
  curveId: string;
  leakMode: AppConfigView['leakMode'];
  floor: number;
  practical: number;
  /** The leak sizes that will actually be run, ascending. Empty when refused. */
  levels: number[];
  refusal?: LadderRefusal;
}

/**
 * Decide which leak sizes to probe for this configuration — or refuse, with a
 * reason the UI can state. The ladder straddles the information floor so the
 * sweep always includes at least one rung the theory says is impossible, as a
 * control on the rungs it says are not.
 */
export function planLadder(config: AppConfigView, curve: CurveContext): LadderPlan {
  const floor = infoFloorBits(config.signatureCount, curve);
  const practical = practicalBits(config.signatureCount, curve);
  const base: LadderPlan = {
    signatureCount: config.signatureCount,
    curveId: curve.id,
    leakMode: config.leakMode,
    floor,
    practical,
    levels: [],
  };

  if (config.leakMode !== 'msb' && config.leakMode !== 'lsb' && config.leakMode !== 'fixed-prefix') {
    return { ...base, refusal: 'no-bit-axis' };
  }
  if (config.signatureCount > MAX_SWEEP_SIGNATURES) {
    return { ...base, refusal: 'too-many-signatures' };
  }

  const centre = Math.ceil(floor);
  const lo = Math.max(1, centre - LEVELS_BELOW);
  const hi = Math.min(MAX_LADDER_BITS, centre + LEVELS_ABOVE);
  if (lo > MAX_LADDER_BITS) {
    return { ...base, refusal: 'floor-above-cap' };
  }

  const levels: number[] = [];
  for (let bits = lo; bits <= hi; bits += 1) levels.push(bits);
  return { ...base, levels };
}

export interface ProbeResult {
  bits: number;
  trials: number;
  recovered: number;
  /** Total wall-clock milliseconds spent on this rung's runs. */
  elapsedMs: number;
}

export interface SweepSummary {
  /** Lowest probed leak size whose measured success rate reached 50%. */
  measuredBits: number | null;
  /** The success rate observed at `measuredBits`. */
  measuredRate: number | null;
  /** Rungs where the attack recovered at least once but not every time. */
  rampBits: number[];
  /** Signed gap: measured boundary minus the drawn practical curve, in bits. */
  gapToPractical: number | null;
  /** Whether any rung strictly below the information floor recovered the key.
   *  This happens near the floor: the extractor tries every candidate scalar the
   *  reduced basis offers, so a deficit of a bit or two can still be closed. */
  recoveredBelowFloor: boolean;
  totalRuns: number;
  totalRecovered: number;
}

/** Reduce a completed ladder to the statements the panel is allowed to make. */
export function summarizeSweep(plan: LadderPlan, probes: ProbeResult[]): SweepSummary {
  const ordered = [...probes].sort((a, b) => a.bits - b.bits);
  let measuredBits: number | null = null;
  let measuredRate: number | null = null;
  const rampBits: number[] = [];
  let recoveredBelowFloor = false;
  let totalRuns = 0;
  let totalRecovered = 0;

  for (const probe of ordered) {
    totalRuns += probe.trials;
    totalRecovered += probe.recovered;
    const rate = probe.trials > 0 ? probe.recovered / probe.trials : 0;
    if (probe.recovered > 0 && probe.recovered < probe.trials) rampBits.push(probe.bits);
    if (probe.recovered > 0 && probe.bits < plan.floor) recoveredBelowFloor = true;
    if (measuredBits === null && rate >= 0.5) {
      measuredBits = probe.bits;
      measuredRate = rate;
    }
  }

  return {
    measuredBits,
    measuredRate,
    rampBits,
    gapToPractical: measuredBits === null ? null : measuredBits - plan.practical,
    recoveredBelowFloor,
    totalRuns,
    totalRecovered,
  };
}

// ── Worker protocol ──

export interface SweepRequest {
  sweepId: number;
  config: AppConfigView;
  levels: number[];
  trials: number;
}

export interface SweepProgress {
  sweepId: number;
  probe?: ProbeResult;
  done?: boolean;
  error?: string;
}
