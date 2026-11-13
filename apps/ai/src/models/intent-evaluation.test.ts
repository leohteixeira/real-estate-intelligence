import { describe, expect, it } from 'vitest';
import { askIntents, parseIntentDecision } from '@rei/contracts';
import { askIntentEvaluationV1 } from './fixtures/ask-intents-v1';
import { evaluateIntents, type PhysicalMeasurement } from './intent-evaluation';
import { heuristicDecision } from './intent-decider';
import { ModelExplanationFailure } from './language-model.port';

describe('ask-intents-v1 offline measured comparison', () => {
  it('compares a fake classifier and the existing heuristic on every public PT/EN case', async () => {
    let index = 0;
    let clock = 0;
    const fakeClassifier = await evaluateIntents(
      askIntentEvaluationV1,
      async () => {
        const row = askIntentEvaluationV1[index++]!;
        clock += 12;
        const probability = row.confident ? 0.95 : 0.7;
        return parseIntentDecision({
          ...heuristicDecision(row.query),
          intent: row.intent,
          probability,
          probabilities: Object.fromEntries(
            askIntents.map((label) => [
              label,
              label === row.intent ? probability : (1 - probability) / 5,
            ]),
          ),
          source: 'claude-haiku-v1',
          degraded: false,
          privacyEvidenceId: null,
        });
      },
      () => [{ latencyMs: 10, inputTokens: 400, outputTokens: 20 }],
      () => clock,
    );
    const heuristic = await evaluateIntents(
      askIntentEvaluationV1,
      async (query) => {
        clock += 1;
        return heuristicDecision(query);
      },
      undefined,
      () => clock,
    );
    expect(fakeClassifier.summary).toMatchObject({
      cases: 14,
      succeeded: 14,
      failed: 0,
      accuracy: 1,
      confidence: { confident: 10, expectationAccuracy: 1, confidentAccuracy: 1 },
      latencyMs: { total: 168, mean: 12, p95: 12 },
    });
    expect(fakeClassifier.summary.usage).toEqual({
      calls: 14,
      observed: 14,
      unavailable: 0,
      inputTokens: 5600,
      outputTokens: 280,
    });
    expect(heuristic.summary).toMatchObject({
      accuracy: 1,
      confidence: { expectationAccuracy: 1 },
      latencyMs: { total: 14, mean: 1, p95: 1 },
      usage: { calls: 0, observed: 0, unavailable: 0, inputTokens: 0, outputTokens: 0 },
    });
    expect(fakeClassifier.summary.confidence.meanProbability).toBeCloseTo(
      (10 * 0.95 + 4 * 0.7) / 14,
    );
    expect(new Set(fakeClassifier.rows.map((row) => row.caseId)).size).toBe(14);
  });
  it('retains wrong, typed failed and invalid decisions in accuracy and confidence denominators', async () => {
    let index = 0;
    let clock = 0;
    const result = await evaluateIntents(
      askIntentEvaluationV1.slice(0, 4),
      async () => {
        clock += ++index;
        if (index === 2) return heuristicDecision('Tell me a joke.');
        if (index === 3) throw new ModelExplanationFailure('policy');
        if (index === 4) throw new Error('private key and query must never escape');
        return heuristicDecision(askIntentEvaluationV1[0]!.query);
      },
      undefined,
      () => clock,
    );
    expect(result.summary).toMatchObject({
      cases: 4,
      succeeded: 2,
      failed: 2,
      correct: 1,
      accuracy: 0.25,
      confidence: { expectationAccuracy: 0.25, meanProbability: 0.75 },
      latencyMs: { total: 10, mean: 2.5, p95: 4 },
    });
    expect(result.rows.map((row) => row.failure)).toEqual([null, null, 'policy', 'unknown']);
    expect(JSON.stringify(result)).not.toContain('private key');
    expect(JSON.stringify(result)).not.toContain(askIntentEvaluationV1[0]!.query);
    const invalid = await evaluateIntents(askIntentEvaluationV1.slice(0, 1), async () => ({
      ...heuristicDecision('hello'),
      probability: NaN,
    }));
    expect(invalid.summary).toMatchObject({
      failed: 1,
      accuracy: 0,
      confidence: { meanProbability: null },
    });
  });
  it('reports partial usage coverage and empty datasets without inventing totals', async () => {
    const calls: PhysicalMeasurement[] = [
      { latencyMs: 1, inputTokens: null, outputTokens: null },
      { latencyMs: 2, inputTokens: 400, outputTokens: 20 },
      { latencyMs: 3, inputTokens: 400, outputTokens: null },
    ];
    const result = await evaluateIntents(
      askIntentEvaluationV1.slice(0, 1),
      async (query) => heuristicDecision(query),
      () => calls,
    );
    expect(result.summary.usage).toEqual({
      calls: 3,
      observed: 1,
      unavailable: 2,
      inputTokens: null,
      outputTokens: null,
    });
    const overflowing = await evaluateIntents(
      askIntentEvaluationV1.slice(0, 1),
      async (query) => heuristicDecision(query),
      () => [
        { latencyMs: 1, inputTokens: Number.MAX_SAFE_INTEGER, outputTokens: 1 },
        { latencyMs: 1, inputTokens: 1, outputTokens: 1 },
      ],
    );
    expect(overflowing.summary.usage).toMatchObject({ inputTokens: null, outputTokens: 2 });
    const empty = await evaluateIntents([], async () => heuristicDecision('hello'));
    expect(empty.summary).toMatchObject({
      cases: 0,
      accuracy: null,
      confidence: { confidentAccuracy: null, meanProbability: null, expectationAccuracy: null },
      latencyMs: { mean: null, p95: null },
    });
  });
});
