/// <reference lib="webworker" />

import { runAnalysis } from './analysis';
import type { SweepProgress, SweepRequest } from './boundary';

const workerScope = self as DedicatedWorkerGlobalScope;

/**
 * Runs the measured-boundary ladder. Every probe is a complete attack — fresh
 * private key, freshly signed messages, the same HNP construction and float LLL
 * the main panel uses, and the same byte-for-byte validation against the signing
 * key. Nothing here is modelled; the only thing this worker reports is how many
 * of those real runs recovered the key.
 *
 * Results are posted rung by rung so the table fills in as the sweep proceeds
 * rather than appearing all at once at the end.
 */
workerScope.addEventListener('message', (event: MessageEvent<SweepRequest>) => {
  const { sweepId, config, levels, trials } = event.data;

  try {
    for (const bits of levels) {
      const started = Date.now();
      let recovered = 0;
      for (let trial = 0; trial < trials; trial += 1) {
        const bundle = runAnalysis({ ...config, leakedBits: bits });
        if (bundle.byteMatch && bundle.verificationPassed) recovered += 1;
      }
      const progress: SweepProgress = {
        sweepId,
        probe: { bits, trials, recovered, elapsedMs: Date.now() - started },
      };
      workerScope.postMessage(progress);
    }
    workerScope.postMessage({ sweepId, done: true } satisfies SweepProgress);
  } catch (error) {
    workerScope.postMessage({
      sweepId,
      error: error instanceof Error ? error.message : 'Boundary sweep failed.',
      done: true,
    } satisfies SweepProgress);
  }
});

export {};
