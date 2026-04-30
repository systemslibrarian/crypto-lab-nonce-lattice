import { describe, it, expect } from 'vitest';
import { lllReduce } from '../src/lattice/lll';
import { babaiNearestPlane } from '../src/lattice/babai';

describe('LLL and Babai', () => {
  it('LLL preserves dimensions', () => {
    const mat = [ [1n, 2n], [3n, 4n] ];
    const reduced = lllReduce(mat).basis;
    expect(reduced.length).toBe(2);
    expect(reduced[0].length).toBe(2);
  });
  it('Babai works on toy example', () => {
    const basis = [ [1n, 0n], [0n, 1n] ];
    const target = [2n, 3n];
    const res = babaiNearestPlane(basis, target);
    expect(res.closestVector).toEqual([2n, 3n]);
  });
});
