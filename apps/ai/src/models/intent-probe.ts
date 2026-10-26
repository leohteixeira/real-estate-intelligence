import { experimental_decide as sdkDecide } from 'ai';
import { GatewayIntentDecider, heuristicDecision } from './intent-decider';
import { askIntentEvaluationV1 } from './fixtures/ask-intents-v1';
import { evaluateIntents, gatewayCostUsd, type PhysicalMeasurement } from './intent-evaluation';

/** Only these two public, fixed PT/EN cases can reach the live adapter. */
export const liveIntentCases = askIntentEvaluationV1.slice(0, 2);
export async function runIntentProbe(
  apiKey: string,
  sdk: typeof sdkDecide = sdkDecide,
  now: () => number = performance.now.bind(performance),
) {
  let calls: PhysicalMeasurement[] = [];
  const measuredSdk: typeof sdkDecide = async (options) => {
    const phase = calls.length === 0 ? 'privacy' : 'classification';
    const started = now();
    let costUsd: number | null = null;
    try {
      const result = await sdk(options);
      costUsd = gatewayCostUsd(result.providerMetadata);
      return result;
    } finally {
      calls.push({ phase, latencyMs: now() - started, costUsd });
    }
  };
  const adapter = new GatewayIntentDecider(apiKey, measuredSdk);
  const jev = await evaluateIntents(
    liveIntentCases,
    (...args) => {
      calls = [];
      return adapter.decide(...args);
    },
    () => calls,
    now,
  );
  const heuristic = await evaluateIntents(
    liveIntentCases,
    async (query) => heuristicDecision(query),
    undefined,
    now,
  );
  return {
    datasetVersion: 'ask-intents-v1',
    model: 'typesafe-ai/jev',
    passed: jev.rows.every((row) => row.correct && row.failure === null && row.privacyVerified),
    jev,
    heuristic,
  };
}
