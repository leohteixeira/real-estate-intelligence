import { channel } from 'node:diagnostics_channel';
import { createGateway, type GatewayProviderSettings } from '@ai-sdk/gateway';
import { generateText } from 'ai';
import { explanationFacts } from '@rei/domain';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GatewayLanguageModelAdapter } from './gateway-language-model.adapter';
import { ReceiptModelExplainer } from './receipt-model-explainer';
import type { ModelExplanationTransport } from './model-explanation.port';
import { modelExplanationSettings as settings } from './model-explanation.settings';
import { acknowledged, modelReceipt, modelTransportFixture } from './model-test.fixture';

// Real pinned SDKs, with every HTTP request intercepted locally; no SDK/module mocks.
function response(text: string): Record<string, unknown> {
  return {
    content: [{ type: 'text', text }],
    finishReason: { unified: 'stop', raw: 'stop' },
    usage: {
      inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
      outputTokens: { total: 1, text: 1, reasoning: 0 },
    },
    providerMetadata: acknowledged(settings.primary).metadata,
    warnings: [],
  };
}
function adapter(fetch: NonNullable<GatewayProviderSettings['fetch']>) {
  return new GatewayLanguageModelAdapter(
    'offline-fixture-not-a-real-key',
    generateText,
    (options) => createGateway({ ...options, fetch }),
  );
}

describe('pinned Gateway/AI SDK normalization with offline HTTP transport', () => {
  afterEach(() => vi.useRealTimers());
  it.each(['missing usage', 'null usage', 'empty object'] as const)(
    'definitively refuses successful JSON with %s without fallback or transient breaker accounting',
    async (fault) => {
      vi.useFakeTimers();
      let healthy = false;
      const models: string[] = [];
      const fetch = vi.fn<NonNullable<GatewayProviderSettings['fetch']>>(async (_url, init) => {
        const model = new Headers(init?.headers).get('ai-language-model-id') ?? 'missing';
        models.push(model);
        expect(typeof init?.body).toBe('string');
        const probe = String(init?.body).includes(settings.probeText);
        const body = response(probe ? 'ready' : explanationFacts(modelReceipt, 'en').join(' '));
        // Secondary is healthy: an incorrectly eligible fallback could complete.
        if (!probe && !healthy && model === settings.primary) {
          if (fault === 'empty object') return Response.json({});
          if (fault === 'missing usage') delete body.usage;
          else body.usage = null;
        }
        return Response.json(body);
      });
      const fixtures = new Map<string, ReturnType<typeof modelTransportFixture>>();
      const transport: ModelExplanationTransport = {
        async execute(request, grant, signal, deadline) {
          let fixture = fixtures.get(request.runId);
          if (!fixture) {
            fixture = modelTransportFixture();
            fixtures.set(request.runId, fixture);
          }
          return fixture.execute(request, grant, signal, deadline);
        },
      };
      const explainer = new ReceiptModelExplainer(adapter(fetch), transport);
      const explain = (index: number) => {
        const receipt = {
          ...modelReceipt,
          runId: `0199c8f2-2394-7ba0-8f9e-${String(index).padStart(12, '0')}`,
        };
        return explainer.explain(
          receipt,
          {
            version: 1,
            eventId: receipt.eventId,
            runId: receipt.runId,
            threadId: receipt.threadId,
            executionId: receipt.executionId,
            checkpointGrant: 's'.repeat(43),
            locale: 'en',
          },
          new AbortController().signal,
          Date.now() + 10000,
        );
      };
      const events = ['fallback', 'circuit-open', 'circuit-rejected'].map((name) =>
        channel(`nestjs:resilience:${name}`),
      );
      const receive = vi.fn<(message: unknown) => void>();
      for (const event of events) event.subscribe(receive);
      try {
        // More than the minimum calls, within the real breaker window. Each run has
        // a successful public probe before its malformed facts-generation response.
        const runs = settings.breaker.minimumCalls + 2;
        for (let index = 0; index < runs; index++) {
          await expect(explain(index)).rejects.toMatchObject({
            kind: 'rejected',
            message: 'Model explanation unavailable.',
          });
          expect(fetch).toHaveBeenCalledTimes((index + 1) * 2);
          const fixture = [...fixtures.values()][index]!;
          expect(fixture.operations).toEqual(['get', 'reserve', 'reserve']);
          expect(fixture.reserved).toBe(settings.probeTokens + settings.explanationTokens);
          expect(fixture.accepted).toBeNull();
          vi.advanceTimersByTime(401);
        }
        expect(receive).not.toHaveBeenCalled();
        healthy = true;
        expect((await explain(100)).model).toBe(settings.primary);
        expect(fetch).toHaveBeenCalledTimes((runs + 1) * 2);
        expect(models).toEqual(Array((runs + 1) * 2).fill(settings.primary));
        expect(receive).not.toHaveBeenCalled();
      } finally {
        for (const event of events) event.unsubscribe(receive);
      }
    },
  );
  it.each([408, 429, 503])(
    'retains recognized HTTP %s as transient with one SDK attempt',
    async (status) => {
      const fetch = vi.fn<NonNullable<GatewayProviderSettings['fetch']>>(async () =>
        Response.json({ error: { message: 'offline transport fixture' } }, { status }),
      );
      await expect(
        adapter(fetch).generate(
          {
            model: settings.primary,
            route: settings.route,
            prompt: settings.probeText,
            maxOutputTokens: settings.probeTokens,
            zeroDataRetention: true,
          },
          new AbortController().signal,
        ),
      ).rejects.toMatchObject({ kind: 'transient' });
      expect(fetch).toHaveBeenCalledOnce();
    },
  );
  it('retains an SDK-recognized transport timeout as transient with one attempt', async () => {
    const fetch = vi.fn<NonNullable<GatewayProviderSettings['fetch']>>(async () => {
      throw new TypeError('fetch failed', {
        cause: Object.assign(new Error('offline connection timeout'), {
          code: 'UND_ERR_CONNECT_TIMEOUT',
        }),
      });
    });
    await expect(
      adapter(fetch).generate(
        {
          model: settings.primary,
          route: settings.route,
          prompt: settings.probeText,
          maxOutputTokens: settings.probeTokens,
          zeroDataRetention: true,
        },
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({ kind: 'transient' });
    expect(fetch).toHaveBeenCalledOnce();
  });
  it('caller cancellation dominates malformed successful SDK output', async () => {
    const controller = new AbortController();
    const fetch = vi.fn<NonNullable<GatewayProviderSettings['fetch']>>(async () => {
      controller.abort(new Error('offline private cancellation reason'));
      return Response.json({});
    });
    await expect(
      adapter(fetch).generate(
        {
          model: settings.primary,
          route: settings.route,
          prompt: settings.probeText,
          maxOutputTokens: settings.probeTokens,
          zeroDataRetention: true,
        },
        controller.signal,
      ),
    ).rejects.toMatchObject({ kind: 'cancelled', message: 'Model explanation unavailable.' });
    expect(fetch).toHaveBeenCalledOnce();
  });
});
