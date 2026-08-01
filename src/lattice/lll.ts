import {
  type ColumnScales,
  cloneMatrix,
  fraction,
  rowLengthsSquared,
  subtractBigIntRows,
} from './matrix';

export interface LllResult {
  basis: bigint[][];
  iterations: number;
  lengths: bigint[];
}

function scaledValue(row: bigint[], column: number, scales?: ColumnScales): number {
  const scale = scales?.[column];
  const scaleNumber = scale ? Number(scale.numerator) / Number(scale.denominator) : 1;
  return Number(row[column]) * scaleNumber;
}

function approximateState(matrix: bigint[][], scales?: ColumnScales): { mu: number[][]; norms: number[] } {
  const rowCount = matrix.length;
  const basis = matrix.map((row) => row.map((_entry, column) => scaledValue(row, column, scales)));
  const orthogonal = basis.map((row) => [...row]);
  const mu = Array.from({ length: rowCount }, () => Array.from({ length: rowCount }, () => 0));
  const norms = Array.from({ length: rowCount }, () => 0);

  for (let i = 0; i < rowCount; i += 1) {
    for (let j = 0; j < i; j += 1) {
      const dot = basis[i].reduce((sum, value, column) => sum + value * orthogonal[j][column], 0);
      const denom = norms[j] || 1;
      mu[i][j] = dot / denom;
      for (let column = 0; column < basis[i].length; column += 1) {
        orthogonal[i][column] -= mu[i][j] * orthogonal[j][column];
      }
    }
    norms[i] = orthogonal[i].reduce((sum, value) => sum + value * value, 0);
  }

  return { mu, norms };
}

/**
 * Safety valve for the main loop, sized from the basis dimension.
 *
 * LLL's swap count grows like O(d^2 log B) in the dimension `d`, so one fixed cap
 * cannot serve every dimension the UI offers. The previous flat cap of 10000 aborted
 * *every* run with 24 or more signatures (embedding dimension >= 26) -- a range the
 * signature-count slider allows (up to 32) and the feasibility gauge labels FEASIBLE.
 * The learner saw "LLL did not reveal a valid key", which reads as a statement about
 * the lattice when it was really "the loop counter ran out".
 *
 * Measured need on the shipped HNP embedding at 24 leaked bits: ~10.2k iterations at
 * dimension 26 and ~13.9k at dimension 34 (the slider maximum). Scaling the cap with
 * d^2 keeps a real guard against a non-terminating reduction while covering everything
 * the UI can ask for.
 */
function iterationCapFor(dimension: number): number {
  return Math.max(10000, 100 * dimension * dimension);
}

export function lllReduce(input: bigint[][], delta = fraction(3n, 4n), scales?: ColumnScales, maxIterations?: number): LllResult {
  const basis = cloneMatrix(input);
  const cap = maxIterations ?? iterationCapFor(basis.length);
  let k = 1;
  let iterations = 0;
  const deltaNumber = Number(delta.numerator) / Number(delta.denominator);

  while (k < basis.length) {
    iterations += 1;
    if (iterations > cap) {
      throw new Error(`LLL iteration cap reached after ${cap} iterations`);
    }
    let state = approximateState(basis, scales);

    for (let j = k - 1; j >= 0; j -= 1) {
      const coefficient = state.mu[k][j];
      if (Math.abs(coefficient) <= 0.5) {
        continue;
      }
      const rounded = BigInt(Math.round(coefficient));
      basis[k] = subtractBigIntRows(basis[k], basis[j], rounded);
      state = approximateState(basis, scales);
    }

    const muSquared = state.mu[k][k - 1] * state.mu[k][k - 1];
    const rightSide = (deltaNumber - muSquared) * state.norms[k - 1];
    if (state.norms[k] >= rightSide) {
      k += 1;
      continue;
    }

    [basis[k - 1], basis[k]] = [basis[k], basis[k - 1]];
    k = Math.max(k - 1, 1);
  }

  return {
    basis,
    iterations,
    lengths: rowLengthsSquared(basis),
  };
}