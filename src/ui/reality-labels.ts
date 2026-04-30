// Reality labels for each mode

export const realityLabels = [
  {
    label: 'Historical / Real-World Failure',
    description: 'Based on real cryptographic failures. Attacker knowledge and leakage are realistic. See case studies.'
  },
  {
    label: 'Educational Leakage Model',
    description: 'Simplified leakage for learning. Attacker knows bits by construction. Not a real-world exploit.'
  },
  {
    label: 'Implementation Side-Channel Class',
    description: 'Models timing or side-channel leaks. Attacker has advanced measurement capability.'
  },
  {
    label: 'Defender Mode',
    description: 'Demonstrates secure nonce generation (RFC6979). No exploitable leakage.'
  },
  {
    label: 'Toy Model',
    description: 'Artificial scenario for demonstration. Not realistic, but useful for understanding.'
  }
];
