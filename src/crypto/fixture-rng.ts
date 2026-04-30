// Deterministic fixture RNG for reproducible tests and demos
export class FixtureRNG {
  private seed: string;
  private state: number;
  constructor(seed: string) {
    this.seed = seed;
    this.state = this.hash(seed);
  }
  private hash(str: string): number {
    let h = 2166136261;
    for (let i = 0; i < str.length; ++i) {
      h ^= str.charCodeAt(i);
      h += (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24);
    }
    return h >>> 0;
  }
  next(): number {
    // xorshift32
    let x = this.state;
    x ^= x << 13;
    x ^= x >> 17;
    x ^= x << 5;
    this.state = x >>> 0;
    return this.state / 0x100000000;
  }
}

export function labelFixtureMode() {
  return 'Deterministic fixture mode — reproducible, not secure randomness.';
}
