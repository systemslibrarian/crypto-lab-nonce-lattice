/// <reference lib="webworker" />

import { runAnalysis, type AnalysisRequest, type AnalysisResponse, type WireAnalysisBundle } from './analysis';

const workerScope = self as DedicatedWorkerGlobalScope;

workerScope.addEventListener('message', (event: MessageEvent<AnalysisRequest>) => {
  const { requestId, config } = event.data;

  try {
    const bundle = runAnalysis(config);
    // Strip the non-serializable CurveContext (class instances / functions)
    // before crossing the structured-clone boundary.
    const { curve, ...rest } = bundle;
    const wire: WireAnalysisBundle = { ...rest, curveId: curve.id };
    const response: AnalysisResponse = { requestId, analysis: wire };
    workerScope.postMessage(response);
  } catch (error) {
    const response: AnalysisResponse = {
      requestId,
      error: error instanceof Error ? error.message : 'Unknown analysis error.',
    };
    workerScope.postMessage(response);
  }
});

export {};