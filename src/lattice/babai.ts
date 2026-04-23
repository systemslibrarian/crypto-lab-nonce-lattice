import {
  type ColumnScales,
  fractionVectorToBigInts,
} from './matrix';

export interface BabaiResult {
  coefficients: bigint[];
  closestVector: bigint[];
  residual: bigint[];
}

function scaledValue(row: bigint[], column: number, scales?: ColumnScales): number {
  const scale = scales?.[column];
  const scaleNumber = scale ? Number(scale.numerator) / Number(scale.denominator) : 1;
  return Number(row[column]) * scaleNumber;
}

function approximateState(matrix: bigint[][], scales?: ColumnScales): { orthogonal: number[][]; norms: number[] } {
  const basis = matrix.map((row) => row.map((_entry, column) => scaledValue(row, column, scales)));
  const orthogonal = basis.map((row) => [...row]);
  const norms = Array.from({ length: basis.length }, () => 0);

  for (let i = 0; i < basis.length; i += 1) {
    for (let j = 0; j < i; j += 1) {
      const dot = basis[i].reduce((sum, value, column) => sum + value * orthogonal[j][column], 0);
      const coefficient = dot / (norms[j] || 1);
      for (let column = 0; column < basis[i].length; column += 1) {
        orthogonal[i][column] -= coefficient * orthogonal[j][column];
      }
    }
    norms[i] = orthogonal[i].reduce((sum, value) => sum + value * value, 0);
  }

  return { orthogonal, norms };
}

export function babaiNearestPlane(reducedBasis: bigint[][], target: bigint[], scales?: ColumnScales): BabaiResult {
  const state = approximateState(reducedBasis, scales);
  const scaledTarget = target.map((value, index) => {
    const scale = scales?.[index];
    const scaleNumber = scale ? Number(scale.numerator) / Number(scale.denominator) : 1;
    return Number(value) * scaleNumber;
  });
  const residualApprox = [...scaledTarget];
  const coefficients = Array.from({ length: reducedBasis.length }, () => 0n);

  for (let index = reducedBasis.length - 1; index >= 0; index -= 1) {
    const numerator = residualApprox.reduce((sum, value, column) => sum + value * state.orthogonal[index][column], 0);
    const coefficient = BigInt(Math.round(numerator / (state.norms[index] || 1)));
    coefficients[index] = coefficient;
    residualApprox.forEach((_entry, column) => {
      residualApprox[column] -= scaledValue(reducedBasis[index], column, scales) * Number(coefficient);
    });
  }

  const closestVector = reducedBasis[0].map((_entry, column) => {
    return reducedBasis.reduce((sum, row, rowIndex) => sum + row[column] * coefficients[rowIndex], 0n);
  });
  return {
    coefficients,
    closestVector,
    residual: fractionVectorToBigInts(target.map((_entry, column) => {
      return {
        numerator: BigInt(Math.round(residualApprox[column] * (scales?.[column] ? Number(scales[column].denominator) / Number(scales[column].numerator) : 1))),
        denominator: 1n,
      };
    })),
  };
}