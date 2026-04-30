// Educational diagnostics for failure cases

export function getDiagnostic(reason: string): string {
  switch (reason) {
    case 'not-enough-signatures':
      return 'Recovery failed because there are not enough signatures for this leakage level. Try the recommended preset.';
    case 'lattice-failure':
      return 'The lattice reduction did not produce a useful candidate. Try the recommended preset.';
    case 'defender-mode':
      return 'RFC6979 defender mode is working as intended: no repeated or biased nonce was introduced.';
    case 'out-of-range':
      return 'This mode is outside the browser-safe demo range.';
    default:
      return 'Recovery failed. Check your leakage model, signature count, and try a known-good preset.';
  }
}
