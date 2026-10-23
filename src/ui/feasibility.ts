import { glossTerm } from './lattice-view';
import {
  MAX_SWEEP_SIGNATURES,
  TRIALS_PER_LEVEL,
  infoFloorBits,
  practicalBits,
  summarizeSweep,
  type LadderPlan,
  type ProbeResult,
} from '../boundary';
import type { AppConfigView, CurveContext } from '../types';
import { escapeHtml } from './escape';

/** One finished measured column, kept so repeated sweeps accumulate into a curve. */
export interface MeasuredColumn {
  signatureCount: number;
  curveId: string;
  leakMode: AppConfigView['leakMode'];
  measuredBits: number;
  measuredRate: number;
}

export interface SweepView {
  plan: LadderPlan | null;
  probes: ProbeResult[];
  running: boolean;
  error: string | null;
  /** Completed columns from earlier sweeps in this session. */
  columns: MeasuredColumn[];
}

/**
 * Live feasibility indicator for the HNP lattice attack.
 *
 * The relationship being visualised is the headline promise of the demo: how much
 * per-signature nonce leakage, across how many signatures, is enough to recover d.
 *
 * Honest model (documented on screen, not hidden):
 *  - Bit-count guide: bits · signatures ~= curve.bits is a useful first-order budget,
 *    not a proof of impossibility. Real HNP success depends on lattice geometry, nonce
 *    draws and reduction quality, and the measured sweep can recover just below it.
 *  - Reduction margin: this demo's LLL/Babai use floating-point Gram-Schmidt, so it
 *    needs headroom above the simple bit-count guide to survive numerical error. That is
 *    why the practical boundary sits above the theoretical one.
 *
 * We DO NOT claim a specific run will succeed — we plot the known boundary curve and a
 * marker for the current config, and label which region it falls in. Actual success is
 * still decided by the real recovery run, not this gauge.
 */

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

/** Renders the measured-sweep control, table and verdict beneath the plot. */
function renderSweep(config: AppConfigView, curve: CurveContext, sweep: SweepView): string {
  const plan = sweep.plan;
  const relevant =
    plan !== null &&
    plan.signatureCount === config.signatureCount &&
    plan.curveId === curve.id &&
    plan.leakMode === config.leakMode;

  const button = `<button type="button" class="secondary-button sweep-button" data-measure-boundary
      ${sweep.running ? 'disabled aria-disabled="true"' : ''}>${
        sweep.running ? 'Measuring…' : 'Measure this column'
      }</button>`;

  const lead = `<p class="muted sweep-lead">The two curves above are a <em>model</em>. This runs the
    real attack instead: ${TRIALS_PER_LEVEL} independent end-to-end attacks — fresh key, fresh
    signatures, real LLL, byte-for-byte validation — at each of several leak sizes around the
    bit-count guide for <strong>${config.signatureCount} signatures</strong>, and reports how many
    of them actually recovered the key.</p>`;

  if (!relevant || plan === null) {
    return `<div class="sweep-block">${lead}<div class="sweep-controls">${button}</div>${
      sweep.error ? `<p class="sweep-error">${escapeHtml(sweep.error)}</p>` : ''
    }</div>`;
  }

  if (plan.refusal) {
    const reason =
      plan.refusal === 'no-bit-axis'
        ? 'This leak mode has no leaked-bits axis to sweep. Nonce reuse needs no lattice at all, and RFC 6979 leaks nothing. Switch to MSB, LSB or fixed-prefix.'
        : plan.refusal === 'too-many-signatures'
          ? `A sweep runs the full attack ${TRIALS_PER_LEVEL} times per rung, and at more than ${MAX_SWEEP_SIGNATURES} signatures a single run takes tens of seconds in a browser tab — the lattice dimension is signatures + 2. Lower the signature count to measure this. That limit is this page's budget, not a property of the attack.`
          : `At ${plan.signatureCount} signatures the bit-count guide is ${plan.floor.toFixed(1)} bits per signature, beyond this lab's 32-bit leak control. The centered ladder does not fit on the plot, so this panel declines to invent a measured boundary. Raise the signature count to run a sweep.`;
    return `<div class="sweep-block">${lead}<div class="sweep-controls">${button}</div>
      <p class="sweep-refusal" data-sweep-refusal>${reason}</p></div>`;
  }

  const rows = plan.levels
    .map((bits) => {
      const probe = sweep.probes.find((p) => p.bits === bits);
      const belowFloor = bits < plan.floor;
      if (!probe) {
        return `<tr class="sweep-row pending"><td>${bits}</td><td colspan="3" class="muted">${
          sweep.running ? 'queued' : 'not run'
        }</td></tr>`;
      }
      const rate = probe.recovered / probe.trials;
      const verdict =
        probe.recovered === 0
          ? 'never recovered'
          : probe.recovered === probe.trials
            ? 'recovered every time'
            : 'recovered sometimes';
      return `<tr class="sweep-row ${
        probe.recovered === 0 ? 'miss' : probe.recovered === probe.trials ? 'hit' : 'ramp'
      }"><td>${bits}${belowFloor ? ' <span class="sweep-flag">below guide</span>' : ''}</td>
        <td>${probe.recovered} / ${probe.trials}</td>
        <td>${Math.round(rate * 100)}%</td>
        <td>${verdict} <span class="muted">(${probe.elapsedMs} ms)</span></td></tr>`;
    })
    .join('');

  const complete = sweep.probes.length === plan.levels.length;
  const summary = complete ? summarizeSweep(plan, sweep.probes) : null;

  let verdict = '';
  if (sweep.running) {
    verdict = `<p class="sweep-verdict running" data-sweep-verdict>Running ${sweep.probes.length + 1} of ${plan.levels.length} rungs…</p>`;
  } else if (summary) {
    const parts: string[] = [];
    if (summary.measuredBits === null) {
      parts.push(
        `Across ${summary.totalRuns} real attacks, no leak size in this ladder recovered the key on at least half its runs (${summary.totalRecovered} recoveries in total). The boundary for ${plan.signatureCount} signatures sits above ${plan.levels[plan.levels.length - 1]} bits, higher than the drawn curve predicted (${plan.practical.toFixed(1)}).`,
      );
    } else {
      const gap = summary.gapToPractical ?? 0;
      const direction =
        Math.abs(gap) < 0.5
          ? `lands on the drawn practical curve (${plan.practical.toFixed(1)} bits)`
          : gap < 0
            ? `sits ${Math.abs(gap).toFixed(1)} bits BELOW the drawn practical curve (${plan.practical.toFixed(1)} bits) — the float-LLL did better than the drawn margin predicted`
            : `sits ${gap.toFixed(1)} bits ABOVE the drawn practical curve (${plan.practical.toFixed(1)} bits) — the drawn margin was optimistic`;
      parts.push(
        `Measured boundary: <strong>${summary.measuredBits} bits</strong> at ${plan.signatureCount} signatures (${Math.round((summary.measuredRate ?? 0) * 100)}% of runs recovered). That ${direction}. Bit-count guide: ${plan.floor.toFixed(1)} bits.`,
      );
    }
    if (summary.rampBits.length > 0) {
      parts.push(
        `The boundary is a ramp, not a line: at ${summary.rampBits.join(', ')} bit${summary.rampBits.length === 1 ? '' : 's'} the same configuration recovered the key on some runs and failed on others. Whether an attack works there is decided by the draw of the key and nonces, not by the parameters alone.`,
      );
    }
    if (summary.recoveredBelowFloor) {
      parts.push(
        'One rung below the bit-count guide still recovered the key. That is not a broken measurement: the line is only a first-order budget, and the extractor tries every candidate scalar the reduced basis offers. A particular nonce draw can still put the right scalar in that short list.',
      );
    }
    verdict = `<p class="sweep-verdict" data-sweep-verdict>${parts.join(' ')}</p>`;
  }

  return `<div class="sweep-block">
    ${lead}
    <div class="sweep-controls">${button}</div>
    ${sweep.error ? `<p class="sweep-error">${escapeHtml(sweep.error)}</p>` : ''}
    <table class="sweep-table" data-sweep-table>
      <caption>Measured recovery rate, ${plan.signatureCount} signatures, ${plan.leakMode.toUpperCase()} leakage on ${curve.label}</caption>
      <thead><tr><th scope="col">leak bits</th><th scope="col">recovered</th><th scope="col">rate</th><th scope="col">outcome</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    ${verdict}
  </div>`;
}

export function renderFeasibility(
  config: AppConfigView,
  curve: CurveContext,
  sweep: SweepView = { plan: null, probes: [], running: false, error: null, columns: [] },
): string {
  const region = classify(config, curve);
  const mx = xForSigs(Math.max(2, Math.min(MAX_SIGS, config.signatureCount)));
  const my = yForBits(config.leakedBits);

  const floorPath = curvePath((s) => infoFloorBits(s, curve));
  const practicalPath = curvePath((s) => practicalBits(s, curve));

  // Measured columns from real sweeps, drawn over the modelled curves. Only
  // columns measured on this curve and leak mode are comparable, so only those
  // are plotted.
  const measured = sweep.columns
    .filter((c) => c.curveId === curve.id && c.leakMode === config.leakMode)
    .sort((a, b) => a.signatureCount - b.signatureCount);
  const measuredDots = measured
    .map(
      (c) =>
        `<circle cx="${xForSigs(Math.max(2, Math.min(MAX_SIGS, c.signatureCount))).toFixed(1)}" cy="${yForBits(c.measuredBits).toFixed(1)}" r="3.5" class="measured-dot"><title>measured: ${c.measuredBits} bits at ${c.signatureCount} signatures</title></circle>`,
    )
    .join('');
  const measuredPath =
    measured.length > 1
      ? `<path d="${measured
          .map(
            (c, i) =>
              `${i === 0 ? 'M' : 'L'} ${xForSigs(Math.max(2, Math.min(MAX_SIGS, c.signatureCount))).toFixed(1)},${yForBits(c.measuredBits).toFixed(1)}`,
          )
          .join(' ')}" class="measured-curve" fill="none" />`
      : '';

  const regionLabel =
    region === 'feasible'
      ? 'Above the demo’s recovery boundary — expect the lattice to reveal d.'
      : region === 'marginal'
        ? 'In the numerical margin — enough information in theory, but this demo’s float-LLL may miss it. Add signatures or bits to cross the line.'
        : 'Below the bit-count guide — this simple budget predicts a difficult run, but it is not an impossibility theorem. Measure the column below to see whether this implementation and these nonce draws still recover.';
  const regionName = region === 'infeasible' ? 'below guide' : region;

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
          region === 'feasible' ? 'FEASIBLE' : region === 'marginal' ? 'MARGINAL' : 'BELOW GUIDE'
        }</span>
      </div>
      <p class="muted feasibility-intro">Drag <strong>Leak Size (bits)</strong> and <strong>Signature
      Count</strong> and watch the marker cross the boundary. The lower curve is the
      ${glossTerm('bit-count guide', 'The heuristic line bits×signatures = curve bits. It is useful for choosing a starting point, but is not a proof that lower-budget instances cannot recover.')}; the upper curve adds the numerical margin this demo’s
      floating-point LLL needs. Both curves are a <em>model</em> — nothing on this page had ever
      checked them. <strong>Measure this column</strong>, below, runs the real attack until it finds
      the boundary for itself; measured points are drawn on the plot as dots, and the panel says
      plainly where the measurement and the drawn curve disagree.</p>
      <div class="feasibility-plot-wrap" tabindex="0" role="img" aria-label="Feasibility plot. Current configuration: ${config.leakedBits} leaked bits across ${config.signatureCount} signatures. Region: ${regionName}. ${regionLabel}${measured.length > 0 ? ` Measured boundary points from real attack runs: ${measured.map((c) => `${c.measuredBits} bits at ${c.signatureCount} signatures`).join('; ')}.` : ''}">
        <svg viewBox="0 0 ${PLOT_W} ${PLOT_H}" class="feasibility-svg" xmlns="http://www.w3.org/2000/svg">
          <line x1="${PAD_L}" y1="${PLOT_H - PAD_B}" x2="${PLOT_W - PAD_R}" y2="${PLOT_H - PAD_B}" class="axis" />
          <line x1="${PAD_L}" y1="${PAD_T}" x2="${PAD_L}" y2="${PLOT_H - PAD_B}" class="axis" />
          <path d="${floorPath}" class="floor-curve" fill="none" />
          <path d="${practicalPath}" class="practical-curve" fill="none" />
          <text x="10" y="${PLOT_H / 2}" class="axis-label" transform="rotate(-90 10 ${PLOT_H / 2})">leaked bits / sig</text>
          <text x="${(PLOT_W + PAD_L) / 2}" y="${PLOT_H - 4}" class="axis-label">signatures</text>
          ${measuredPath}
          ${measuredDots}
          <circle cx="${mx.toFixed(1)}" cy="${my.toFixed(1)}" r="5" class="marker marker-${region}" />
        </svg>
      </div>
      <p class="feasibility-region region-${region}">${regionLabel}</p>
      ${note}
      ${renderSweep(config, curve, sweep)}
      <p class="feasibility-reality">
        <strong>Reading the axes honestly.</strong> The curve is <em>not</em> scaled down: this really is
        ${curve.label}, a full ${curve.bits}-bit order, and the signatures really verify. What is limited is
        the attacker's budget — this gauge only goes up to ${MAX_SIGS} signatures, because the
        floating-point LLL below runs in your browser rather than on a cluster. Because of that small
        sample budget the demo needs far <em>more</em> leakage per signature than theory demands: the
        ECDSA result of Nguyen–Shparlinski, building on Boneh–Venkatesan's HNP, gives an asymptotic bound of about
        <strong>${glossTerm('√(log₂ n)', 'Nguyen and Shparlinski (Designs, Codes and Cryptography 30, 2003) prove an ECDSA result requiring about the square root of the order bit-length in known consecutive nonce bits, under their stated hash/distribution assumptions and with a number of signatures at most linear in log n. This is not a calibrated practical threshold.')} ≈ ${Math.round(Math.sqrt(curve.bits))} bits</strong>
        per signature, with a number of signatures at most linear in log n under the theorem's assumptions.
        So the boundary drawn here is this demo's boundary at this sample size, not a threshold for
        ${curve.label} in general. The reason your keys are safe is not that these are small curves;
        it is that a correct signer never leaks the bits this page hands the attacker for free.
      </p>
    </section>
  `;
}
