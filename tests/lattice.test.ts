import { lll, babai } from '../src/lattice/lll';
import { describe, it, expect } from 'vitest';

describe('LLL and Babai', () => {
  it('LLL preserves dimensions', () => {
    const mat = [[1,2],[3,4]];
    const reduced = lll(mat);
    expect(reduced.length).toBe(2);
    expect(reduced[0].length).toBe(2);
  });
  it('Babai works on toy example', () => {
    const basis = [[1,0],[0,1]];
    const target = [2,3];
    const res = babai(basis, target);
    expect(res).toEqual([2,3]);
  });
});
