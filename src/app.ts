import { runAnalysis, type AnalysisBundle, type AnalysisRequest, type AnalysisResponse } from './analysis';
import { bytesToHex, formatScalar } from './crypto/modular';
import { p256Curve } from './curves/p256';
import { secp256k1Curve } from './curves/secp256k1';
import { renderAttackVsDefensePanel } from './ui/attack-vs-defense-panel';
import { renderBasisView } from './ui/basis-view';
import { renderConfigPanel } from './ui/config-panel';
import { getDiagnostic } from './ui/diagnostics';
import { renderFeasibility } from './ui/feasibility';
import { renderLatticeView } from './ui/lattice-view';
import { renderRecoveryPanel } from './ui/recovery-panel';
import { renderSignatureLog } from './ui/signature-log';
import type { AppConfigView, CurveContext, FixedPrefixVariant, LeakConfig } from './types';

const curveMap: Record<string, CurveContext> = {
  secp256k1: secp256k1Curve,
  p256: p256Curve,
};

function isCloneSerializationError(message: string): boolean {
  return /could not be cloned|DataCloneError/i.test(message);
}

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
  pipelineStage: number;
  /** Which guided-walkthrough step tab is showing (sign | build | reduce | extract). */
  activeStep: string;
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

const PIPELINE_STEPS = [
  { key: 'keygen',  label: 'Key Gen' },
  { key: 'sign',    label: 'Sign' },
  { key: 'hnp',     label: 'Build HNP' },
  { key: 'lll',     label: 'LLL Reduce' },
  { key: 'extract', label: 'Extract Key' },
];

/** `stage` is how many steps have finished so far (0..steps.length). While running we
 *  advance it on a short timer so the pipeline actually walks the sequence instead of
 *  flipping the first four to done instantly. The final step only resolves when the
 *  worker returns success/failure. */
function renderPipeline(status: PipelineStatus, stage: number): string {
  const steps = PIPELINE_STEPS;
  const last = steps.length - 1;

  function stepClass(index: number): string {
    if (status === 'idle') return '';
    if (status === 'success') return 'done';
    if (status === 'failed') return index < last ? 'done' : 'failed';
    // running: steps below `stage` are done, the step at `stage` is active
    if (index < stage) return 'done';
    if (index === stage) return 'active';
    return '';
  }

  function stepIcon(index: number): string {
    if (status === 'idle') return '';
    if (status === 'success') return '✓ ';
    if (status === 'failed') return index < last ? '✓ ' : '✗ ';
    return index < stage ? '✓ ' : '';
  }

  const stepsHtml = steps
    .map((step, i) => {
      const cls = stepClass(i);
      const icon = stepIcon(i);
      const spinner = status === 'running' && i === stage ? '<span class="spinner"></span>' : '';
      const sep = i < last ? '<span class="pipeline-arrow" aria-hidden="true">›</span>' : '';
      return `<span class="pipeline-step${cls ? ' ' + cls : ''}">${spinner}${icon}${step.label}</span>${sep}`;
    })
    .join('');

  return `<div class="attack-pipeline" aria-label="Attack pipeline">${stepsHtml}</div>`;
}

function renderHowItWorks(config: AppConfigView, analysis: AnalysisBundle | null): string {
  const leakExplanation =
    config.leakMode === 'msb'
      ? `In this run, the attacker is assumed to know the top ${config.leakedBits} bits of each nonce k. That shrinks each unknown nonce to a bounded error term, which is exactly what the HNP lattice expects.`
      : config.leakMode === 'lsb'
        ? `In this run, the attacker is assumed to know the bottom ${config.leakedBits} bits of each nonce k. The code rescales each signature equation so the unknown part is centered and bounded before lattice construction.`
        : config.leakMode === 'fixed-prefix'
          ? `In this run, each nonce shares a fixed high-bit prefix and differs only in the tail. That gives repeated structure across signatures and creates the bounded variables needed for key recovery.`
          : config.leakMode === 'fixed-constant'
            ? 'This run is a nonce-reuse case. If two signatures share the same r, the secret key can be solved algebraically without lattice reduction.'
            : 'This run uses RFC 6979 deterministic nonces. With no nonce leakage, the lattice should not recover the key.';

  const statusExplanation = analysis
    ? analysis.recovery.recoveredKey === null
      ? 'Result: no valid private key candidate matched the public key for this parameter set.'
      : `Result: recovered key candidate verified against Q = dG in ${analysis.elapsedMs} ms.`
    : 'Run a preset or submit parameters to generate signatures and see each attack stage populate below.';

  return `
    <section class="panel span-two explain-panel">
      <div class="panel-heading">
        <div>
          <p class="eyebrow">Walkthrough</p>
          <h2>What this run is doing</h2>
        </div>
      </div>
      <div class="explain-grid">
        <article class="callout">
          <h3>1) ECDSA equation behind every signature</h3>
          <p>Each signature satisfies <code>s = k⁻¹(h + r·d) mod n</code>, where <code>d</code> is the secret key, <code>k</code> is the nonce, <code>h</code> is the message hash scalar, and <code>r,s</code> are public signature values.</p>
          <p>Rearranged, this is a linear congruence: <code>r·d − s·k + h ≡ 0 (mod n)</code>. One signature gives one equation, but both <code>d</code> and <code>k</code> are unknown.</p>
        </article>
        <article class="callout">
          <h3>2) Why leakage changes everything</h3>
          <p>${leakExplanation}</p>
          <p>After centering/scaling, each signature contributes a bounded error term. Stacking those constraints produces a Hidden Number Problem instance.</p>
        </article>
        <article class="callout">
          <h3>3) Lattice stage</h3>
          <p>The app builds a basis matrix from all signature constraints, applies LLL reduction, then searches short vectors (or Babai nearest-plane) for a candidate secret scalar.</p>
          <p>If the reduced vector encodes <code>d</code>, the app validates it by recomputing the public key and comparing bytes against the signer key.</p>
        </article>
        <article class="callout">
          <h3>4) Verification stage</h3>
          <p>${statusExplanation}</p>
          <p>Panels below show the exact signatures, basis before/after LLL, reduced vector lengths, and diagnostics from the recovery path used in this run.</p>
        </article>
      </div>
    </section>
  `;
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
          <summary>PS3 (2010) — Sony firmware nonce reuse</summary>
          <p>Sony signed every PlayStation 3 firmware update with the same ECDSA nonce <code>k</code>. Because <code>k</code> is identical across signatures, the <code>r</code> values match, and two equations in two unknowns collapse immediately: <code>k = (h₁ − h₂)(s₁ − s₂)⁻¹ mod n</code>, then <code>d = (s₁k − h₁)r⁻¹ mod n</code>. The private key that protects the entire console signing chain fell to arithmetic a first-year student could follow. fail0verflow (bushing, marcan, segher, sven) demonstrated the recovery on stage at 27C3, the Chaos Communication Congress, on 29 December 2010; George Hotz published the derived root signing key days later, in early January 2011.</p>
        </details>
        <details>
          <summary>Android Bitcoin wallet bug (2013) — broken SecureRandom</summary>
          <p>In August 2013 a flaw in Android's <code>SecureRandom</code> PRNG caused the JVM entropy pool to be seeded with the same value across process restarts on certain devices. Bitcoin wallets using ECDSA over secp256k1 produced signatures where <code>k</code> repeated across different transactions — sometimes across different users on the same ROM build. Matching <code>r</code> values in the blockchain were detectable by anyone scanning for them, and the private keys followed immediately. Researchers scanned the public ledger, found the collisions, and the Bitcoin Security team issued an emergency patch within days. Wallet funds were drained in the window before users updated.</p>
        </details>
        <details>
          <summary>Boneh–Venkatesan / Howgrave-Graham &amp; Smart / Nguyen–Shparlinski (1996–2003) — the lattice framing</summary>
          <p>Boneh and Venkatesan introduced the <em>Hidden Number Problem</em> in 1996 and showed it is solvable by lattice reduction from roughly <code>√(log₂ n)</code> known bits per sample. Howgrave-Graham and Smart (2001) applied that framing to DSA/ECDSA nonce leakage: each biased signature contributes one linear congruence over ℤ/nℤ, and stacking enough of them builds a lattice whose shortest vector encodes the secret key. Nguyen and Shparlinski then proved it rigorously — about <code>√(log₂ n)</code> known nonce bits per signature (≈ 16 bits on a 256-bit curve), across a number of signatures linear in <code>log₂ n</code>, suffices for polynomial-time key recovery; in practice implementations have fallen to far fewer bits than that. This is the direct theoretical basis for the attack demonstrated in this lab.</p>
        </details>
        <details>
          <summary>Minerva (2019) — smart-card timing leak</summary>
          <p>Researchers at Masaryk University discovered that several ECDSA implementations — the Athena IDProtect smart card (FIPS 140-2 certified) plus the libgcrypt, MatrixSSL, wolfSSL, Crypto++ and SunEC/OpenJDK libraries — used scalar multiplication routines whose execution time depended on the bit-length of the nonce <code>k</code>. Measuring response times over a local USB or contactless reader was enough to recover the top few bits of <code>k</code> for each signature. Roughly 2,100 timed signatures from the card gave the Hidden Number Problem lattice enough constraints to recover the long-term secp256r1 private key. Cards from Infineon, NXP JCOP and G&amp;D, and the YubiKey HSM 2, were tested and found not to leak.</p>
        </details>
        <details>
          <summary>TPM-FAIL (2019) — Intel fTPM and STMicro leaking nonce bits</summary>
          <p>Moghimi, Sunar, Eisenbarth, and Heninger showed that both the Intel firmware TPM (fTPM) running on the Management Engine and a certified STMicroelectronics discrete TPM chip leaked ECDSA nonce information through timing. On the Intel fTPM, the modular inversion step during signing varied by up to 10,000 cycles depending on the nonce value, measurable from userspace via <code>rdtsc</code> with no special privileges. On the ST chip, the leak was observable over a network from the same rack. With a few thousand measurements and a straightforward HNP lattice reduction, both the P-256 and P-384 private keys stored in the TPM could be extracted — keys that protect disk encryption, remote attestation, and platform integrity on affected machines.</p>
        </details>
      </div>
    </section>
  `;
}

function renderTimeline(): string {
  const entries = [
    ['1996', 'Boneh and Venkatesan introduce the Hidden Number Problem.'],
    ['2001', 'Howgrave-Graham and Smart formalize the lattice angle.'],
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

function classifyFailureReason(config: AppConfigView, analysis: AnalysisBundle): string {
  if (config.leakMode === 'rfc6979') return 'defender-mode';
  if (config.leakMode === 'fixed-constant') return 'lattice-failure';
  if (config.signatureCount < 8 || config.leakedBits < 12) return 'not-enough-signatures';
  void analysis;
  return 'lattice-failure';
}

/** Revives the authored Attack Path / Defense Path scaffolding (dead code until now)
 *  and, on a failed run, surfaces the matching plain-language diagnostic. This is the
 *  step-by-step map of the whole attack the panel labels only hint at. */
function renderAttackWorkflow(config: AppConfigView, analysis: AnalysisBundle | null): string {
  const failed = analysis !== null && analysis.recovery.recoveredKey === null;
  const diagnostic = failed
    ? `<p class="workflow-diagnostic" role="status">${getDiagnostic(classifyFailureReason(config, analysis))}</p>`
    : '';
  return `
    <section class="panel span-two workflow-panel">
      <div class="panel-heading">
        <div>
          <p class="eyebrow">Step-by-step</p>
          <h2>Attack workflow vs. defense</h2>
        </div>
      </div>
      <p class="muted">The attack is a fixed pipeline; each defense removes one rung. The
      interactive panels below walk the left column with the real numbers from your run.</p>
      ${renderAttackVsDefensePanel()}
      ${diagnostic}
    </section>
  `;
}

/** MEDIUM #5: for nonce reuse (PS3), the whole recovery is two lines of algebra a
 *  newcomer can follow with no lattice theory. Show them with the real r/s/h/k/d. */
function renderNonceReuseDerivation(analysis: AnalysisBundle): string {
  const alg = analysis.recovery.trace.algebra;
  if (!alg) return '';
  const b = analysis.curve.orderBytes;
  const clip = (v: bigint): string => {
    const hex = formatScalar(v, b);
    return hex.length > 24 ? `${hex.slice(0, 12)}…${hex.slice(-8)}` : hex;
  };
  return `
    <section class="panel span-two reuse-derivation">
      <div class="panel-heading">
        <div>
          <p class="eyebrow">Worked derivation — nonce reuse</p>
          <h2>Two signatures, no lattice needed</h2>
        </div>
      </div>
      <p class="muted">Because the same nonce <code>k</code> signed both messages, the two
      signatures share the same <code>r</code>. That collapses two equations in two unknowns
      into direct arithmetic — the exact break behind the 2010 PS3 key recovery:</p>
      <div class="derivation-steps">
        <div class="derivation-step">
          <span class="step-tag">1. same nonce ⟹ same r</span>
          <code>r₁ = r₂ = ${clip(alg.r)}</code>
        </div>
        <div class="derivation-step">
          <span class="step-tag">2. solve for the nonce k</span>
          <code>k = (h₁ − h₂)·(s₁ − s₂)⁻¹ mod n</code>
          <code class="derivation-sub">= (${clip(alg.h1)} − ${clip(alg.h2)})·(${clip(alg.s1)} − ${clip(alg.s2)})⁻¹</code>
          <code class="derivation-result">k = ${clip(alg.k)}</code>
        </div>
        <div class="derivation-step">
          <span class="step-tag">3. solve for the private key d</span>
          <code>d = (s₁·k − h₁)·r₁⁻¹ mod n</code>
          <code class="derivation-sub">= (${clip(alg.s1)}·${clip(alg.k)} − ${clip(alg.h1)})·${clip(alg.r)}⁻¹</code>
          <code class="derivation-result derivation-key">d = ${clip(alg.d)}</code>
        </div>
      </div>
      <p class="muted">Every number above is from this run; the recovered <code>d</code> matches the
      signer's key byte-for-byte in the panel above.</p>
    </section>
  `;
}

/** Always-visible on-ramp: the one equation the whole attack turns on, shown before any
 *  deep panel so a newcomer meets the concept before the machinery. */
function renderEcdsaCallout(): string {
  return `
    <section class="panel span-two ecdsa-callout">
      <div class="panel-heading">
        <div>
          <p class="eyebrow">Start here</p>
          <h2>The one equation everything hangs on</h2>
        </div>
      </div>
      <p class="callout-lead">Every ECDSA signature satisfies</p>
      <p class="callout-equation"><code>s = k⁻¹(h + r·d) mod n</code></p>
      <p class="muted">
        <code>d</code> is the secret key, <code>k</code> is the one-time <em>nonce</em>, <code>h</code>
        is the message hash, and <code>r, s</code> are the public signature. Rearranged, it is a linear
        congruence <code>r·d − s·k + h ≡ 0 (mod n)</code> with two unknowns, <code>d</code> and <code>k</code>.
        The attack's whole job is to remove enough of the unknown <code>k</code> — via leaked bits or
        reuse — that <code>d</code> falls out. Set a scenario above, then walk the steps below.
      </p>
    </section>
  `;
}

/** Guided walkthrough: gate the deep analysis panels behind four step tabs that mirror the
 *  pipeline strip (Sign → Build HNP → Reduce → Extract), so a newcomer follows an order
 *  instead of hitting the lattice matrices first. Purely presentational; JS in rerender()
 *  toggles which panel is visible. Content is the real analysis output, unchanged. */
const GUIDED_STEPS: Array<{ key: string; label: string; blurb: string }> = [
  { key: 'sign', label: '1 · Sign', blurb: 'The captured signatures and their leaked nonce bits — the raw evidence.' },
  { key: 'build', label: '2 · Build HNP', blurb: 'How each signature becomes one lattice row, and the full starting basis.' },
  { key: 'reduce', label: '3 · Reduce', blurb: 'LLL shortens the basis; watch the vectors collapse and see the key row surface.' },
  { key: 'extract', label: '4 · Extract', blurb: 'Read the private key out of the short vector and verify it byte-for-byte.' },
];

function renderStepTabs(activeKey: string): string {
  const tabs = GUIDED_STEPS.map((step, i) => {
    const active = step.key === activeKey;
    return `<button class="step-tab${active ? ' active' : ''}" type="button" role="tab"
      aria-selected="${active ? 'true' : 'false'}" data-step-tab="${step.key}"
      id="step-tab-${step.key}" aria-controls="step-panel-${step.key}">${step.label}</button>${
      i < GUIDED_STEPS.length - 1 ? '<span class="step-tab-arrow" aria-hidden="true">›</span>' : ''
    }`;
  }).join('');
  return `<div class="step-tabs" role="tablist" aria-label="Guided attack walkthrough">${tabs}</div>`;
}

function renderGuidedStep(key: string, activeKey: string, body: string): string {
  const step = GUIDED_STEPS.find((s) => s.key === key)!;
  const hidden = key !== activeKey;
  return `
    <div class="step-panel${hidden ? ' step-hidden' : ''}" id="step-panel-${key}"
         role="tabpanel" aria-labelledby="step-tab-${key}"${hidden ? ' hidden' : ''}>
      <p class="step-blurb">${step.blurb}</p>
      <div class="step-grid">${body}</div>
    </div>
  `;
}

function renderApp(state: AppState): string {
  const { config, analysis, loading, error } = state;
  const activeStep = state.activeStep;
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
        : [
            // STEP 1 — Sign: the raw evidence.
            renderGuidedStep('sign', activeStep, renderSignatureLog(analysis.signatures, analysis.curve)),
            // STEP 2 — Build HNP: signature → row → basis (row construction lives in Lattice View
            // "before" matrix, but the Attack workflow map belongs here as the plan of the build).
            renderGuidedStep('build', activeStep, renderAttackWorkflow(config, analysis)),
            // STEP 3 — Reduce: the lattice geometry + before/after matrices + basis lengths.
            renderGuidedStep(
              'reduce',
              activeStep,
              renderLatticeView(analysis.recovery.trace, analysis.curve, analysis.signatures) +
                renderBasisView(analysis.recovery.trace),
            ),
            // STEP 4 — Extract: read out d, verify it, and (for reuse) the two-line algebra.
            renderGuidedStep(
              'extract',
              activeStep,
              renderRecoveryPanel({
                curve: analysis.curve,
                actualKey: analysis.privateKey,
                recoveredKey: analysis.recovery.recoveredKey,
                publicKey: analysis.publicKey,
                byteMatch: analysis.byteMatch,
                verificationPassed: analysis.verificationPassed,
                trace: analysis.recovery.trace,
              }) + renderNonceReuseDerivation(analysis),
            ),
          ].join('');

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
      <div class="hero">
        <header class="cl-hero">
          <div class="cl-hero-main">
            <h1 class="cl-hero-title">Nonce Lattice</h1>
            <p class="cl-hero-sub">ECDSA · Hidden Number Problem · LLL</p>
            <p class="cl-hero-desc">Signs messages with biased or reused ECDSA nonces, then rebuilds those signatures as a lattice and runs LLL to recover the signer's private key in your browser.</p>
          </div>
          <aside class="cl-hero-why" aria-label="Why it matters">
            <span class="cl-hero-why-label">WHY IT MATTERS</span>
            <p class="cl-hero-why-text">A single leaked bit of nonce randomness can hand an attacker your signing key. This exact flaw drained real Bitcoin wallets and cracked the PlayStation 3, so every ECDSA implementation must nail its nonces.</p>
          </aside>
        </header>
        <div class="hero-copy">
          <p class="eyebrow">Attacks · ECDSA · Lattice Crypto</p>
          <p class="lead">${landingCard}</p>
          <div class="chip-row">
            <span>ECDSA</span>
            <span>Hidden Number Problem</span>
            <span>LLL Reduction</span>
            <span>Nonce Bias</span>
            <span>secp256k1 / P-256</span>
          </div>
          ${renderPipeline(pipelineStatus, state.pipelineStage)}
          <p class="scenario-line">${scenarioDescription(config)}</p>
          <p class="summary-line">${summary}</p>
        </div>

      </div>
      <main class="dashboard-grid" id="main-content" tabindex="-1">
        ${renderConfigPanel(config)}
        <div id="feasibility-slot" class="span-two">${renderFeasibility(config, curveMap[config.curve] ?? secp256k1Curve)}</div>
        ${renderEcdsaCallout()}
        ${analysis ? `<div class="span-two guided-walkthrough">
          <div class="panel-heading guided-heading">
            <div>
              <p class="eyebrow">Guided walkthrough</p>
              <h2>Follow the attack step by step</h2>
            </div>
          </div>
          <p class="muted guided-lead">These four tabs mirror the pipeline above. Move left to right —
          each step builds on the last, so the deep lattice panels come only after the intuition.</p>
          ${renderStepTabs(activeStep)}
        </div>` : ''}
        ${analysisBody}
        ${renderHowItWorks(config, analysis)}
        <details class="history-section span-two">
          <summary><span class="history-eyebrow">History &amp; context</span> Real-world case studies, timeline, and related labs</summary>
          <div class="history-body">
            ${renderCaseStudies()}
            ${renderTimeline()}
            ${renderCrossReferences()}
          </div>
        </details>
        ${metaPanel}
      </main>
    </div>
  `;
}

export function mountApp(rootOrNull: HTMLDivElement | null, onRender?: () => void): void {
  if (!rootOrNull) {
    throw new Error('App root not found');
  }
  const root: HTMLDivElement = rootOrNull;

  const state: AppState = {
    config: loadSavedConfig(),
    analysis: null,
    loading: false,
    error: null,
    elapsedMs: 0,
    pipelineStage: 0,
    activeStep: 'sign',
  };
  let activeRequestId = 0;
  let analysisWorker = createAnalysisWorker();
  let elapsedInterval: ReturnType<typeof setInterval> | null = null;
  let elapsedStart = 0;
  let pipelineInterval: ReturnType<typeof setInterval> | null = null;

  function createAnalysisWorker(): Worker {
    const worker = new Worker(new URL('./analysis-worker.ts', import.meta.url), { type: 'module' });
    worker.addEventListener('message', (event: MessageEvent<AnalysisResponse>) => {
      if (event.data.requestId !== activeRequestId) {
        return;
      }

      stopElapsedTimer();
      stopPipelineTimer();
      state.loading = false;
      if (event.data.error) {
        if (isCloneSerializationError(event.data.error)) {
          // Fallback for stale worker bundles that still post non-cloneable data.
          try {
            state.analysis = runAnalysis(state.config);
            state.error = null;
          } catch (fallbackError) {
            state.analysis = null;
            state.error = fallbackError instanceof Error ? fallbackError.message : event.data.error;
          }
        } else {
          state.analysis = null;
          state.error = event.data.error;
        }
      } else if (event.data.analysis) {
        const wire = event.data.analysis;
        const curve = curveMap[wire.curveId] ?? secp256k1Curve;
        state.analysis = { ...wire, curve } satisfies AnalysisBundle;
        state.error = null;
      } else {
        state.analysis = null;
        state.error = null;
      }
      rerender();
    });
    worker.addEventListener('error', () => {
      if (!state.loading) {
        return;
      }

      stopElapsedTimer();
      stopPipelineTimer();
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

  function stopPipelineTimer(): void {
    if (pipelineInterval !== null) {
      clearInterval(pipelineInterval);
      pipelineInterval = null;
    }
  }

  // Walk Key Gen › Sign › Build HNP › LLL, one rung every ~300ms, so the sequence is
  // shown as a process. The last step (Extract Key) stays active until the worker
  // returns the real result, so we never fake the outcome — only the ordering reveal.
  function startPipelineTimer(): void {
    stopPipelineTimer();
    state.pipelineStage = 0;
    const lastAdvanceable = PIPELINE_STEPS.length - 1; // stop before the final step
    pipelineInterval = setInterval(() => {
      if (state.pipelineStage < lastAdvanceable) {
        state.pipelineStage += 1;
        const pipelineEl = root.querySelector('.attack-pipeline');
        if (pipelineEl && state.loading) {
          pipelineEl.outerHTML = renderPipeline('running', state.pipelineStage);
        }
      } else {
        stopPipelineTimer();
      }
    }, 300);
  }

  const queueAnalysis = (config: AppConfigView) => {
    state.config = normalizeConfig(config);
    saveConfig(state.config);
    state.loading = true;
    state.error = null;
    state.elapsedMs = 0;
    state.activeStep = 'sign';
    activeRequestId += 1;
    analysisWorker.terminate();
    analysisWorker = createAnalysisWorker();
    rerender();
    startElapsedTimer();
    startPipelineTimer();
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

    // Live feasibility: re-render just the gauge as the learner drags bits/signatures
    // or changes leak mode/curve, without re-running the (expensive) lattice attack.
    if (form) {
      const updateFeasibility = () => {
        const liveConfig = readConfig(form);
        const slot = root.querySelector<HTMLDivElement>('#feasibility-slot');
        if (slot) {
          slot.innerHTML = renderFeasibility(liveConfig, curveMap[liveConfig.curve] ?? secp256k1Curve);
        }
      };
      form.addEventListener('input', updateFeasibility);
      form.addEventListener('change', updateFeasibility);
    }

    // Guided walkthrough step tabs: switch which step panel is visible without a full
    // re-render (so we don't re-run the attack or restart the LLL animation unnecessarily).
    const stepTabs = root.querySelectorAll<HTMLButtonElement>('[data-step-tab]');
    stepTabs.forEach((tab) => {
      tab.addEventListener('click', () => {
        const key = tab.dataset.stepTab;
        if (!key) return;
        state.activeStep = key;
        stepTabs.forEach((t) => {
          const selected = t.dataset.stepTab === key;
          t.classList.toggle('active', selected);
          t.setAttribute('aria-selected', selected ? 'true' : 'false');
        });
        root.querySelectorAll<HTMLElement>('.step-panel').forEach((panel) => {
          const show = panel.id === `step-panel-${key}`;
          panel.classList.toggle('step-hidden', !show);
          panel.hidden = !show;
        });
      });
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
