export interface Fraction {
  numerator: bigint;
  denominator: bigint;
}

export type ColumnScales = Fraction[];

function normalize(numerator: bigint, denominator: bigint): Fraction {
  if (denominator === 0n) {
    throw new Error('Fraction denominator cannot be zero');
  }
  if (numerator === 0n) {
    return { numerator: 0n, denominator: 1n };
  }
  let num = numerator;
  let den = denominator;
  if (den < 0n) {
    num = -num;
    den = -den;
  }
  let a = num < 0n ? -num : num;
  let b = den;
  while (b !== 0n) {
    const next = a % b;
    a = b;
    b = next;
  }
  return {
    numerator: num / a,
    denominator: den / a,
  };
}

export function fraction(numerator: bigint, denominator = 1n): Fraction {
  return normalize(numerator, denominator);
}

export function addFractions(left: Fraction, right: Fraction): Fraction {
  return normalize(
    left.numerator * right.denominator + right.numerator * left.denominator,
    left.denominator * right.denominator,
  );
}

export function subtractFractions(left: Fraction, right: Fraction): Fraction {
  return normalize(
    left.numerator * right.denominator - right.numerator * left.denominator,
    left.denominator * right.denominator,
  );
}

export function multiplyFractions(left: Fraction, right: Fraction): Fraction {
  return normalize(left.numerator * right.numerator, left.denominator * right.denominator);
}

export function divideFractions(left: Fraction, right: Fraction): Fraction {
  return normalize(left.numerator * right.denominator, left.denominator * right.numerator);
}

export function compareFractions(left: Fraction, right: Fraction): number {
  const diff = left.numerator * right.denominator - right.numerator * left.denominator;
  return diff < 0n ? -1 : diff > 0n ? 1 : 0;
}

export function absoluteFraction(value: Fraction): Fraction {
  return { numerator: value.numerator < 0n ? -value.numerator : value.numerator, denominator: value.denominator };
}

export function roundFraction(value: Fraction): bigint {
  const quotient = value.numerator / value.denominator;
  const remainder = value.numerator % value.denominator;
  if (remainder === 0n) {
    return quotient;
  }
  const doubled = (remainder < 0n ? -remainder : remainder) * 2n;
  if (doubled < value.denominator) {
    return quotient;
  }
  return value.numerator > 0n ? quotient + 1n : quotient - 1n;
}

export function cloneMatrix(matrix: bigint[][]): bigint[][] {
  return matrix.map((row) => [...row]);
}

export function rowLengthsSquared(matrix: bigint[][]): bigint[] {
  return matrix.map((row) => row.reduce((sum, value) => sum + value * value, 0n));
}

export function scaledRowLengthSquared(row: bigint[], scales?: ColumnScales): Fraction {
  let total = fraction(0n);
  for (let index = 0; index < row.length; index += 1) {
    const scale = scales?.[index] ?? fraction(1n);
    const entry = multiplyFractions(fraction(row[index]), scale);
    total = addFractions(total, multiplyFractions(entry, entry));
  }
  return total;
}

export function gramSchmidt(matrix: bigint[][], scales?: ColumnScales): {
  orthogonal: Fraction[][];
  mu: Fraction[][];
  norms: Fraction[];
} {
  const rows = matrix.length;
  const columns = matrix[0]?.length ?? 0;
  const orthogonal: Fraction[][] = [];
  const mu: Fraction[][] = Array.from({ length: rows }, () => Array.from({ length: rows }, () => fraction(0n)));
  const norms: Fraction[] = [];

  for (let i = 0; i < rows; i += 1) {
    let vector = matrix[i].map((entry, index) => multiplyFractions(fraction(entry), scales?.[index] ?? fraction(1n)));
    for (let j = 0; j < i; j += 1) {
      const numerator = dotBigIntFraction(matrix[i], orthogonal[j], scales);
      const coefficient = divideFractions(numerator, norms[j]);
      mu[i][j] = coefficient;
      vector = vector.map((entry, index) => subtractFractions(entry, multiplyFractions(coefficient, orthogonal[j][index])));
    }
    orthogonal.push(vector);
    norms.push(dotFraction(vector, vector));
  }

  if (orthogonal.some((row) => row.length !== columns)) {
    throw new Error('Invalid Gram-Schmidt dimensions');
  }

  return { orthogonal, mu, norms };
}

export function dotBigIntFraction(left: bigint[], right: Fraction[], scales?: ColumnScales): Fraction {
  let total = fraction(0n);
  for (let index = 0; index < left.length; index += 1) {
    const scaledEntry = multiplyFractions(fraction(left[index]), scales?.[index] ?? fraction(1n));
    total = addFractions(total, multiplyFractions(scaledEntry, right[index]));
  }
  return total;
}

export function dotFraction(left: Fraction[], right: Fraction[]): Fraction {
  let total = fraction(0n);
  for (let index = 0; index < left.length; index += 1) {
    total = addFractions(total, multiplyFractions(left[index], right[index]));
  }
  return total;
}

export function subtractBigIntRows(target: bigint[], source: bigint[], factor: bigint): bigint[] {
  return target.map((entry, index) => entry - source[index] * factor);
}

export function fractionVectorFromBigints(values: bigint[]): Fraction[] {
  return values.map((value) => fraction(value));
}

export function subtractFractionVector(left: Fraction[], right: Fraction[]): Fraction[] {
  return left.map((entry, index) => subtractFractions(entry, right[index]));
}

export function scaleBigIntRow(row: bigint[], factor: bigint): Fraction[] {
  return row.map((entry) => fraction(entry * factor));
}

export function fractionVectorToBigInts(values: Fraction[]): bigint[] {
  return values.map((value) => {
    if (value.denominator !== 1n) {
      throw new Error('Expected an integral vector');
    }
    return value.numerator;
  });
}