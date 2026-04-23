import type { AttackTrace } from '../types';

function renderMatrix(matrix: bigint[][] | undefined, label: string): string {
  if (!matrix) {
    return `<p class="muted">${label} unavailable for this mode.</p>`;
  }

  const lengths = matrix.map((row) => row.reduce((sum, value) => sum + value * value, 0n));
  const sorted = [...lengths].sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));
  const threshold = sorted[Math.floor(sorted.length / 3)] ?? 0n;
  const rows = matrix
    .map((row, rowIndex) => {
      const rowClass = lengths[rowIndex] <= threshold ? 'matrix-row short-row' : 'matrix-row';
      const cells = row.map((value) => `<span class="matrix-cell">${value.toString()}</span>`).join('');
      return `<div class="${rowClass}">${cells}</div>`;
    })
    .join('');

  return `
    <details class="matrix-block" open>
      <summary>${label}</summary>
      <div class="matrix-shell">${rows}</div>
    </details>
  `;
}

export function renderLatticeView(trace: AttackTrace): string {
  return `
    <section class="panel">
      <div class="panel-heading">
        <div>
          <p class="eyebrow">Nguyen-Shparlinski HNP</p>
          <h2>Lattice View</h2>
        </div>
      </div>
      ${renderMatrix(trace.basisBefore, 'basis before LLL')}
      ${renderMatrix(trace.basisAfter, 'basis after LLL')}
    </section>
  `;
}