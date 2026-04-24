/// <reference lib="webworker" />

import { runAnalysis, type AnalysisRequest, type AnalysisResponse } from './analysis';

const workerScope = self as DedicatedWorkerGlobalScope;

workerScope.addEventListener('message', (event: MessageEvent<AnalysisRequest>) => {
  const { requestId, config } = event.data;

  try {
    const analysis = runAnalysis(config);
    const response: AnalysisResponse = { requestId, analysis };
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