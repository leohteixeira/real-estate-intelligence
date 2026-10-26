import { describe, expect, it } from 'vitest';
import { askIntents, parseIntentDecision } from '@rei/contracts';
import { askIntentEvaluationV1 } from './fixtures/ask-intents-v1';
import { evaluateIntents, gatewayCostUsd, type PhysicalMeasurement } from './intent-evaluation';
import { heuristicDecision } from './intent-decider';
import { ModelExplanationFailure } from './language-model.port';

describe('ask-intents-v1 offline measured comparison', () => {
  it('compares fake Jev and the existing heuristic on every public PT/EN case', async () => {
    let index = 0;
    let clock = 0;
    const fakeJev = await evaluateIntents(
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
          source: 'gateway-jev-v1',
          degraded: false,
          privacyEvidenceId: 'public-evaluation-evidence',
        });
      },
      () => [
        { phase: 'privacy', latencyMs: 2, costUsd: 0.001 },
        { phase: 'classification', latencyMs: 10, costUsd: 0.003 },
      ],
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
    expect(fakeJev.summary).toMatchObject({
      cases: 14,
      succeeded: 14,
      failed: 0,
      accuracy: 1,
      confidence: { confident: 10, expectationAccuracy: 1, confidentAccuracy: 1 },
      latencyMs: { total: 168, mean: 12, p95: 12 },
    });
    expect(fakeJev.summary.costUsd.totalUsd).toBeCloseTo(0.056);
    expect(fakeJev.summary.costUsd.privacy).toMatchObject({
      calls: 14,
      observed: 14,
      unavailable: 0,
    });
    expect(fakeJev.summary.costUsd.privacy.totalUsd).toBeCloseTo(0.014);
    expect(heuristic.summary).toMatchObject({
      accuracy: 1,
      confidence: { expectationAccuracy: 1 },
      latencyMs: { total: 14, mean: 1, p95: 1 },
      costUsd: { calls: 0, totalUsd: 0 },
    });
    expect(fakeJev.summary.confidence.meanProbability).toBeCloseTo((10 * 0.95 + 4 * 0.7) / 14);
    expect(new Set(fakeJev.rows.map((row) => row.caseId)).size).toBe(14);
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
  it.each([
    undefined,
    null,
    {},
    { gateway: null },
    { gateway: { cost: '0.1' } },
    { gateway: { cost: -1 } },
    { gateway: { cost: NaN } },
    { gateway: { cost: Infinity } },
  ])('rejects absent or malformed cost evidence', (value) => {
    expect(gatewayCostUsd(value)).toBeNull();
  });
  it.each([0, 0.0123])('accepts numeric finite nonnegative cost %s only', (cost) => {
    expect(gatewayCostUsd({ gateway: { cost, arbitrary: 'private' } })).toBe(cost);
  });
  it('reports partial cost coverage and empty datasets without inventing spend', async () => {
    const calls: PhysicalMeasurement[] = [
      { phase: 'privacy', latencyMs: 1, costUsd: null },
      { phase: 'classification', latencyMs: 2, costUsd: 0.01 },
    ];
    const result = await evaluateIntents(
      askIntentEvaluationV1.slice(0, 1),
      async (query) => heuristicDecision(query),
      () => calls,
    );
    expect(result.summary.costUsd).toMatchObject({
      calls: 2,
      observed: 1,
      unavailable: 1,
      observedUsd: 0.01,
      totalUsd: null,
      privacy: { observedUsd: null, totalUsd: null },
      classification: { totalUsd: 0.01 },
    });
    const empty = await evaluateIntents([], async () => heuristicDecision('hello'));
    expect(empty.summary).toMatchObject({
      cases: 0,
      accuracy: null,
      confidence: { confidentAccuracy: null, meanProbability: null, expectationAccuracy: null },
      latencyMs: { mean: null, p95: null },
    });
  });
});
