import { type AnalysisBundle, type AnalysisRequest, type AnalysisResponse } from './analysis';
import { bytesToHex, formatScalar } from './crypto/modular';
import { renderBasisView } from './ui/basis-view';
import { renderConfigPanel } from './ui/config-panel';
import { renderLatticeView } from './ui/lattice-view';
import { renderRecoveryPanel } from './ui/recovery-panel';
import { renderSignatureLog } from './ui/signature-log';
import type { AppConfigView, FixedPrefixVariant, LeakConfig } from './types';

const MAX_SIGNATURE_COUNT = 32;
const STORAGE_CONFIG_KEY = 'nonce-lattice-config';

const DEFAULT_CONFIG: AppConfigView = {
  curve: 'secp256k1',
  leakMode: 'msb',
  leakedBits: 24,
  signatureCount: 12,
  fixedPrefixVariant: 'random-tail',
  fixedPrefixValue: '',
};

const presets: Record<string, AppConfigView> = {
  'fast-msb': {
    curve: 'secp256k1',
    leakMode: 'msb',
    leakedBits: 24,
    signatureCount: 12,
    fixedPrefixVariant: 'random-tail',
    fixedPrefixValue: '',
  },
  'fast-lsb': {
    curve: 'secp256k1',
    leakMode: 'lsb',
    leakedBits: 24,
    signatureCount: 12,
    fixedPrefixVariant: 'random-tail',
    fixedPrefixValue: '',
  },
  'p256-prefix': {
    curve: 'p256',
    leakMode: 'fixed-prefix',
    leakedBits: 24,
    signatureCount: 12,
    fixedPrefixVariant: 'random-tail',
    fixedPrefixValue: '',
  },
  ps3: {
    curve: 'secp256k1',
    leakMode: 'fixed-constant',
    leakedBits: 0,
    signatureCount: 2,
    fixedPrefixVariant: 'constant-nonce',
    fixedPrefixValue: '',
  },
  defender: {
    curve: 'secp256k1',
    leakMode: 'rfc6979',
    leakedBits: 0,
    signatureCount: 12,
    fixedPrefixVariant: 'random-tail',
    fixedPrefixValue: '',
  },
};

interface AppState {
  config: AppConfigView;
  analysis: AnalysisBundle | null;
  loading: boolean;
  error: string | null;
  elapsedMs: number;
}

function loadSavedConfig(): AppConfigView {
  try {
    const raw = localStorage.getItem(STORAGE_CONFIG_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<AppConfigView>;
      return normalizeConfig({ ...DEFAULT_CONFIG, ...parsed });
    }
  } catch {
    // ignore
  }
  return DEFAULT_CONFIG;
}

function saveConfig(config: AppConfigView): void {
  try {
    localStorage.setItem(STORAGE_CONFIG_KEY, JSON.stringify(config));
  } catch {
    // ignore
  }
}

function normalizeConfig(config: AppConfigView): AppConfigView {
  return {
    ...config,
    leakedBits: Math.max(0, Math.min(32, Math.trunc(config.leakedBits))),
    signatureCount: Math.max(2, Math.min(MAX_SIGNATURE_COUNT, Math.trunc(config.signatureCount))),
    fixedPrefixValue: config.fixedPrefixValue.trim(),
  };
}

function readConfig(form: HTMLFormElement): AppConfigView {
  const formData = new FormData(form);
  const leakMode = String(formData.get('leakMode') ?? 'msb') as LeakConfig['mode'];

  return normalizeConfig({
    curve: String(formData.get('curve') ?? 'secp256k1') as AppConfigView['curve'],
    leakMode,
    leakedBits: Number(formData.get('leakedBits') ?? 0),
    signatureCount: Number(formData.get('signatureCount') ?? 2),
    fixedPrefixVariant: String(formData.get('fixedPrefixVariant') ?? 'random-tail') as FixedPrefixVariant,
    fixedPrefixValue: String(formData.get('fixedPrefixValue') ?? ''),
  });
}

function scenarioDescription(config: AppConfigView): string {
  if (config.leakMode === 'fixed-constant') {
    return 'Sony PS3-style nonce reuse: two signatures are enough to recover d.';
  }
  if (config.leakMode === 'rfc6979') {
    return 'Deterministic nonces remove the leak, so the lattice should fail cleanly.';
  }
  if (config.leakMode === 'fixed-prefix') {
    return 'Browser-safe demo preset: a 24-bit fixed prefix plus 12 signatures gives a fast, reliable lattice recovery.';
  }
  if (config.leakMode === 'msb') {
    return 'Browser-safe demo preset: 24 known MSBs across 12 signatures recovers the key quickly without freezing the page.';
  }
  if (config.leakMode === 'lsb') {
    return 'Browser-safe demo preset: 24 known LSBs across 12 signatures gives a sub-second lattice recovery in most runs.';
  }
  return 'Partial nonce leakage turns each signature into a bounded hidden number instance solved with LLL.';
}

type PipelineStatus = 'idle' | 'running' | 'success' | 'failed';

function renderPipeline(status: PipelineStatus): string {
  const steps = [
    { key: 'keygen',  label: 'Key Gen' },
    { key: 'sign',    label: 'Sign' },
    { key: 'hnp',     label: 'Build HNP' },
    { key: 'lll',     label: 'LLL Reduce' },
    { key: 'extract', label: 'Extract Key' },
  ];

  function stepClass(index: number): string {
    if (status === 'idle') return '';
    if (status === 'running') {
      // animate the last step as "active", all previous as done
      if (index < steps.length - 1) return 'done';
      return 'active';
    }
    if (status === 'success') return 'done';
    if (status === 'failed') {
      if (index < steps.length - 1) return 'done';
      return 'failed';
    }
    return '';
  }

  function stepIcon(index: number): string {
    if (status === 'idle') return '';
    if (status === 'running') {
      if (index < steps.length - 1) return '✓ ';
      return '';
    }
    if (status === 'success') return '✓ ';
    if (status === 'failed') {
      if (index < steps.length - 1) return '✓ ';
      return '✗ ';
    }
    return '';
  }

  const stepsHtml = steps
    .map((step, i) => {
      const cls = stepClass(i);
      const icon = stepIcon(i);
      const spinner = (status === 'running' && i === steps.length - 1)
        ? '<span class="spinner"></span>'
        : '';
      const sep = i < steps.length - 1 ? '<span class="pipeline-arrow" aria-hidden="true">›</span>' : '';
      return `<span class="pipeline-step${cls ? ' ' + cls : ''}">${spinner}${icon}${step.label}</span>${sep}`;
    })
    .join('');

  return `<div class="attack-pipeline" aria-label="Attack pipeline">${stepsHtml}</div>`;
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
  const pipelineStatus: PipelineStatus = loading ? 'running' : error ? 'failed' : analysis ? (analysis.recovery.recoveredKey !== null ? 'success' : 'failed') : 'idle';

  const summary = loading
    ? `<span class="loading-label"><span class="spinner"></span> Running lattice analysis… <span class="elapsed-badge" id="elapsed-badge">${state.elapsedMs > 0 ? state.elapsedMs + ' ms' : '0 ms'}</span></span>`
    : error
      ? `Analysis failed: ${error}`
      : analysis === null
        ? 'Choose a preset or submit parameters to run the attack.'
        : analysis.recovery.recoveredKey === null
          ? 'Analysis complete: no matching key recovered for this run.'
          : `Attack recovered the exact signing key in ${analysis.elapsedMs} ms.`;
  const landingCard = 'Recover ECDSA private keys from partial nonce leakage — real signatures, real LLL lattice reduction, real byte-for-byte key recovery.';
  const analysisBody = loading
    ? `
        <section class="panel">
          <div class="panel-heading">
            <div>
              <p class="eyebrow">Analysis</p>
              <h2>Running computations</h2>
            </div>
          </div>
          <p class="muted">Generating signatures, reducing the HNP lattice, and checking key candidates in a background worker so the page stays responsive.</p>
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
            <p class="muted">Select a scenario preset or click Generate Attack to run the full nonce-lattice workflow.</p>
          </section>
        `
        : `
          ${renderRecoveryPanel({
            curve: analysis.curve,
            actualKey: analysis.privateKey,
            recoveredKey: analysis.recovery.recoveredKey,
            publicKey: analysis.publicKey,
            byteMatch: analysis.byteMatch,
            verificationPassed: analysis.verificationPassed,
            trace: analysis.recovery.trace,
          })}
          ${renderSignatureLog(analysis.signatures, analysis.curve)}
          ${renderLatticeView(analysis.recovery.trace)}
          ${renderBasisView(analysis.recovery.trace)}
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
            <code>${bytesToHex(analysis.publicKey).slice(0, 56)}…</code>
          </article>
          <article>
            <span>Signing Key</span>
            <code>${formatScalar(analysis.privateKey, analysis.curve.orderBytes).slice(0, 56)}…</code>
          </article>
          <article>
            <span>Signatures</span>
            <strong>${analysis.signatures.length}</strong>
          </article>
          <article>
            <span>Worker runtime</span>
            <strong>${analysis.elapsedMs} ms</strong>
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
          <p class="eyebrow">Attacks · ECDSA · Lattice Crypto</p>
          <h1>Nonce Lattice Lab</h1>
          <p class="lead">${landingCard}</p>
          <div class="chip-row">
            <span>ECDSA</span>
            <span>Hidden Number Problem</span>
            <span>LLL Reduction</span>
            <span>Nonce Bias</span>
            <span>secp256k1 / P-256</span>
          </div>
          ${renderPipeline(pipelineStatus)}
          <p class="scenario-line">${scenarioDescription(config)}</p>
          <p class="summary-line">${summary}</p>
        </div>

      </header>
      <main class="dashboard-grid" id="main-content" tabindex="-1">
        ${renderConfigPanel(config)}
        ${analysisBody}
        ${renderCaseStudies()}
        ${renderTimeline()}
        ${renderCrossReferences()}
        ${metaPanel}
      </main>
    </div>
  `;
}

export function mountApp(root: HTMLDivElement | null, onRender?: () => void): void {
  if (!root) {
    throw new Error('App root not found');
  }

  const state: AppState = {
    config: loadSavedConfig(),
    analysis: null,
    loading: false,
    error: null,
    elapsedMs: 0,
  };
  let activeRequestId = 0;
  let analysisWorker = createAnalysisWorker();
  let elapsedInterval: ReturnType<typeof setInterval> | null = null;
  let elapsedStart = 0;

  function createAnalysisWorker(): Worker {
    const worker = new Worker(new URL('./analysis-worker.ts', import.meta.url), { type: 'module' });
    worker.addEventListener('message', (event: MessageEvent<AnalysisResponse>) => {
      if (event.data.requestId !== activeRequestId) {
        return;
      }

      stopElapsedTimer();
      state.loading = false;
      if (event.data.error) {
        state.analysis = null;
        state.error = event.data.error;
      } else {
        state.analysis = event.data.analysis ?? null;
        state.error = null;
      }
      rerender();
    });
    worker.addEventListener('error', () => {
      if (!state.loading) {
        return;
      }

      stopElapsedTimer();
      state.loading = false;
      state.analysis = null;
      state.error = 'Background analysis worker failed.';
      rerender();
    });
    return worker;
  }

  function startElapsedTimer(): void {
    stopElapsedTimer();
    elapsedStart = Date.now();
    state.elapsedMs = 0;
    elapsedInterval = setInterval(() => {
      state.elapsedMs = Date.now() - elapsedStart;
      const badge = document.getElementById('elapsed-badge');
      if (badge) {
        badge.textContent = state.elapsedMs + ' ms';
      }
    }, 100);
  }

  function stopElapsedTimer(): void {
    if (elapsedInterval !== null) {
      clearInterval(elapsedInterval);
      elapsedInterval = null;
    }
  }

  const queueAnalysis = (config: AppConfigView) => {
    state.config = normalizeConfig(config);
    saveConfig(state.config);
    state.loading = true;
    state.error = null;
    state.elapsedMs = 0;
    activeRequestId += 1;
    analysisWorker.terminate();
    analysisWorker = createAnalysisWorker();
    rerender();
    startElapsedTimer();
    const request: AnalysisRequest = {
      requestId: activeRequestId,
      config: state.config,
    };
    analysisWorker.postMessage(request);
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
        queueAnalysis({ ...presets[preset] });
      });
    });

    const form = root.querySelector<HTMLFormElement>('#attack-config-form');
    form?.addEventListener('submit', (event) => {
      event.preventDefault();
      queueAnalysis(readConfig(form));
    });

    // Copy-to-clipboard buttons
    root.querySelectorAll<HTMLButtonElement>('[data-copy]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const text = btn.dataset.copy ?? '';
        navigator.clipboard?.writeText(text).then(() => {
          btn.classList.add('copied');
          btn.textContent = 'copied!';
          setTimeout(() => {
            btn.classList.remove('copied');
            btn.textContent = 'copy';
          }, 1800);
        }).catch(() => {/* silently ignore copy failures */});
      });
    });

    onRender?.();
  };

  rerender();
  queueAnalysis(state.config);
}
