import { glossTerm } from './lattice-view';
import type { AppConfigView, CurveContext } from '../types';

/**
 * Live feasibility indicator for the HNP lattice attack.
 *
 * The relationship being visualised is the headline promise of the demo: how much
 * per-signature nonce leakage, across how many signatures, is enough to recover d.
 *
 * Honest model (documented on screen, not hidden):
 *  - Information floor: to pin a 256-bit secret the attacker must collect more leaked
 *    bits than the secret's entropy, i.e. bits · signatures must clear ~curve.bits with
 *    a small constant margin. Below that floor the lattice is under-determined and
 *    recovery is impossible no matter how good the reduction.
 *  - Reduction margin: this demo's LLL/Babai use floating-point Gram-Schmidt, so it
 *    needs headroom above the pure information floor to survive numerical error. That is
 *    why the practical boundary sits above the theoretical one.
 *
 * We DO NOT claim a specific run will succeed — we plot the known boundary curve and a
 * marker for the current config, and label which region it falls in. Actual success is
 * still decided by the real recovery run, not this gauge.
 */

/** Minimum leaked bits per signature that keeps bits·signatures above the info floor. */
function infoFloorBits(signatureCount: number, curve: CurveContext): number {
  return curve.bits / Math.max(signatureCount, 1);
}

/** Practical boundary for this demo's float LLL: info floor plus a numerical margin
 *  that shrinks as more signatures pile on redundant constraints. Calibrated against
 *  the shipped recover-key tests — the default (24 leaked bits × 12 signatures) recovers
 *  reliably and must land above this line, while thin configs (e.g. 24 bits × 3 sigs) do
 *  not, matching the "fails below threshold" unit tests. */
function practicalBits(signatureCount: number, curve: CurveContext): number {
  const floor = infoFloorBits(signatureCount, curve);
  const margin = 1.5 + 6 / Math.max(signatureCount, 1);
  return floor + margin;
}

type Region = 'infeasible' | 'marginal' | 'feasible';

function classify(config: AppConfigView, curve: CurveContext): Region {
  const bits = config.leakedBits;
  const floor = infoFloorBits(config.signatureCount, curve);
  const practical = practicalBits(config.signatureCount, curve);
  if (bits < floor) return 'infeasible';
  if (bits < practical) return 'marginal';
  return 'feasible';
}

const PLOT_W = 320;
const PLOT_H = 180;
const PAD_L = 34;
const PAD_B = 24;
const PAD_T = 10;
const PAD_R = 10;
const MAX_SIGS = 32;
const MAX_BITS = 32;

function xForSigs(sigs: number): number {
  return PAD_L + ((sigs - 2) / (MAX_SIGS - 2)) * (PLOT_W - PAD_L - PAD_R);
}
function yForBits(bits: number): number {
  const clamped = Math.max(0, Math.min(MAX_BITS, bits));
  return PLOT_H - PAD_B - (clamped / MAX_BITS) * (PLOT_H - PAD_T - PAD_B);
}

function curvePath(fn: (sigs: number) => number): string {
  const points: string[] = [];
  for (let sigs = 2; sigs <= MAX_SIGS; sigs += 1) {
    points.push(`${xForSigs(sigs).toFixed(1)},${yForBits(fn(sigs)).toFixed(1)}`);
  }
  return points.map((p, i) => (i === 0 ? `M ${p}` : `L ${p}`)).join(' ');
}

export function renderFeasibility(config: AppConfigView, curve: CurveContext): string {
  const region = classify(config, curve);
  const mx = xForSigs(Math.max(2, Math.min(MAX_SIGS, config.signatureCount)));
  const my = yForBits(config.leakedBits);

  const floorPath = curvePath((s) => infoFloorBits(s, curve));
  const practicalPath = curvePath((s) => practicalBits(s, curve));

  const regionLabel =
    region === 'feasible'
      ? 'Above the demo’s recovery boundary — expect the lattice to reveal d.'
      : region === 'marginal'
        ? 'In the numerical margin — enough information in theory, but this demo’s float-LLL may miss it. Add signatures or bits to cross the line.'
        : 'Below the information floor — the lattice is under-determined; no amount of reduction can recover d here.';

  const bitOnly = config.leakMode === 'msb' || config.leakMode === 'lsb' || config.leakMode === 'fixed-prefix';
  const note = bitOnly
    ? ''
    : '<p class="muted">This gauge tracks bit-leakage modes (MSB / LSB / fixed-prefix). Nonce-reuse and RFC 6979 do not use the leaked-bits axis.</p>';

  return `
    <section class="panel feasibility-panel">
      <div class="panel-heading">
        <div>
          <p class="eyebrow">Leakage vs Feasibility</p>
          <h2>Can this configuration recover the key?</h2>
        </div>
        <span class="feasibility-badge ${region}">${
          region === 'feasible' ? 'FEASIBLE' : region === 'marginal' ? 'MARGINAL' : 'INFEASIBLE'
        }</span>
      </div>
      <p class="muted feasibility-intro">Drag <strong>Leak Size (bits)</strong> and <strong>Signature
      Count</strong> and watch the marker cross the boundary. The lower curve is the
      ${glossTerm('information floor', 'bits×signatures must exceed the secret’s entropy, or the lattice is under-determined.')}
      (recovery is impossible below it); the upper curve adds the numerical margin this demo’s
      floating-point LLL needs.</p>
      <div class="feasibility-plot-wrap" tabindex="0" role="img" aria-label="Feasibility plot. Current configuration: ${config.leakedBits} leaked bits across ${config.signatureCount} signatures. Region: ${region}. ${regionLabel}">
        <svg viewBox="0 0 ${PLOT_W} ${PLOT_H}" class="feasibility-svg" xmlns="http://www.w3.org/2000/svg">
          <line x1="${PAD_L}" y1="${PLOT_H - PAD_B}" x2="${PLOT_W - PAD_R}" y2="${PLOT_H - PAD_B}" class="axis" />
          <line x1="${PAD_L}" y1="${PAD_T}" x2="${PAD_L}" y2="${PLOT_H - PAD_B}" class="axis" />
          <path d="${floorPath}" class="floor-curve" fill="none" />
          <path d="${practicalPath}" class="practical-curve" fill="none" />
          <text x="10" y="${PLOT_H / 2}" class="axis-label" transform="rotate(-90 10 ${PLOT_H / 2})">leaked bits / sig</text>
          <text x="${(PLOT_W + PAD_L) / 2}" y="${PLOT_H - 4}" class="axis-label">signatures</text>
          <circle cx="${mx.toFixed(1)}" cy="${my.toFixed(1)}" r="5" class="marker marker-${region}" />
        </svg>
      </div>
      <p class="feasibility-region region-${region}">${regionLabel}</p>
      ${note}
    </section>
  `;
}
