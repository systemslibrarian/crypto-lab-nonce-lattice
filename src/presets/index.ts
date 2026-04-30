// Preset system for known-good demo configurations
export interface Preset {
  name: string;
  curve: string;
  mode: string;
  signatureCount: number;
  leakedBits: number;
  seed?: string;
  expectedResult: string;
  runtime: string;
  explanation: string;
  realityLabel: string;
}

export const presets: Preset[] = [
  // Example preset
  {
    name: 'secp256k1-msb-24bits',
    curve: 'secp256k1',
    mode: 'msb',
    signatureCount: 8,
    leakedBits: 24,
    seed: 'fixture-seed-1',
    expectedResult: 'demo-key',
    runtime: 'fast',
    explanation: 'MSB 24 bits leaked, secp256k1, known-good demo.',
    realityLabel: 'Educational Leakage Model',
  },
  // Add more presets in separate files
];
