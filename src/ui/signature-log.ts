import { bytesToHex, formatScalar } from '../crypto/modular';
import type { CurveContext, SignatureRecord } from '../types';

export function renderSignatureLog(records: SignatureRecord[], curve: CurveContext): string {
  const rows = records
    .map((record) => {
      return `
        <tr>
          <td>${record.index + 1}</td>
          <td><code>${formatScalar(record.r, curve.orderBytes).slice(0, 20)}...</code></td>
          <td><code>${formatScalar(record.s, curve.orderBytes).slice(0, 20)}...</code></td>
          <td><code>${formatScalar(record.h, curve.orderBytes).slice(0, 18)}...</code></td>
          <td><code>${record.leakedLabel}</code></td>
          <td><code>${bytesToHex(record.digest).slice(0, 18)}...</code></td>
        </tr>
      `;
    })
    .join('');

  return `
    <section class="panel">
      <div class="panel-heading">
        <div>
          <p class="eyebrow">Observed Data</p>
          <h2>Signature Log</h2>
        </div>
      </div>
      <div class="table-shell">
        <table>
          <caption>Captured ECDSA signature components and leaked nonce metadata.</caption>
          <thead>
            <tr>
              <th scope="col">#</th>
              <th scope="col">r</th>
              <th scope="col">s</th>
              <th scope="col">h</th>
              <th scope="col">leaked_bits</th>
              <th scope="col">SHA-256</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </section>
  `;
}