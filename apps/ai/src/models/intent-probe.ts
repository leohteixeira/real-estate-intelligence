import type { AnthropicFetch } from './anthropic-client';
import { askIntentEvaluationV1 } from './fixtures/ask-intents-v1';
import {
  INTENT_CLASSIFIER_MODEL,
  INTENT_CLASSIFIER_PROMPT_VERSION,
} from './intent-classifier.prompt';
import { AnthropicIntentDecider, heuristicDecision } from './intent-decider';
import { evaluateIntents, type PhysicalMeasurement } from './intent-evaluation';

/** Only these two public, fixed PT/EN cases can reach the live adapter. */
export const liveIntentCases = askIntentEvaluationV1.slice(0, 2);
export async function runIntentProbe(
  apiKey: string,
  fetch?: AnthropicFetch,
  now: () => number = performance.now.bind(performance),
) {
  let calls: PhysicalMeasurement[] = [];
  const adapter = new AnthropicIntentDecider(apiKey, fetch, (attempt) => calls.push(attempt));
  const classifier = await evaluateIntents(
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
    model: INTENT_CLASSIFIER_MODEL,
    promptVersion: INTENT_CLASSIFIER_PROMPT_VERSION,
    passed: classifier.rows.every((row) => row.correct && row.failure === null),
    classifier,
    heuristic,
  };
}
