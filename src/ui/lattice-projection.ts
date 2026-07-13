import type { AttackTrace } from '../types';

/**
 * A 2-D geometric projection of the HNP lattice, before and after LLL.
 *
 * The lattice lives in many dimensions (one per signature, plus the bound and
 * embedding columns), so we cannot draw it faithfully in 2-D. But the whole
 * *point* LLL makes — long, skewed basis vectors become short and near-orthogonal,
 * and one short vector's coordinate is the secret — is visible in the right 2-D slice.
 *
 * We pick two meaningful coordinates:
 *   - x-axis: the secret coordinate column (row[len-2]); on the winning row this is ±d·B.
 *   - y-axis: the first signature-constraint column (row[0]); the other axis of the plane.
 *
 * We then plot each basis vector as an arrow from the origin, scaling the whole cloud
 * so it fits the viewport. The eye can compare the tall skewed "before" arrows with the
 * short near-orthogonal "after" arrows, and see the winning vector land close to the
 * secret-coordinate axis. This is illustrative geometry, not the full N-D reduction —
 * the real reduction (and the real key) come from the actual math in the panels above.
 */

interface Vec2 {
  x: number;
  y: number;
  winner: boolean;
}

const VIEW = 260;
const CENTER = VIEW / 2;
const MARGIN = 22;

/** Project N-D integer rows onto the (secretCol, y-col) plane and normalise to floats. */
function project(matrix: bigint[][], secretCol: number, yCol: number, winningRow: number | undefined): Vec2[] {
  return matrix.map((row, index) => {
    const rawX = Number(row[secretCol] ?? 0n);
    const rawY = Number(row[yCol] ?? 0n);
    return { x: rawX, y: rawY, winner: index === winningRow };
  });
}

/** Scale a set of 2-D vectors to fill the viewport, normalising each axis independently.
 *  The two chosen coordinates live on very different numeric scales (the secret column can
 *  dwarf the other), so a single isotropic scale would flatten every arrow onto one axis.
 *  Per-axis normalisation preserves each vector's *direction relative to the axes* — which
 *  is what makes near-orthogonality visible — while keeping the whole cloud on screen. */
function screenPoints(vecs: Vec2[]): Array<Vec2 & { sx: number; sy: number }> {
  const maxX = Math.max(1, ...vecs.map((v) => Math.abs(v.x)));
  const maxY = Math.max(1, ...vecs.map((v) => Math.abs(v.y)));
  const scaleX = (CENTER - MARGIN) / maxX;
  const scaleY = (CENTER - MARGIN) / maxY;
  return vecs.map((v) => ({
    ...v,
    sx: CENTER + v.x * scaleX,
    // SVG y grows downward; flip so positive y points up like a normal graph.
    sy: CENTER - v.y * scaleY,
  }));
}

/** Pick the coordinate (other than the secret column and the trailing embedding column)
 *  with the largest spread in the reduced basis, so the 2-D slice actually shows the
 *  vectors fanning out near-orthogonally instead of all lying on the x-axis. */
function pickYColumn(reduced: bigint[][], secretCol: number): number {
  const width = reduced[0].length;
  let bestCol = 0;
  let bestSpread = -1;
  for (let col = 0; col < width; col += 1) {
    if (col === secretCol || col === width - 1) continue; // skip x-axis + embedding col
    let spread = 0;
    for (const row of reduced) {
      const v = row[col] ?? 0n;
      const abs = v < 0n ? -v : v;
      if (abs > spread) spread = Number(abs);
    }
    if (spread > bestSpread) {
      bestSpread = spread;
      bestCol = col;
    }
  }
  return bestCol;
}

function arrows(points: Array<Vec2 & { sx: number; sy: number }>, cls: string): string {
  return points
    .map((p) => {
      const winner = p.winner ? ' lp-winner' : '';
      return `<line class="lp-vec ${cls}${winner}" x1="${CENTER}" y1="${CENTER}" x2="${p.sx.toFixed(1)}" y2="${p.sy.toFixed(1)}" />`;
    })
    .join('');
}

export function renderLatticeProjection(trace: AttackTrace): string {
  const before = trace.basisBefore;
  const after = trace.basisAfter;
  if (!before || !after || before.length === 0 || after.length === 0) {
    return '';
  }

  const width = after[0].length;
  // Secret coordinate is the second-to-last column (the x-axis of our slice). For the
  // y-axis we pick the *most informative* other column: the one whose reduced-basis values
  // vary the most (excluding the secret column and the last embedding column). A flat
  // column would collapse every arrow onto the x-axis and hide the near-orthogonality.
  const secretCol = width - 2;
  const yCol = pickYColumn(after, secretCol);

  const beforeVecs = project(before, secretCol, yCol, undefined);
  const afterVecs = project(after, secretCol, yCol, trace.winningRowIndex);

  // Each frame is normalised independently (per axis). We CANNOT use one shared pixel scale:
  // the starting basis carries the curve order n (~2^256) on its diagonal, so the reduced
  // vectors are ~10^70× shorter and would vanish to a dot. Instead we keep both frames legible
  // and convey the change through the shape (long/skewed/near-parallel → short/near-orthogonal).
  const beforePts = screenPoints(beforeVecs);
  const afterPts = screenPoints(afterVecs);

  const winner = afterPts.find((p) => p.winner);
  const annotation = winner
    ? `<g class="lp-annotation">
         <line class="lp-guide" x1="${winner.sx.toFixed(1)}" y1="${winner.sy.toFixed(1)}" x2="${winner.sx.toFixed(1)}" y2="${CENTER}" />
         <circle class="lp-winner-dot" cx="${winner.sx.toFixed(1)}" cy="${winner.sy.toFixed(1)}" r="4" />
       </g>`
    : '';

  // Two stacked frames of the SAME svg content; CSS cross-fades from "before" to "after"
  // so the learner watches the long skewed arrows collapse into short ones on load.
  return `
    <div class="lattice-projection">
      <p class="lp-caption">A 2-D slice of the lattice. Each arrow is one basis vector, drawn from the
      origin. Watch the long, skewed, near-parallel <span class="lp-legend before">starting vectors</span>
      snap into short, <em>near-perpendicular</em> <span class="lp-legend after">reduced vectors</span> —
      that spreading-apart is LLL making the basis more orthogonal. The
      <span class="lp-legend winner">highlighted</span> reduced vector is the one that carried the key, and
      it points along the horizontal secret-coordinate axis.</p>
      <div class="lp-stage" tabindex="0" role="img"
           aria-label="Geometric projection of the lattice basis. Before LLL the basis vectors are long and skewed; after LLL they are short and nearly perpendicular, and one highlighted short vector points along the secret-coordinate axis, whose value equals the private key d times the bound B.">
        <svg viewBox="0 0 ${VIEW} ${VIEW}" class="lp-svg" xmlns="http://www.w3.org/2000/svg">
          <line class="lp-axis" x1="${MARGIN}" y1="${CENTER}" x2="${VIEW - MARGIN}" y2="${CENTER}" />
          <line class="lp-axis" x1="${CENTER}" y1="${MARGIN}" x2="${CENTER}" y2="${VIEW - MARGIN}" />
          <text class="lp-axis-label" x="${VIEW - MARGIN + 2}" y="${CENTER + 3}" text-anchor="end">secret coord (= d·B)</text>
          <g class="lp-frame lp-before">${arrows(beforePts, 'lp-before-vec')}</g>
          <g class="lp-frame lp-after">${arrows(afterPts, 'lp-after-vec')}${annotation}</g>
        </svg>
      </div>
      <p class="lp-note muted">Illustrative geometry: the true reduction runs in
      ${width} dimensions on the exact integers above, and the reduced vectors are astronomically shorter
      than the starting ones (each frame is scaled to fit on its own, so compare their <em>shape</em>, not
      pixel length). This slice lets you <em>see</em> the orthogonalizing the raw matrices only describe.
      The highlighted vector's position along the horizontal axis <strong>is</strong> the private key
      <code>d</code> scaled by the bound <code>B</code>.</p>
    </div>
  `;
}
