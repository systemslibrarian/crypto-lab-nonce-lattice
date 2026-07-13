import { formatScalar } from '../crypto/modular';
import { renderLatticeProjection } from './lattice-projection';
import type { AttackTrace, CurveContext, SignatureRecord } from '../types';

interface MatrixOptions {
  /** Row index to visually mark as the winning short vector (only for basisAfter). */
  winningRowIndex?: number;
  /** Column index (into each row) whose value is the secret coordinate = ±d·bound. */
  secretColumnIndex?: number;
}

function renderMatrix(matrix: bigint[][] | undefined, label: string, options: MatrixOptions = {}): string {
  if (!matrix) {
    return `<p class="muted">${label} unavailable for this mode.</p>`;
  }

  const lengths = matrix.map((row) => row.reduce((sum, value) => sum + value * value, 0n));
  const sorted = [...lengths].sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));
  const threshold = sorted[Math.floor(sorted.length / 3)] ?? 0n;
  const rows = matrix
    .map((row, rowIndex) => {
      const isWinner = options.winningRowIndex === rowIndex;
      const classes = ['matrix-row'];
      if (lengths[rowIndex] <= threshold) classes.push('short-row');
      if (isWinner) classes.push('winning-row');
      const cells = row
        .map((value, colIndex) => {
          const isSecret = isWinner && options.secretColumnIndex === colIndex;
          return `<span class="matrix-cell${isSecret ? ' secret-cell' : ''}">${value.toString()}</span>`;
        })
        .join('');
      const badge = isWinner
        ? '<span class="winning-badge" aria-hidden="true">key row ↓</span>'
        : '';
      return `<div class="${classes.join(' ')}"${isWinner ? ' aria-label="Winning short vector: this row carries the private key"' : ''}>${badge}${cells}</div>`;
    })
    .join('');

  return `
    <details class="matrix-block" open>
      <summary>${label}</summary>
      <div class="matrix-shell" tabindex="0" role="region" aria-label="${label} (scrollable)">${rows}</div>
    </details>
  `;
}

/** The single conceptual leap of the whole demo: the geometrically "short" reduced
 *  vector literally contains d. Show secretCoordinate / bound (mod n) = recovered scalar
 *  with the real numbers from this run, and point at the outlined row above. */
function renderKeyBridge(trace: AttackTrace, curve: CurveContext): string {
  if (trace.secretCoordinate === undefined || trace.bound === undefined || trace.recoveredScalar === undefined) {
    return '';
  }
  const dHex = formatScalar(trace.recoveredScalar, curve.orderBytes);
  const coordStr = trace.secretCoordinate.toString();
  const boundStr = trace.bound.toString();
  const shortCoord = coordStr.length > 40 ? `${coordStr.slice(0, 20)}…${coordStr.slice(-16)}` : coordStr;
  const shortBound = boundStr.length > 40 ? `${boundStr.slice(0, 20)}…${boundStr.slice(-16)}` : boundStr;
  const modeWord = trace.mode === 'babai' ? 'Babai nearest-plane' : 'LLL';

  return `
    <div class="key-bridge">
      <p class="eyebrow">The one step that matters</p>
      <p>The outlined row above is the <strong>short vector</strong> ${modeWord} found. Its
      second-to-last coordinate is not a random big integer — it is exactly the private key
      <code>d</code> multiplied by the scaling bound <code>B</code>. Dividing it out recovers <code>d</code>:</p>
      <div class="bridge-equation" tabindex="0" role="region" aria-label="Key recovery equation, scrollable">
        <div class="bridge-line"><span class="bridge-num">secretCoordinate</span> <span class="bridge-op">=</span> <code>${shortCoord}</code></div>
        <div class="bridge-line"><span class="bridge-num">bound B</span> <span class="bridge-op">=</span> <code>${shortBound}</code></div>
        <div class="bridge-line bridge-result">
          <span class="bridge-num">secretCoordinate / B (mod n)</span>
          <span class="bridge-op">=</span>
          <code class="bridge-key">${dHex}</code>
          <span class="bridge-tag">= d, the private key</span>
        </div>
      </div>
      <p class="muted">This is why "reduce the lattice, read off a short vector" recovers a secret:
      the basis was built so that the shortest vector's coordinates encode the hidden nonce errors,
      and one coordinate over is <code>d·B</code>.</p>
    </div>
  `;
}

/** MEDIUM: connect one visible signature to one visible basis row. Take signature #1
 *  and the first row of the starting basis and show, side by side, how r/s/h become the
 *  entries of a lattice row — so the leap from "bounded congruence" to "matrix of huge
 *  integers" is motivated, not just asserted. The numbers are the real ones from the run. */
function renderRowConstruction(trace: AttackTrace, signatures: SignatureRecord[] | undefined, curve: CurveContext): string {
  const before = trace.basisBefore;
  if (!before || before.length < 2 || !signatures || signatures.length === 0) {
    return '';
  }
  // The last row of the starting basis is the "constraint" row [t₀ … t_{N-1}, bound]:
  // it is the one built directly from the signatures, so its entries are the tᵢ values.
  const constraintRow = before[before.length - 1];
  if (!constraintRow || trace.bound === undefined) return '';

  const sig = signatures[0];
  const b = curve.orderBytes;
  const clip = (v: bigint, keep = 14): string => {
    const hex = formatScalar(v, b);
    return hex.length > keep + 10 ? `${hex.slice(0, keep)}…${hex.slice(-6)}` : hex;
  };
  const cell = (v: bigint): string => {
    const s = v.toString();
    return s.length > 22 ? `${s.slice(0, 12)}…${s.slice(-6)}` : s;
  };
  // First constraint entry t₀ and the bound column, labelled.
  const t0 = constraintRow[0] ?? 0n;
  const boundCell = constraintRow[constraintRow.length - 1] ?? trace.bound;

  return `
    <details class="row-construction" open>
      <summary>How one signature becomes one lattice row</summary>
      <p class="muted rc-intro">Before the whole matrix appears, watch a single signature turn into a
      single row. Signature #1 from the log gives real <code>r</code>, <code>s</code>, <code>h</code>:</p>
      <div class="rc-signature" tabindex="0" role="region" aria-label="Signature 1 components">
        <span><em>r</em> = <code>${clip(sig.r)}</code></span>
        <span><em>s</em> = <code>${clip(sig.s)}</code></span>
        <span><em>h</em> = <code>${clip(sig.h)}</code></span>
      </div>
      <p class="muted rc-step">Its ECDSA congruence <code>r·d − s·k + h ≡ 0 (mod n)</code> is rescaled by
      <code>s⁻¹</code> and centered so the unknown nonce error is small. That single reduction step
      produces one coefficient <code>t₀ = r·s⁻¹ (centered)</code> and the shared scaling bound
      <code>B</code> — which become two entries of the row:</p>
      <div class="rc-row" tabindex="0" role="region" aria-label="Lattice row built from signature 1">
        <div class="rc-cell rc-labeled">
          <span class="rc-tag">t₀ (from sig #1)</span>
          <code>${cell(t0)}</code>
        </div>
        <span class="rc-ellipsis">… t₁ … t${before.length - 2} …</span>
        <div class="rc-cell rc-labeled rc-bound">
          <span class="rc-tag">bound B (scaling)</span>
          <code>${cell(boundCell)}</code>
        </div>
      </div>
      <div class="rc-modrow" tabindex="0" role="region" aria-label="Modulus rows of the lattice">
        <span class="rc-tag">above this row sit N modulus rows</span>
        <code>[ n, 0, 0, … 0 ]  [ 0, n, 0, … 0 ]  …</code>
        <span class="rc-modnote">— they let each congruence wrap mod n without changing the solution.</span>
      </div>
      <p class="muted rc-outro">Stack one such constraint row per signature on top of the <code>n</code>-modulus
      rows and you have the full starting basis below. Every giant integer in it came from a signature
      exactly this way.</p>
    </details>
  `;
}

export function renderLatticeView(trace: AttackTrace, curve: CurveContext, signatures?: SignatureRecord[]): string {
  // basisAfter rows have the same width as basisBefore; the secret coordinate is
  // the second-to-last column (row[len-2] = ±d·bound).
  const afterWidth = trace.basisAfter?.[0]?.length ?? 0;
  const secretColumnIndex = afterWidth > 0 ? afterWidth - 2 : undefined;

  return `
    <section class="panel">
      <div class="panel-heading">
        <div>
          <p class="eyebrow">${glossTerm('Nguyen-Shparlinski', 'The Hidden Number Problem reduction that turns biased ECDSA signatures into a lattice.')} HNP</p>
          <h2>Lattice View</h2>
        </div>
      </div>
      <p class="muted lattice-intro">LLL rewrites the tall, skewed starting basis into shorter, more
      orthogonal vectors. When the attack works, one of those short vectors carries the key. First see
      <em>where the basis comes from</em>, then watch it <em>get shorter</em>, then read the key out of it.</p>
      ${renderRowConstruction(trace, signatures, curve)}
      ${renderLatticeProjection(trace)}
      ${renderMatrix(trace.basisBefore, 'basis before LLL')}
      ${renderMatrix(trace.basisAfter, 'basis after LLL', { winningRowIndex: trace.winningRowIndex, secretColumnIndex })}
      ${renderKeyBridge(trace, curve)}
    </section>
  `;
}

/** Inline glossary: a term with a native-title tooltip and a visible dotted underline. */
export function glossTerm(term: string, definition: string): string {
  return `<span class="gloss" tabindex="0" title="${definition.replace(/"/g, '&quot;')}" aria-label="${term}: ${definition.replace(/"/g, '&quot;')}">${term}</span>`;
}
