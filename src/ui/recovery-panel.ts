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

function renderKeyCompare(actual: string, recovered: string | null): string {
  if (!recovered || actual === recovered) return '';
  const maxLen = Math.max(actual.length, recovered.length);
  const a = actual.padStart(maxLen, '0');
  const r = recovered.padStart(maxLen, '0');
  // Split into 2-char byte hex groups
  const aBytes: string[] = [];
  const rBytes: string[] = [];
  for (let i = 0; i < maxLen; i += 2) {
    aBytes.push(a.slice(i, i + 2));
    rBytes.push(r.slice(i, i + 2));
  }
  const aHtml = aBytes.map((b, i) => {
    const cls = b === rBytes[i] ? 'match' : 'mismatch';
    return `<span class="key-byte ${cls}">${b}</span>`;
  }).join('');
  const rHtml = rBytes.map((b, i) => {
    const cls = b === aBytes[i] ? 'match' : 'mismatch';
    return `<span class="key-byte ${cls}">${b}</span>`;
  }).join('');
  return `
    <div class="key-compare">
      <div class="key-compare-row" aria-label="Actual key bytes">${aHtml}</div>
      <div class="key-compare-row" aria-label="Recovered key bytes">${rHtml}</div>
    </div>`;
}

export function renderRecoveryPanel(data: RecoveryPanelData): string {
  const actualHex = formatScalar(data.actualKey, data.curve.orderBytes);
  const recoveredHex = data.recoveredKey === null ? null : formatScalar(data.recoveredKey, data.curve.orderBytes);
  const recovered = recoveredHex ?? 'not recovered';
  const statusClass = data.byteMatch ? 'success' : 'failure';
  const statusText = data.byteMatch ? '✓ PRIVATE KEY RECOVERED' : '✗ ANALYSIS COMPLETE — KEY NOT RECOVERED';
  const diagnostics = data.trace.diagnostics.map((line) => `<li>${line}</li>`).join('');

  return `
    <section class="panel recovery-panel">
      <div class="recovery-banner ${statusClass}" role="status" aria-live="polite" aria-atomic="true">
        <span>${statusText}</span>
      </div>
      <div class="recovery-grid">
        <article class="key-card">
          <div class="key-card-header">
            <p class="eyebrow">Signing Key</p>
            <button class="copy-btn" type="button" data-copy="${actualHex}">copy</button>
          </div>
          <code>${actualHex}</code>
        </article>
        <article class="key-card">
          <div class="key-card-header">
            <p class="eyebrow">Recovered Key</p>
            ${recoveredHex ? `<button class="copy-btn" type="button" data-copy="${recoveredHex}">copy</button>` : ''}
          </div>
          <code>${recovered}</code>
        </article>
        <article class="key-card">
          <div class="key-card-header">
            <p class="eyebrow">Public Key</p>
            <button class="copy-btn" type="button" data-copy="${bytesToHex(data.publicKey)}">copy</button>
          </div>
          <code>${bytesToHex(data.publicKey).slice(0, 48)}…</code>
        </article>
        <article class="key-card">
          <p class="eyebrow">Validation</p>
          <strong>${data.byteMatch ? 'byte-for-byte match ✓' : 'no match'}</strong>
          <span>${data.verificationPassed ? 'all signatures verify ✓' : 'verification mismatch detected'}</span>
        </article>
      </div>
      ${renderKeyCompare(actualHex, recoveredHex)}
      <div class="info-stack">
        <article class="callout">
          <p class="eyebrow">Recovery Panel</p>
          <h2>Diagnostics</h2>
          <ul>${diagnostics}</ul>
        </article>
        <details class="callout" open>
          <summary>What's Real, What's Simulated</summary>
          <div class="details-body">
            <p><strong>Real in this demo:</strong></p>
            <ul>
              <li>Every ECDSA signature is produced with real secp256k1 or P-256 arithmetic.</li>
              <li>Every scalar multiplication uses the actual curve base point and order.</li>
              <li>LLL reduction runs on bigint matrices with exact rational Gram-Schmidt.</li>
              <li>The HNP lattice uses the Nguyen-Shparlinski reduction and validates the recovered key through Q = dG.</li>
            </ul>
            <p><strong>Simulated for browser context:</strong></p>
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
          <p>ECDSA signs with <code>s = k⁻¹(h + rd)</code>, so every signature gives one equation linking the nonce and the secret key. The moment a few bits of k are known, the congruence collapses into a bounded hidden number problem where lattice reduction can isolate the missing scalar.</p>
          <p>RFC 6979 removes that moving part by deriving k from <code>HMAC(d, m)</code>, so nonce quality no longer depends on ambient randomness. The security question shifts from operating-system entropy to whether the deterministic derivation stays constant-time and implementation-correct.</p>
          <p>Timing, cache, power, and EM leakage all terminate in the same place: they leak a few bits of k. The lattice stage shown here is the final step that turns partial nonce information into the signing key.</p>
        </article>
      </div>
    </section>
  `;
}