import type { AttackTrace } from '../types';

export function renderBasisView(trace: AttackTrace): string {
  const before = (trace.basisBefore ?? []).map((row) => row.reduce((sum, value) => sum + value * value, 0n));
  const after = trace.reducedLengths ?? [];
  const rows = after
    .map((value, index) => {
      const beforeValue = before[index] ?? 0n;
      return `
        <tr>
          <td>${index + 1}</td>
          <td><code>${beforeValue.toString()}</code></td>
          <td><code>${value.toString()}</code></td>
        </tr>
      `;
    })
    .join('');

  return `
    <section class="panel">
      <div class="panel-heading">
        <div>
          <p class="eyebrow">Reduction</p>
          <h2>Basis View</h2>
        </div>
      </div>
      <div class="table-shell compact-table">
        <table>
          <caption>Squared lattice vector lengths before and after LLL reduction.</caption>
          <thead>
            <tr>
              <th scope="col">row</th>
              <th scope="col">before</th>
              <th scope="col">after</th>
            </tr>
          </thead>
          <tbody>${rows || '<tr><td colspan="3">No lattice reduction for this mode.</td></tr>'}</tbody>
        </table>
      </div>
    </section>
  `;
}