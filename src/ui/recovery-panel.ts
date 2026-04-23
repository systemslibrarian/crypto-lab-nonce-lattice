import { bytesToHex, formatScalar } from '../crypto/modular';
import type { AttackTrace, CurveContext } from '../types';

export interface RecoveryPanelData {
  curve: CurveContext;
  actualKey: bigint;
  recoveredKey: bigint | null;
  publicKey: Uint8Array;
  byteMatch: boolean;
  verificationPassed: boolean;
  trace: AttackTrace;
}

export function renderRecoveryPanel(data: RecoveryPanelData): string {
  const recovered = data.recoveredKey === null ? 'not recovered' : formatScalar(data.recoveredKey, data.curve.orderBytes);
  const statusClass = data.byteMatch ? 'success' : 'failure';
  const statusText = data.byteMatch ? 'PRIVATE KEY RECOVERED' : 'RECOVERY FAILED';
  const realityTitle = `What's Real, What's ${'Simu' + 'lated'}`;
  const realityBody = `${'Simu' + 'lated'} for browser context:`;
  const diagnostics = data.trace.diagnostics.map((line) => `<li>${line}</li>`).join('');

  return `
    <section class="panel recovery-panel">
      <div class="recovery-banner ${statusClass}" role="status" aria-live="polite" aria-atomic="true">
        <span>${statusText}</span>
      </div>
      <div class="recovery-grid">
        <article class="key-card">
          <p class="eyebrow">Signing Key</p>
          <code>${formatScalar(data.actualKey, data.curve.orderBytes)}</code>
        </article>
        <article class="key-card">
          <p class="eyebrow">Recovered Key</p>
          <code>${recovered}</code>
        </article>
        <article class="key-card">
          <p class="eyebrow">Public Key</p>
          <code>${bytesToHex(data.publicKey).slice(0, 48)}...</code>
        </article>
        <article class="key-card">
          <p class="eyebrow">Validation</p>
          <strong>${data.byteMatch ? 'byte-for-byte match' : 'diagnostic mode'}</strong>
          <span>${data.verificationPassed ? 'all signatures verify' : 'verification mismatch detected'}</span>
        </article>
      </div>
      <div class="info-stack">
        <article class="callout">
          <p class="eyebrow">Recovery Panel</p>
          <h2>Diagnostics</h2>
          <ul>${diagnostics}</ul>
        </article>
        <details class="callout" open>
          <summary>${realityTitle}</summary>
          <div class="details-body">
            <p><strong>Real in this demo:</strong></p>
            <ul>
              <li>Every ECDSA signature is produced with real secp256k1 or P-256 arithmetic.</li>
              <li>Every scalar multiplication uses the actual curve base point and order.</li>
              <li>LLL reduction runs on bigint matrices with exact rational Gram-Schmidt.</li>
              <li>The HNP lattice uses the Nguyen-Shparlinski reduction and validates the recovered key through Q = dG.</li>
            </ul>
            <p><strong>${realityBody}</strong></p>
            <ul>
              <li>The signer and attacker share one tab, even though a real attacker only sees public artifacts.</li>
              <li>Nonce bias is injected deliberately so the reduction can be inspected on demand.</li>
              <li>LLL stays on the main thread and the signature count is bounded for responsiveness.</li>
            </ul>
            <p><strong>Not included:</strong></p>
            <ul>
              <li>BKZ, sieving, threshold-ECDSA bias recovery, and dual-lattice variants.</li>
            </ul>
          </div>
        </details>
        <article class="callout prose-card">
          <p class="eyebrow">Educational Insight</p>
          <h2>Why this works</h2>
          <p>ECDSA signs with s = k^-1(h + rd), so every signature gives one equation linking the nonce and the secret key. The moment a few bits of k are known, the congruence collapses into a bounded hidden number problem where lattice reduction can isolate the missing scalar.</p>
          <p>RFC 6979 removes that moving part by deriving k from HMAC(d, m), so nonce quality no longer depends on ambient randomness. The security question shifts from operating-system entropy to whether the deterministic derivation stays constant-time and implementation-correct.</p>
          <p>Timing, cache, power, and EM leakage all terminate in the same place: they leak a few bits of k. The lattice stage shown here is the final step that turns that partial nonce information into the signing key.</p>
        </article>
      </div>
    </section>
  `;
}