import { recoverKey } from './attacks/recover-key';
import { createNonceGenerator } from './crypto/biased-nonce';
import { sign, verify } from './crypto/ecdsa';
import { bigIntToBytes, bytesToHex, formatScalar, randomScalar } from './crypto/modular';
import { p256Curve } from './curves/p256';
import { secp256k1Curve } from './curves/secp256k1';
import { renderBasisView } from './ui/basis-view';
import { renderConfigPanel, type AppConfigView } from './ui/config-panel';
import { renderLatticeView } from './ui/lattice-view';
import { renderRecoveryPanel } from './ui/recovery-panel';
import { renderSignatureLog } from './ui/signature-log';
import type { CurveContext, FixedPrefixVariant, LeakConfig, RecoveryResult, SignatureRecord } from './types';

const curveMap: Record<string, CurveContext> = {
  secp256k1: secp256k1Curve,
  p256: p256Curve,
};

const presets: Record<string, AppConfigView> = {
  ps3: {
    curve: 'secp256k1',
    leakMode: 'fixed-constant',
    leakedBits: 0,
    signatureCount: 2,
    fixedPrefixVariant: 'constant-nonce',
    fixedPrefixValue: '',
  },
  minerva: {
    curve: 'secp256k1',
    leakMode: 'msb',
    leakedBits: 3,
    signatureCount: 100,
    fixedPrefixVariant: 'random-tail',
    fixedPrefixValue: '',
  },
  'deep-bias': {
    curve: 'p256',
    leakMode: 'lsb',
    leakedBits: 8,
    signatureCount: 20,
    fixedPrefixVariant: 'random-tail',
    fixedPrefixValue: '',
  },
  defender: {
    curve: 'secp256k1',
    leakMode: 'rfc6979',
    leakedBits: 0,
    signatureCount: 100,
    fixedPrefixVariant: 'random-tail',
    fixedPrefixValue: '',
  },
};

interface AnalysisBundle {
  curve: CurveContext;
  privateKey: bigint;
  publicKey: Uint8Array;
  signatures: SignatureRecord[];
  recovery: RecoveryResult;
  verificationPassed: boolean;
  byteMatch: boolean;
}

interface AppState {
  config: AppConfigView;
  analysis: AnalysisBundle | null;
  loading: boolean;
  error: string | null;
}

function parseHexScalar(value: string): bigint | undefined {
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }
  return BigInt(`0x${trimmed.replace(/^0x/, '')}`);
}

function buildLeakConfig(config: AppConfigView): LeakConfig {
  return {
    mode: config.leakMode,
    bits: config.leakedBits,
    fixedPrefixVariant: config.fixedPrefixVariant,
    fixedPrefixValue: parseHexScalar(config.fixedPrefixValue),
  };
}

function scenarioDescription(config: AppConfigView): string {
  if (config.leakMode === 'fixed-constant') {
    return 'Sony PS3-style nonce reuse: two signatures are enough to recover d.';
  }
  if (config.leakMode === 'rfc6979') {
    return 'Deterministic nonces remove the leak, so the lattice should fail cleanly.';
  }
  if (config.leakMode === 'fixed-prefix') {
    return 'The signer reuses a known prefix and leaves the tail random, mirroring a structural RNG bias.';
  }
  return 'Partial nonce leakage turns each signature into a bounded hidden number instance solved with LLL.';
}

function runAnalysis(config: AppConfigView): AnalysisBundle {
  const curve = curveMap[config.curve];
  const privateKey = randomScalar(curve);
  const leakConfig = buildLeakConfig(config);
  const generator = createNonceGenerator(leakConfig, curve, privateKey);
  const signatures = Array.from({ length: config.signatureCount }, (_, index) => {
    return sign(privateKey, `nonce-lattice sample ${index + 1}`, curve, leakConfig, index, generator);
  });
  const verificationPassed = signatures.every((signature) => verify(signature.publicKey, signature.digest, signature.r, signature.s, curve));
  const recovery = recoverKey(signatures, leakConfig, curve);
  const recoveredBytes = recovery.recoveredKey === null ? null : bigIntToBytes(recovery.recoveredKey, curve.orderBytes);
  const actualBytes = bigIntToBytes(privateKey, curve.orderBytes);
  const byteMatch = recoveredBytes !== null && recoveredBytes.every((value, index) => value === actualBytes[index]);

  return {
    curve,
    privateKey,
    publicKey: signatures[0]?.publicKey ?? curve.getPublicKey(actualBytes, false),
    signatures,
    recovery,
    verificationPassed,
    byteMatch,
  };
}

function renderCaseStudies(): string {
  return `
    <section class="panel span-two">
      <div class="panel-heading">
        <div>
          <p class="eyebrow">Historical Case Studies</p>
          <h2>Why defenders should care</h2>
        </div>
      </div>
      <div class="details-stack">
        <details open>
          <summary>PS3 (2010)</summary>
          <p>Sony reused the same nonce k across firmware signatures. If two signatures share r, then k = (h1 - h2)/(s1 - s2) mod n and d = (s1k - h1)/r mod n.</p>
        </details>
        <details>
          <summary>Android Bitcoin wallet bug (2013)</summary>
          <p>Weak SecureRandom output produced repeated or biased ECDSA nonces, which let attackers reconstruct wallet keys and drain funds.</p>
        </details>
        <details>
          <summary>Bleichenbacher-Blake-Wilson 2002</summary>
          <p>The original Hidden Number Problem framing showed how partial nonce information in DSA-style signatures can be converted into a lattice instance.</p>
        </details>
        <details>
          <summary>Minerva (2019)</summary>
          <p>A timing side channel on modular inversion leaked top nonce bits from smart cards, putting real ECDSA keys into the same reduction used here.</p>
        </details>
        <details>
          <summary>TPM-FAIL (2019)</summary>
          <p>Intel fTPM and STMicroelectronics implementations leaked ECDSA nonce information through timing, enabling recovery with enough traces.</p>
        </details>
      </div>
    </section>
  `;
}

function renderTimeline(): string {
  const entries = [
    ['1996', 'Bleichenbacher first sketches the attack direction.'],
    ['2002', 'Howgrave-Graham and Smart formalize the lattice angle.'],
    ['2003', 'Nguyen-Shparlinski publish the reduction used here.'],
    ['2010', 'Sony PS3 reveals catastrophic nonce reuse.'],
    ['2013', 'Android SecureRandom failures drain Bitcoin wallets.'],
    ['2019', 'Minerva extracts nonce bits from smart cards.'],
    ['2019', 'TPM-FAIL lands against vendor TPM stacks.'],
    ['2024', 'KyberSlash shows the same implementation class survives PQC.'],
  ];

  return `
    <section class="panel span-two">
      <div class="panel-heading">
        <div>
          <p class="eyebrow">Premium Timeline</p>
          <h2>Historical arc</h2>
        </div>
      </div>
      <div class="timeline">
        ${entries
          .map(([year, text]) => `<article class="timeline-item"><span>${year}</span><p>${text}</p></article>`)
          .join('')}
      </div>
    </section>
  `;
}

function renderCrossReferences(): string {
  const cards = [
    ['crypto-lab-ecdsa-forge', 'https://systemslibrarian.github.io/crypto-lab-ecdsa-forge/', 'Base ECDSA signing and verification primitives.'],
    ['crypto-lab-lll-break', 'https://systemslibrarian.github.io/crypto-lab-lll-break/', 'LLL reduction isolated from the crypto attack path.'],
    ['crypto-lab-timing-oracle', 'https://systemslibrarian.github.io/crypto-lab-timing-oracle/', 'Side-channel primitives that leak nonce information.'],
    ['crypto-lab-kyberslash', 'https://systemslibrarian.github.io/crypto-lab-kyberslash/', 'The post-quantum timing analogue for ML-KEM.'],
  ];
  return `
    <section class="panel span-two">
      <div class="panel-heading">
        <div>
          <p class="eyebrow">Portfolio Links</p>
          <h2>Cross-reference panel</h2>
        </div>
      </div>
      <div class="card-grid">
        ${cards
          .map(([title, url, text]) => {
            return `<a class="link-card" href="${url}" target="_blank" rel="noreferrer" aria-label="${title} (opens in a new tab)"><strong>${title}</strong><span>${text}</span></a>`;
          })
          .join('')}
      </div>
    </section>
  `;
}

function renderApp(state: AppState): string {
  const { config, analysis, loading, error } = state;
  const summary = loading
    ? 'Running lattice analysis...'
    : error
      ? `Analysis failed: ${error}`
      : analysis === null
        ? 'Choose a preset or submit parameters to run the attack.'
      : analysis?.recovery.recoveredKey === null
        ? 'Attack did not recover a matching key.'
        : 'Attack recovered the exact signing key.';
  const landingCard = `Recover ECDSA private keys from partial nonce leakage - real signatures, real LLL lattice reduction, real byte-for-byte key recovery.`;
  const analysisBody = loading
    ? `
        <section class="panel">
          <div class="panel-heading">
            <div>
              <p class="eyebrow">Analysis</p>
              <h2>Running computations</h2>
            </div>
          </div>
          <p class="muted">Generating signatures, reducing lattices, and checking key candidates...</p>
        </section>
      `
    : error
      ? `
        <section class="panel">
          <div class="panel-heading">
            <div>
              <p class="eyebrow">Analysis</p>
              <h2>Failed to run</h2>
            </div>
          </div>
          <p class="muted">${error}</p>
        </section>
      `
      : analysis === null
      ? `
        <section class="panel">
          <div class="panel-heading">
            <div>
              <p class="eyebrow">Analysis</p>
              <h2>Ready to run</h2>
            </div>
          </div>
          <p class="muted">The dashboard is loaded. Select a scenario preset or click Generate Attack to run the full nonce-lattice workflow.</p>
        </section>
      `
      : `
        ${renderRecoveryPanel({
          curve: analysis!.curve,
          actualKey: analysis!.privateKey,
          recoveredKey: analysis!.recovery.recoveredKey,
          publicKey: analysis!.publicKey,
          byteMatch: analysis!.byteMatch,
          verificationPassed: analysis!.verificationPassed,
          trace: analysis!.recovery.trace,
        })}
        ${renderSignatureLog(analysis!.signatures, analysis!.curve)}
        ${renderLatticeView(analysis!.recovery.trace)}
        ${renderBasisView(analysis!.recovery.trace)}
      `;

  const metaPanel = analysis
    ? `
      <section class="panel span-two meta-panel">
        <div class="panel-heading">
          <div>
            <p class="eyebrow">Attack State</p>
            <h2>Execution details</h2>
          </div>
        </div>
        <div class="meta-grid">
          <article>
            <span>Curve</span>
            <strong>${analysis.curve.label}</strong>
          </article>
          <article>
            <span>Public Key</span>
            <code>${bytesToHex(analysis.publicKey).slice(0, 56)}...</code>
          </article>
          <article>
            <span>Signing Key</span>
            <code>${formatScalar(analysis.privateKey, analysis.curve.orderBytes).slice(0, 56)}...</code>
          </article>
          <article>
            <span>Signatures</span>
            <strong>${analysis.signatures.length}</strong>
          </article>
        </div>
      </section>
    `
    : '';

  return `
    <a class="skip-link" href="#main-content">Skip to main content</a>
    <div class="app-shell">
      <header class="hero">
        <div class="hero-copy">
          <p class="eyebrow">Attacks</p>
          <h1>crypto-lab-nonce-lattice</h1>
          <p class="lead">${landingCard}</p>
          <div class="chip-row">
            <span>ECDSA</span>
            <span>Hidden Number Problem</span>
            <span>LLL</span>
            <span>Nonce Bias</span>
          </div>
          <p class="scenario-line">${scenarioDescription(config)}</p>
          <p class="summary-line">${summary}</p>
        </div>
        <button
          class="theme-toggle"
          data-theme-toggle
          aria-label="Switch to light mode"
          style="position: absolute; top: 0; right: 0;"
          type="button"
        >🌙</button>
      </header>
      <main class="dashboard-grid" id="main-content" tabindex="-1">
        ${renderConfigPanel(config)}
        ${analysisBody}
        ${renderCaseStudies()}
        ${renderTimeline()}
        ${renderCrossReferences()}
      </main>
      ${metaPanel}
    </div>
  `;
}

export function mountApp(root: HTMLDivElement | null, onRender?: () => void): void {
  if (!root) {
    throw new Error('App root not found');
  }

  const state: AppState = {
    config: {
      curve: 'secp256k1',
      leakMode: 'msb',
      leakedBits: 4,
      signatureCount: 40,
      fixedPrefixVariant: 'random-tail',
      fixedPrefixValue: '',
    },
    analysis: null,
    loading: false,
    error: null,
  };

  const rerender = () => {
    root.innerHTML = renderApp(state);

    const presetButtons = root.querySelectorAll<HTMLButtonElement>('[data-preset]');
    presetButtons.forEach((button) => {
      button.addEventListener('click', () => {
        const preset = button.dataset.preset;
        if (!preset || !presets[preset]) {
          return;
        }
        state.config = { ...presets[preset] };
          state.loading = true;
          state.error = null;
        rerender();
          setTimeout(() => {
            try {
              state.analysis = runAnalysis(state.config);
              state.error = null;
            } catch (analysisError) {
              state.analysis = null;
              state.error = analysisError instanceof Error ? analysisError.message : 'Unknown analysis error.';
            } finally {
              state.loading = false;
              rerender();
            }
          }, 0);
      });
    });

    const form = root.querySelector<HTMLFormElement>('#attack-config-form');
    form?.addEventListener('submit', (event) => {
      event.preventDefault();
      const formData = new FormData(form);
      const leakMode = String(formData.get('leakMode') ?? 'msb') as LeakConfig['mode'];
      state.config = {
        curve: String(formData.get('curve') ?? 'secp256k1') as AppConfigView['curve'],
        leakMode,
        leakedBits: Number(formData.get('leakedBits') ?? 0),
        signatureCount: Number(formData.get('signatureCount') ?? 2),
        fixedPrefixVariant: String(formData.get('fixedPrefixVariant') ?? 'random-tail') as FixedPrefixVariant,
        fixedPrefixValue: String(formData.get('fixedPrefixValue') ?? ''),
      };
        state.loading = true;
        state.error = null;
      rerender();
        setTimeout(() => {
          try {
            state.analysis = runAnalysis(state.config);
            state.error = null;
          } catch (analysisError) {
            state.analysis = null;
            state.error = analysisError instanceof Error ? analysisError.message : 'Unknown analysis error.';
          } finally {
            state.loading = false;
            rerender();
          }
        }, 0);
    });

    onRender?.();
  };

  rerender();
}