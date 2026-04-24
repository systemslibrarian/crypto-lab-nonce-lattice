import type { AppConfigView } from '../types';

export function renderConfigPanel(config: AppConfigView): string {
  return `
    <section class="panel config-panel">
      <div class="panel-heading">
        <div>
          <p class="eyebrow">Attack Controls</p>
          <h2>Configuration</h2>
        </div>
        <div class="preset-row" role="group" aria-label="Scenario presets">
          <button class="preset-button" type="button" data-preset="fast-msb" title="24 MSBs — fastest recovery">⚡ MSB Demo</button>
          <button class="preset-button" type="button" data-preset="fast-lsb" title="24 LSBs — sub-second recovery">⚡ LSB Demo</button>
          <button class="preset-button" type="button" data-preset="p256-prefix" title="P-256 with fixed prefix nonces">🔒 P-256 Prefix</button>
          <button class="preset-button" type="button" data-preset="ps3" title="Same nonce reuse — 2 signatures enough">🎮 PS3 Bug</button>
          <button class="preset-button" type="button" data-preset="defender" title="RFC 6979 — attack should fail">🛡 Defender</button>
        </div>
      </div>
      <form id="attack-config-form" class="config-grid">
        <label>
          <span>Curve</span>
          <select name="curve">
            <option value="secp256k1" ${config.curve === 'secp256k1' ? 'selected' : ''}>secp256k1 (Bitcoin)</option>
            <option value="p256" ${config.curve === 'p256' ? 'selected' : ''}>P-256 (NIST)</option>
          </select>
        </label>
        <label>
          <span>Leak Mode</span>
          <select name="leakMode">
            <option value="msb" ${config.leakMode === 'msb' ? 'selected' : ''}>MSB leak — top bits known</option>
            <option value="lsb" ${config.leakMode === 'lsb' ? 'selected' : ''}>LSB leak — bottom bits known</option>
            <option value="fixed-prefix" ${config.leakMode === 'fixed-prefix' ? 'selected' : ''}>Fixed prefix — shared top bits</option>
            <option value="fixed-constant" ${config.leakMode === 'fixed-constant' ? 'selected' : ''}>Reused nonce — PS3-style</option>
            <option value="rfc6979" ${config.leakMode === 'rfc6979' ? 'selected' : ''}>RFC 6979 — deterministic (secure)</option>
          </select>
        </label>
        <label>
          <span>Leak Size (bits)</span>
          <input name="leakedBits" type="number" min="0" max="32" value="${config.leakedBits}" />
        </label>
        <label>
          <span>Signature Count</span>
          <input name="signatureCount" type="number" min="2" max="32" value="${config.signatureCount}" />
        </label>
        <label>
          <span>Fixed Prefix Variant</span>
          <select name="fixedPrefixVariant">
            <option value="random-tail" ${config.fixedPrefixVariant === 'random-tail' ? 'selected' : ''}>Same top bits, random tail</option>
            <option value="constant-nonce" ${config.fixedPrefixVariant === 'constant-nonce' ? 'selected' : ''}>Fully constant nonce</option>
          </select>
        </label>
        <label>
          <span>Fixed Prefix (hex, optional)</span>
          <input name="fixedPrefixValue" type="text" value="${config.fixedPrefixValue}" placeholder="e.g. deadbeef" />
        </label>
        <button class="primary-button" type="submit">▶ Generate Attack</button>
      </form>
    </section>
  `;
}