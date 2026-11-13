import { createHash } from 'node:crypto';
import { trace } from '@opentelemetry/api';
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-base';
import { askIntents, parseIntentDecision } from '@rei/contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AnthropicFetch } from './anthropic-client';
import {
  INTENT_CLASSIFIER_PROMPT,
  INTENT_CLASSIFIER_PROMPT_VERSION,
  INTENT_CLASSIFIER_SCHEMA,
} from './intent-classifier.prompt';
import {
  AnthropicIntentDecider,
  DegradedIntentDecider,
  heuristicDecision,
  intentCriteria,
  type IntentAttemptMeasurement,
} from './intent-decider';
import { askIntentEvaluationV1 } from './fixtures/ask-intents-v1';
import { anthropicError, anthropicMessage } from './model-test.fixture';
import { ModelExplanationFailure } from './language-model.port';
type Fetch = NonNullable<AnthropicFetch>;
const query = 'Private visitor price per square meter: BRL 785000 / 68 m².';
const signal = () => new AbortController().signal;
function response(
  probability: unknown = 0.85,
  intent: unknown = 'price_per_square_meter',
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return anthropicMessage(JSON.stringify({ intent, probability }), overrides);
}
function adapter(fetch: Fetch, observe?: (attempt: IntentAttemptMeasurement) => void) {
  return new AnthropicIntentDecider('offline-not-a-real-key', fetch, observe);
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
describe('versioned classifier contract', () => {
  it('names every intent of the taxonomy with its criterion and the fixed confidence gate', () => {
    expect(INTENT_CLASSIFIER_PROMPT_VERSION).toBe('ask-intent-classifier-prompt-v1');
    for (const intent of askIntents)
      expect(INTENT_CLASSIFIER_PROMPT).toContain(`- ${intent}: ${intentCriteria[intent]}`);
    expect(INTENT_CLASSIFIER_PROMPT).toContain('0.85');
    expect(INTENT_CLASSIFIER_SCHEMA).toEqual({
      type: 'object',
      properties: {
        intent: {
          type: 'string',
          enum: [
            'price_per_square_meter',
            'listing_search',
            'property_history',
            'region_statistics',
            'comparables',
            'unsupported',
          ],
        },
        probability: { type: 'number' },
      },
      required: ['intent', 'probability'],
      additionalProperties: false,
    });
  });
  it('pins the v1 instructions and schema: any change needs a new prompt version and decision source', () => {
    expect(
      createHash('sha256')
        .update(INTENT_CLASSIFIER_PROMPT)
        .update(JSON.stringify(INTENT_CLASSIFIER_SCHEMA))
        .digest('hex'),
    ).toBe('ebab877762f77b7fabbf2ee96cfa7ffaae1c17b000b020dc56c109ad919006de');
  });
});
describe('real pinned Anthropic SDK with intercepted HTTP', () => {
  afterEach(() => vi.unstubAllEnvs());
  it.each([0.85, 0.849999])(
    'sends the question once under the closed schema and uses the reported probability %s',
    async (probability) => {
      vi.stubEnv('ANTHROPIC_BASE_URL', 'https://ambient.invalid');
      vi.stubEnv('ANTHROPIC_AUTH_TOKEN', 'ambient-token-not-used');
      const fetch = vi.fn<Fetch>(async () => Response.json(response(probability)));
      const result = await adapter(fetch).decide(query, 'en', signal(), Date.now() + 10000);
      expect(fetch).toHaveBeenCalledOnce();
      const [url, init] = fetch.mock.calls[0]!;
      expect(String(url)).toBe('https://api.anthropic.com/v1/messages');
      const headers = new Headers(init?.headers);
      expect(headers.get('x-api-key')).toBe('offline-not-a-real-key');
      expect(headers.get('authorization')).toBeNull();
      expect(headers.get('x-stainless-retry-count')).toBe('0');
      expect(JSON.parse(String(init?.body))).toEqual({
        model: 'claude-haiku-5-5',
        max_tokens: 256,
        thinking: { type: 'disabled' },
        output_config: {
          effort: 'low',
          format: { type: 'json_schema', schema: INTENT_CLASSIFIER_SCHEMA },
        },
        system: INTENT_CLASSIFIER_PROMPT,
        messages: [{ role: 'user', content: `<question>\n${query}\n</question>` }],
      });
      expect(result).toEqual({
        intent: 'price_per_square_meter',
        probability,
        probabilities: Object.fromEntries(
          askIntents.map((label) => [
            label,
            label === 'price_per_square_meter' ? probability : (1 - probability) / 5,
          ]),
        ),
        source: 'claude-haiku-v1',
        degraded: false,
        taxonomyVersion: 'ask-intents-v1',
        privacyEvidenceId: null,
      });
      expect(result.probability >= 0.85).toBe(probability === 0.85);
    },
  );
  it.each(askIntents.flatMap((intent) => [0, 0.5, 1].map((p) => [intent, p] as const)))(
    'accepts label %s at probability %s as a closed normalized distribution',
    async (intent, probability) => {
      const fetch = vi.fn<Fetch>(async () => Response.json(response(probability, intent)));
      const result = await adapter(fetch).decide(query, 'pt-BR', signal(), Date.now() + 10000);
      expect(result.intent).toBe(intent);
      expect(parseIntentDecision(result)).toEqual(result);
      expect(
        Object.values(result.probabilities).reduce((sum, value) => sum + value, 0),
      ).toBeCloseTo(1, 9);
    },
  );
  it.each([
    ['empty object', {}],
    ['non-JSON text', anthropicMessage('price_per_square_meter')],
    ['JSON array', anthropicMessage('[]')],
    ['missing probability', anthropicMessage('{"intent":"price_per_square_meter"}')],
    ['missing intent', anthropicMessage('{"probability":0.9}')],
    ['textual probability', response('0.9')],
    ['null probability', response(null)],
    ['negative probability', response(-0.1)],
    ['probability above one', response(1.1)],
    ['unknown label', response(0.9, 'other')],
    ['non-text label', response(0.9, 7)],
    [
      'extra field',
      anthropicMessage('{"intent":"price_per_square_meter","probability":0.9,"operands":"785000"}'),
    ],
    ['truncated output', response(0.9, 'price_per_square_meter', { stop_reason: 'max_tokens' })],
    ['another model', response(0.9, 'price_per_square_meter', { model: 'claude-opus-5-5' })],
    ['no content', response(0.9, 'price_per_square_meter', { content: [] })],
  ] as const)('rejects %s without silent heuristic authorization', async (_name, body) => {
    const fetch = vi.fn<Fetch>(async () => Response.json(body));
    await expect(
      new DegradedIntentDecider(adapter(fetch)).decide(query, 'en', signal(), Date.now() + 10000),
    ).rejects.toMatchObject({ kind: 'rejected' });
    expect(fetch).toHaveBeenCalledOnce();
  });
  it('degrades to the heuristic when the provider declines the question', async () => {
    const fetch = vi.fn<Fetch>(async () =>
      Response.json(anthropicMessage('', { stop_reason: 'refusal', content: [] })),
    );
    await expect(
      adapter(fetch).decide(query, 'en', signal(), Date.now() + 10000),
    ).rejects.toMatchObject({ kind: 'policy' });
    const result = await new DegradedIntentDecider(adapter(fetch)).decide(
      query,
      'en',
      signal(),
      Date.now() + 10000,
    );
    expect(result).toMatchObject({ source: 'heuristic-v1', degraded: true });
  });
  it('sends nothing without a credential and degrades to the heuristic', async () => {
    const fetch = vi.fn<Fetch>(async () => Response.json(response()));
    const keyless = new AnthropicIntentDecider(undefined, fetch);
    await expect(keyless.decide(query, 'en', signal(), Date.now() + 10000)).rejects.toMatchObject({
      kind: 'policy',
    });
    const result = await new DegradedIntentDecider(keyless).decide(
      query,
      'en',
      signal(),
      Date.now() + 10000,
    );
    expect(result).toMatchObject({ source: 'heuristic-v1', degraded: true });
    expect(fetch).not.toHaveBeenCalled();
  });
  it.each([
    [401, 'authentication_error', 'authentication'],
    [403, 'permission_error', 'authentication'],
    [402, 'billing_error', 'exhausted'],
    [400, 'invalid_request_error', 'rejected'],
    [404, 'not_found_error', 'rejected'],
    [408, 'timeout_error', 'transient'],
    [429, 'rate_limit_error', 'transient'],
    [503, 'api_error', 'transient'],
    [529, 'overloaded_error', 'transient'],
  ] as const)('makes one attempt for HTTP %s %s and reports %s', async (status, type, kind) => {
    const fetch = vi.fn<Fetch>(async () =>
      Response.json(anthropicError(type), { status, headers: { 'retry-after': '0.2' } }),
    );
    const failure: unknown = await adapter(fetch)
      .decide(query, 'en', signal(), Date.now() + 10000)
      .catch((error: unknown) => error);
    expect(failure).toMatchObject({
      kind,
      message: 'Model explanation unavailable.',
      retryAfterMs: kind === 'transient' ? 200 : undefined,
    });
    expect(failure).not.toHaveProperty('cause');
    expect(JSON.stringify(failure)).not.toContain('private');
    expect(fetch).toHaveBeenCalledOnce();
  });
  it('reports each physical attempt with bounded token usage and never its text', async () => {
    const attempts: IntentAttemptMeasurement[] = [];
    const replies = [
      response(),
      response(0.9, 'price_per_square_meter', { usage: { input_tokens: '12' } }),
    ];
    const fetch = vi.fn<Fetch>(async () => Response.json(replies.shift()));
    const decider = adapter(fetch, (attempt) => attempts.push(attempt));
    await decider.decide(query, 'en', signal(), Date.now() + 10000);
    await decider.decide(query, 'en', signal(), Date.now() + 10000);
    expect(attempts).toEqual([
      { latencyMs: expect.any(Number), inputTokens: 12, outputTokens: 7 },
      { latencyMs: expect.any(Number), inputTokens: null, outputTokens: null },
    ]);
    expect(attempts.every((attempt) => attempt.latencyMs >= 0)).toBe(true);
  });
  it('records a payload-free attempt span with model, provider, route, purpose and usage', async () => {
    const exporter = new InMemorySpanExporter();
    const provider = new BasicTracerProvider({
      spanProcessors: [new SimpleSpanProcessor(exporter)],
    });
    trace.setGlobalTracerProvider(provider);
    try {
      const replies: Array<() => Response> = [
        () => Response.json(response()),
        () => Response.json(anthropicError('overloaded_error'), { status: 529 }),
      ];
      const fetch = vi.fn<Fetch>(async () => replies.shift()!());
      await adapter(fetch).decide(query, 'en', signal(), Date.now() + 10000);
      await expect(
        adapter(fetch).decide(query, 'en', signal(), Date.now() + 10000),
      ).rejects.toMatchObject({ kind: 'transient' });
      const spans = exporter.getFinishedSpans();
      expect(spans.map((span) => span.name)).toEqual([
        'ask.decision.attempt',
        'ask.decision.attempt',
      ]);
      const { 'rei.ai.duration_ms': duration, ...succeeded } = spans[0]!.attributes;
      expect(duration).toEqual(expect.any(Number));
      expect(succeeded).toEqual({
        'rei.ai.model': 'claude-haiku-5-5',
        'rei.ai.provider': 'anthropic',
        'rei.ai.route': 'anthropic-direct',
        'rei.ai.attempt.purpose': 'decision',
        'rei.ai.usage': 'available',
        'rei.ai.input_tokens': 12,
        'rei.ai.output_tokens': 7,
        'rei.ai.cost': 'unavailable',
      });
      expect(spans[1]!.attributes).toMatchObject({
        'rei.ai.usage': 'unavailable',
        'rei.ai.cost': 'unavailable',
      });
      expect(spans[1]!.attributes).not.toHaveProperty('rei.ai.output_tokens');
      const recorded = JSON.stringify(
        spans.map((span) => [span.attributes, span.events, span.status]),
      );
      for (const secret of ['Private visitor', '785000', 'offline-not-a-real-key', 'private'])
        expect(recorded).not.toContain(secret);
    } finally {
      await provider.shutdown();
      trace.disable();
    }
  });
  it('stops after caller cancellation and refuses an expired deadline before any request', async () => {
    const controller = new AbortController();
    const fetch = vi.fn<Fetch>(async () => {
      controller.abort();
      return Response.json(response());
    });
    await expect(
      adapter(fetch).decide(query, 'en', controller.signal, Date.now() + 10000),
    ).rejects.toMatchObject({ kind: 'cancelled' });
    expect(fetch).toHaveBeenCalledOnce();
    for (const deadline of [Date.now() - 1, Number.NaN, Infinity])
      await expect(adapter(fetch).decide(query, 'en', signal(), deadline)).rejects.toMatchObject({
        kind: 'cancelled',
      });
    expect(fetch).toHaveBeenCalledOnce();
  });
  it('bounds a pending provider request and degrades while the caller deadline remains valid', async () => {
    const fetch = vi.fn<Fetch>(
      async (_url, init) =>
        new Promise<Response>((_resolve, reject) => {
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
