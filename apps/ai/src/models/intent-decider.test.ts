import { createGateway, type GatewayProviderSettings } from '@ai-sdk/gateway';
import { experimental_decide as decide } from 'ai';
import { askIntents, parseIntentDecision } from '@rei/contracts';
import { describe, expect, it, vi } from 'vitest';
import {
  DegradedIntentDecider,
  GatewayIntentDecider,
  heuristicDecision,
  intentCriteria,
} from './intent-decider';
import { askIntentEvaluationV1 } from './fixtures/ask-intents-v1';
import { acknowledged } from './model-test.fixture';
import { ModelExplanationFailure } from './language-model.port';
const query = 'Private visitor price per square meter: BRL 785000 / 68 m².';
const signal = () => new AbortController().signal;
const probabilities = (probability: number) =>
  Object.fromEntries(
    askIntents.map((label) => [
      label,
      label === 'price_per_square_meter' ? probability : (1 - probability) / 5,
    ]),
  );
function response(probability = 0.85): Record<string, unknown> {
  return {
    answers: {
      intent: {
        type: 'choice',
        choice: 'price_per_square_meter',
        probabilities: probabilities(probability),
      },
    },
    providerMetadata: acknowledged('typesafe-ai/jev').metadata,
    warnings: [],
  };
}
function adapter(fetch: NonNullable<GatewayProviderSettings['fetch']>) {
  return new GatewayIntentDecider('offline-not-a-real-key', decide, (options) =>
    createGateway({ ...options, fetch }),
  );
}

describe('versioned intent taxonomy and gate', () => {
  it.each(askIntentEvaluationV1)('classifies $locale: $query', (fixture) => {
    const result = heuristicDecision(fixture.query);
    expect(result.intent).toBe(fixture.intent);
    expect(result.probability >= 0.85).toBe(fixture.confident);
    expect(result).toMatchObject({
      source: 'heuristic-v1',
      degraded: true,
      taxonomyVersion: 'ask-intents-v1',
      privacyEvidenceId: null,
    });
  });
  it.each([NaN, -0.1, 1.1])('rejects invalid chosen probability %s', (probability) =>
    expect(() => parseIntentDecision({ ...heuristicDecision(query), probability })).toThrow(),
  );
  it('rejects partial, extra, mismatched and non-normalized distributions', () => {
    const valid = heuristicDecision(query);
    for (const value of [
      { ...valid, probabilities: {} },
      { ...valid, probabilities: { ...valid.probabilities, secret: 0 } },
      { ...valid, probability: 0.85 },
      { ...valid, probabilities: { ...valid.probabilities, unsupported: 0.2 } },
    ])
      expect(() => parseIntentDecision(value)).toThrow();
  });
  it('degrades availability but retains rejected output and cancellation', async () => {
    for (const kind of ['policy', 'transient', 'authentication'] as const) {
      const result = await new DegradedIntentDecider({
        decide: () => Promise.reject(new ModelExplanationFailure(kind)),
      }).decide(query, 'en', signal(), Date.now() + 1000);
      expect(result.degraded).toBe(true);
    }
    for (const kind of ['rejected', 'cancelled'] as const)
      await expect(
        new DegradedIntentDecider({
          decide: () => Promise.reject(new ModelExplanationFailure(kind)),
        }).decide(query, 'en', signal(), Date.now() + 1000),
      ).rejects.toMatchObject({ kind });
    const controller = new AbortController();
    controller.abort();
    await expect(
      new DegradedIntentDecider({ decide: vi.fn() }).decide(
        query,
        'en',
        controller.signal,
        Date.now() + 1000,
      ),
    ).rejects.toThrow();
  });
});
describe('real pinned decision SDK with intercepted HTTP', () => {
  it.each([0.85, 0.849999])(
    'uses selected-label probability %s and text-only Gateway bridge after a public privacy probe',
    async (probability) => {
      const bodies: Record<string, unknown>[] = [];
      const fetch = vi.fn<NonNullable<GatewayProviderSettings['fetch']>>(async (url, init) => {
        expect(String(url)).toContain('/evaluation-model');
        const body: Record<string, unknown> = JSON.parse(String(init?.body));
        bodies.push(body);
        expect(body.questions).toEqual({
          intent: {
            type: 'choice',
            instructions: 'Choose exactly one real estate intent; do not infer operands.',
            criteria: intentCriteria,
          },
        });
        expect(body.providerOptions).toEqual({ gateway: { zeroDataRetention: true } });
        return Response.json(response(probability));
      });
      const result = await adapter(fetch).decide(query, 'en', signal(), Date.now() + 10000);
      expect(bodies).toHaveLength(2);
      expect(typeof bodies[0]!.state).toBe('string');
      expect(bodies[0]!.state).not.toContain(query);
      expect(bodies[1]!.state).toBe(query);
      expect(result.probability).toBe(probability);
      expect(result.source).toBe('gateway-jev-v1');
      expect(result.privacyEvidenceId).toMatch(/^[A-Za-z0-9_-]{16,128}$/);
    },
  );
  it.each(['absent', 'false', 'warning'] as const)(
    'blocks user content when privacy acknowledgement is %s',
    async (fault) => {
      const fetch = vi.fn<NonNullable<GatewayProviderSettings['fetch']>>(async (_url, init) => {
        expect(String(init?.body)).not.toContain(query);
        const body = response();
        if (fault === 'absent') delete body.providerMetadata;
        else if (fault === 'false')
          body.providerMetadata = { gateway: { zeroDataRetention: true } };
        else body.warnings = [{ type: 'other', message: 'unverified' }];
        return Response.json(body);
      });
      const result = await new DegradedIntentDecider(adapter(fetch)).decide(
        query,
        'en',
        signal(),
        Date.now() + 10000,
      );
      expect(result.degraded).toBe(true);
      expect(fetch).toHaveBeenCalledOnce();
    },
  );
  it.each(['empty', 'missing probabilities', 'invalid distribution', 'unknown label'] as const)(
    'rejects %s without silent heuristic authorization',
    async (fault) => {
      let calls = 0;
      const fetch = vi.fn<NonNullable<GatewayProviderSettings['fetch']>>(async () => {
        calls++;
        if (calls === 1) return Response.json(response());
        if (fault === 'empty') return Response.json({});
        const answer = {
          type: 'choice',
          choice: fault === 'unknown label' ? 'other' : 'price_per_square_meter',
          ...(fault === 'missing probabilities'
            ? {}
            : {
                probabilities:
                  fault === 'invalid distribution'
                    ? { ...probabilities(0.85), unsupported: 0.9 }
                    : probabilities(0.85),
              }),
        };
        return Response.json({ ...response(), answers: { intent: answer } });
      });
      await expect(
        new DegradedIntentDecider(adapter(fetch)).decide(query, 'en', signal(), Date.now() + 10000),
      ).rejects.toMatchObject({ kind: 'rejected' });
      expect(fetch).toHaveBeenCalledTimes(2);
    },
  );
  it.each([408, 429, 503])('makes one attempt for HTTP %s', async (status) => {
    const fetch = vi.fn<NonNullable<GatewayProviderSettings['fetch']>>(async () =>
      Response.json({ error: { message: 'offline unavailable' } }, { status }),
    );
    await expect(
      adapter(fetch).decide(query, 'en', signal(), Date.now() + 10000),
    ).rejects.toMatchObject({ kind: 'transient' });
    expect(fetch).toHaveBeenCalledOnce();
  });
  it('stops after caller cancellation without a user-bearing request', async () => {
    const controller = new AbortController();
    const fetch = vi.fn<NonNullable<GatewayProviderSettings['fetch']>>(async () => {
      controller.abort();
      return Response.json(response());
    });
    await expect(
      adapter(fetch).decide(query, 'en', controller.signal, Date.now() + 10000),
    ).rejects.toMatchObject({ kind: 'cancelled' });
    expect(fetch).toHaveBeenCalledOnce();
  });
  it('bounds a pending Gateway request and degrades while the caller deadline remains valid', async () => {
    const fetch = vi.fn<NonNullable<GatewayProviderSettings['fetch']>>(
      async (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener(
            'abort',
            () => reject(new DOMException('Aborted', 'AbortError')),
            { once: true },
          );
        }),
    );
    const result = await new DegradedIntentDecider(adapter(fetch)).decide(
      query,
      'en',
      signal(),
      Date.now() + 10000,
    );
    expect(result.degraded).toBe(true);
    expect(fetch).toHaveBeenCalledOnce();
  }, 6000);
});
