import { parseIntentDecision, type IntentDecision } from '@rei/contracts';
import type { askIntentEvaluationV1 } from './fixtures/ask-intents-v1';
import type { IntentDecider } from './intent-decider';
import { ModelExplanationFailure } from './language-model.port';

export type IntentEvaluationCase = (typeof askIntentEvaluationV1)[number];
/** One physical provider request. The Messages API reports token usage, not a price. */
export interface PhysicalMeasurement {
  latencyMs: number;
  inputTokens: number | null;
  outputTokens: number | null;
}
export type EvaluationDecision = IntentDecider['decide'];
export type EvaluationFailure = ModelExplanationFailure['kind'] | 'unknown';
export interface EvaluationRow {
  caseId: string;
  locale: 'en' | 'pt-BR';
  correct: boolean;
  confidenceCorrect: boolean;
  probability: number | null;
  confident: boolean;
  failure: EvaluationFailure | null;
  latencyMs: number;
  calls: readonly PhysicalMeasurement[];
}
function usageCoverage(calls: readonly PhysicalMeasurement[]) {
  const observed = calls.filter((call) => call.inputTokens !== null && call.outputTokens !== null);
  const total = (field: 'inputTokens' | 'outputTokens') => {
    const sum = observed.reduce((tokens, call) => tokens + call[field]!, 0);
    // A partial or overflowing total cannot become a misleading complete figure.
    return observed.length === calls.length && Number.isSafeInteger(sum) ? sum : null;
  };
  return {
    calls: calls.length,
    observed: observed.length,
    unavailable: calls.length - observed.length,
    inputTokens: total('inputTokens'),
    outputTokens: total('outputTokens'),
  };
}
export function summarizeIntentEvaluation(rows: readonly EvaluationRow[]) {
  const decisions = rows.filter((row) => row.failure === null);
  const confident = rows.filter((row) => row.confident);
  const latencies = rows.map((row) => row.latencyMs).sort((a, b) => a - b);
  const calls = rows.flatMap((row) => row.calls);
  const correct = rows.filter((row) => row.correct).length;
  const ratio = (count: number, total: number) => (total ? count / total : null);
  return {
    cases: rows.length,
    succeeded: decisions.length,
    failed: rows.length - decisions.length,
    correct,
    accuracy: ratio(correct, rows.length),
    confidence: {
      meanProbability: decisions.length
        ? decisions.reduce((sum, row) => sum + row.probability!, 0) / decisions.length
        : null,
      confident: confident.length,
      confidentAccuracy: ratio(confident.filter((row) => row.correct).length, confident.length),
      expectationAccuracy: ratio(rows.filter((row) => row.confidenceCorrect).length, rows.length),
    },
    latencyMs: {
      total: latencies.reduce((sum, value) => sum + value, 0),
      mean: rows.length ? latencies.reduce((sum, value) => sum + value, 0) / rows.length : null,
      p95: latencies[Math.ceil(latencies.length * 0.95) - 1] ?? null,
    },
    usage: usageCoverage(calls),
  };
}
/** Sequential by construction. Failed and incorrect cases remain in every case denominator. */
export async function evaluateIntents(
  cases: readonly IntentEvaluationCase[],
  decide: EvaluationDecision,
  calls: () => readonly PhysicalMeasurement[] = () => [],
  now: () => number = performance.now.bind(performance),
) {
  const rows: EvaluationRow[] = [];
  for (const fixture of cases) {
    const started = now();
    let decision: IntentDecision | undefined;
    let failure: EvaluationFailure | null = null;
    try {
      decision = parseIntentDecision(
        await decide(
          fixture.query,
          fixture.locale,
          new AbortController().signal,
          Date.now() + 10000,
        ),
      );
    } catch (error) {
      failure = error instanceof ModelExplanationFailure ? error.kind : 'unknown';
    }
    rows.push({
      caseId: fixture.id,
      locale: fixture.locale,
      correct: decision?.intent === fixture.intent,
      confidenceCorrect:
        decision !== undefined && decision.probability >= 0.85 === fixture.confident,
      probability: decision?.probability ?? null,
      confident: decision !== undefined && decision.probability >= 0.85,
      failure,
      latencyMs: now() - started,
      calls: calls().map((call) => ({ ...call })),
    });
  }
  return { rows, summary: summarizeIntentEvaluation(rows) };
}
