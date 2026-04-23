import type { CurveName, FixedPrefixVariant, LeakMode } from '../types';

export interface AppConfigView {
  curve: CurveName;
  leakMode: LeakMode;
  leakedBits: number;
  signatureCount: number;
  fixedPrefixVariant: FixedPrefixVariant;
  fixedPrefixValue: string;
}

export function renderConfigPanel(config: AppConfigView): string {
  return `
    <section class="panel config-panel">
      <div class="panel-heading">
        <div>
          <p class="eyebrow">Attack Controls</p>
          <h2>Config</h2>
        </div>
        <div class="preset-row" role="group" aria-label="Scenario presets">
          <button class="preset-button" type="button" data-preset="ps3">The PS3 Bug</button>
          <button class="preset-button" type="button" data-preset="minerva">Minerva-style</button>
          <button class="preset-button" type="button" data-preset="deep-bias">Deep Bias</button>
          <button class="preset-button" type="button" data-preset="defender">Defender Mode</button>
        </div>
      </div>
      <form id="attack-config-form" class="config-grid">
        <label>
          <span>Curve</span>
          <select name="curve">
            <option value="secp256k1" ${config.curve === 'secp256k1' ? 'selected' : ''}>secp256k1</option>
            <option value="p256" ${config.curve === 'p256' ? 'selected' : ''}>P-256</option>
          </select>
        </label>
        <label>
          <span>Leak Mode</span>
          <select name="leakMode">
            <option value="msb" ${config.leakMode === 'msb' ? 'selected' : ''}>MSB leak</option>
            <option value="lsb" ${config.leakMode === 'lsb' ? 'selected' : ''}>LSB leak</option>
            <option value="fixed-prefix" ${config.leakMode === 'fixed-prefix' ? 'selected' : ''}>Fixed prefix</option>
            <option value="fixed-constant" ${config.leakMode === 'fixed-constant' ? 'selected' : ''}>Reused nonce</option>
            <option value="rfc6979" ${config.leakMode === 'rfc6979' ? 'selected' : ''}>RFC 6979</option>
          </select>
        </label>
        <label>
          <span>Leak Size (bits)</span>
          <input name="leakedBits" type="number" min="0" max="32" value="${config.leakedBits}" />
        </label>
        <label>
          <span>Signatures</span>
          <input name="signatureCount" type="number" min="2" max="120" value="${config.signatureCount}" />
        </label>
        <label>
          <span>Fixed Prefix Variant</span>
          <select name="fixedPrefixVariant">
            <option value="random-tail" ${config.fixedPrefixVariant === 'random-tail' ? 'selected' : ''}>same top bits, random bottom</option>
            <option value="constant-nonce" ${config.fixedPrefixVariant === 'constant-nonce' ? 'selected' : ''}>same full nonce</option>
          </select>
        </label>
        <label>
          <span>Fixed Prefix Value (hex)</span>
          <input name="fixedPrefixValue" type="text" value="${config.fixedPrefixValue}" placeholder="optional" />
        </label>
        <button class="primary-button" type="submit">Generate Attack</button>
      </form>
    </section>
  `;
}