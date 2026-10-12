import { channel } from 'node:diagnostics_channel';
import { describe, expect, it, vi } from 'vitest';
import { explanationFacts } from '@rei/domain';
import type { LanguageModelRequest } from './language-model.port';
import { ModelExplanationFailure } from './language-model.port';
import { ReceiptModelExplainer } from './receipt-model-explainer';
import { acknowledged, modelReceipt as receipt, modelTransportFixture } from './model-test.fixture';
import { modelExplanationSettings as settings } from './model-explanation.settings';
import { assertGatewayPrivacy, verifyGatewayAcknowledgement } from './gateway-privacy.verifier';
import type { ModelExplanationTransport } from './model-explanation.port';
const context = {
  version: 1 as const,
  eventId: receipt.eventId,
  runId: receipt.runId,
  threadId: receipt.threadId,
  executionId: receipt.executionId,
  checkpointGrant: 's'.repeat(43),
  locale: 'en' as const,
};
describe('receipt-bound model orchestration', () => {
  it('treats malformed receipt transport as definitive without spending or fallback', async () => {
    const generate = vi.fn(async () => acknowledged(settings.primary));
    await expect(
      new ReceiptModelExplainer(
        { generate },
        { execute: async () => ({ operation: 'get', explanation: null, extra: true }) },
      ).explain(receipt, context, new AbortController().signal, Date.now() + 10000),
    ).rejects.toMatchObject({ kind: 'rejected' });
    expect(generate).not.toHaveBeenCalled();
  });
  it.each(['en', 'pt-BR'] as const)(
    'persists full model output before returning, and reuses it on fresh authority (%s)',
    async (locale) => {
      const transport = modelTransportFixture(),
        golden = [...explanationFacts(receipt, locale)].reverse().join(' ');
      const generate = vi.fn(async (request: LanguageModelRequest) =>
        acknowledged(
          request.model,
          request.prompt === settings.probeText ? 'ready' : golden,
          request.prompt === settings.probeText ? 1 : 60,
        ),
      );
      const model = new ReceiptModelExplainer({ generate }, transport);
      const result = await model.explain(
        receipt,
        { ...context, locale },
        new AbortController().signal,
        Date.now() + 10000,
      );
      expect(result.text).toBe(golden);
      expect(result.authorship).toBe('model-written');
      expect(transport.operations).toEqual(['get', 'reserve', 'reserve', 'accept']);
      expect(transport.reserved).toBe(240);
      expect(generate).toHaveBeenCalledTimes(2);
      const prompt = generate.mock.calls[1]![0].prompt;
      for (const privateValue of [
        context.runId,
        context.eventId,
        context.threadId,
        context.executionId,
        context.checkpointGrant,
        'private question',
      ])
        expect(prompt).not.toContain(privateValue);
      expect(generate.mock.calls.every(([request]) => request.zeroDataRetention)).toBe(true);
      expect(
        await model.explain(
          { ...receipt, executionId: receipt.runId },
          { ...context, executionId: receipt.runId, locale },
          new AbortController().signal,
          Date.now() + 10000,
        ),
      ).toEqual(result);
      expect(generate).toHaveBeenCalledTimes(2);
    },
  );
  it.each(['policy', 'authentication', 'rejected', 'budget', 'cancelled'] as const)(
    'does not fallback or retry %s',
    async (kind) => {
      const transport = modelTransportFixture(),
        generate = vi.fn(async () => {
          throw new ModelExplanationFailure(kind);
        });
      await expect(
        new ReceiptModelExplainer({ generate }, transport).explain(
          receipt,
          context,
          new AbortController().signal,
          Date.now() + 10000,
        ),
      ).rejects.toMatchObject({ kind });
      expect(generate).toHaveBeenCalledOnce();
      expect(transport.accepted).toBeNull();
    },
  );
  it('allows only transient secondary fallback under the same reservations and privacy gate', async () => {
    const transport = modelTransportFixture();
    const generate = vi.fn(async (request: LanguageModelRequest) => {
      if (request.model === settings.primary) throw new ModelExplanationFailure('transient');
      return acknowledged(
        request.model,
        request.prompt === settings.probeText ? 'ready' : explanationFacts(receipt, 'en').join(' '),
      );
    });
    const result = await new ReceiptModelExplainer({ generate }, transport).explain(
      receipt,
      context,
      new AbortController().signal,
      Date.now() + 10000,
    );
    expect(result.model).toBe(settings.secondary);
    expect(generate.mock.calls.map(([request]) => request.model)).toEqual([
      settings.primary,
      settings.secondary,
      settings.secondary,
    ]);
    expect(transport.reserved).toBe(256);
  });
  it.each([
    undefined,
    {},
    {
      gateway: {
        routing: {
          planningReasoning:
            'ZDR requested: 1 attempts → 0 ZDR attempts. ZDR execution order: anthropic(system)',
        },
      },
    },
    { gateway: { routing: { planningReasoning: 'ready' } } },
  ])('rejects unknown probe metadata before any facts (%j)', async (metadata) => {
    const generate = vi.fn(async () => ({ ...acknowledged(settings.primary), metadata }));
    await expect(
      new ReceiptModelExplainer({ generate }, modelTransportFixture()).explain(
        receipt,
        context,
        new AbortController().signal,
        Date.now() + 10000,
      ),
    ).rejects.toMatchObject({ kind: 'policy' });
    expect(generate).toHaveBeenCalledOnce();
    expect(generate.mock.calls[0]).toBeDefined();
  });
  it.each([
    { fault: 'wrong provider route', field: 'route', value: 'direct-provider' },
    { fault: 'wrong provider model', field: 'model', value: settings.secondary },
    {
      fault: 'control warnings',
      field: 'warnings',
      value: [{ type: 'unsupported-setting', setting: 'zeroDataRetention' }],
    },
    { fault: 'malformed provider route', field: 'route', value: null },
    { fault: 'malformed provider model', field: 'model', value: 42 },
  ])(
    'refuses $fault during the public probe without facts, fallback or acceptance',
    async ({ field, value }) => {
      const transport = modelTransportFixture();
      const generate = vi.fn(async (request: LanguageModelRequest) => {
        const result = acknowledged(request.model);
        // Deliberate runtime corruption tests the boundary without fabricating a typed client.
        expect(Reflect.set(result, field, value)).toBe(true);
        expect(result).toHaveProperty(field, value);
        return result;
      });
      const fallback = channel('nestjs:resilience:fallback');
      const receive = vi.fn<(message: unknown) => void>();
      fallback.subscribe(receive);
      try {
        await expect(
          new ReceiptModelExplainer({ generate }, transport).explain(
            receipt,
            context,
            new AbortController().signal,
            Date.now() + 10000,
          ),
        ).rejects.toMatchObject({ kind: 'policy' });
        expect(generate).toHaveBeenCalledOnce();
        expect(generate.mock.calls[0]?.[0]).toEqual({
          model: settings.primary,
          route: settings.route,
          prompt: settings.probeText,
          maxOutputTokens: settings.probeTokens,
          zeroDataRetention: true,
        });
        expect(receive).not.toHaveBeenCalled();
        expect(transport.operations).toEqual(['get', 'reserve']);
        expect(transport.reserved).toBe(settings.probeTokens);
        expect(transport.accepted).toBeNull();
      } finally {
        fallback.unsubscribe(receive);
      }
    },
  );
  it('refuses evidence expiring during the second reservation before facts generation or fallback', async () => {
    let now = 100;
    const deadlineAt = now + settings.evidenceTtlMs + 10000;
    const stored = modelTransportFixture();
    const transport: ModelExplanationTransport = {
      async execute(request, grant, signal, deadline) {
        const response = await stored.execute(request, grant, signal, deadline);
        if (request.operation === 'reserve' && request.purpose === 'explanation')
          now += settings.evidenceTtlMs;
        return response;
      },
    };
    const generate = vi.fn(async (request: LanguageModelRequest) => acknowledged(request.model));
    const fallback = channel('nestjs:resilience:fallback');
    const receive = vi.fn<(message: unknown) => void>();
    fallback.subscribe(receive);
    try {
      await expect(
        new ReceiptModelExplainer({ generate }, transport, () => now).explain(
          receipt,
          context,
          new AbortController().signal,
          deadlineAt,
        ),
      ).rejects.toMatchObject({ kind: 'policy' });
      expect(now).toBe(100 + settings.evidenceTtlMs);
      expect(now).toBeLessThan(deadlineAt);
      expect(generate).toHaveBeenCalledOnce();
      expect(generate.mock.calls[0]?.[0].prompt).toBe(settings.probeText);
      expect(generate.mock.calls[0]?.[0].model).toBe(settings.primary);
      expect(receive).not.toHaveBeenCalled();
      expect(stored.operations).toEqual(['get', 'reserve', 'reserve']);
      expect(stored.reserved).toBe(settings.probeTokens + settings.explanationTokens);
      expect(stored.accepted).toBeNull();
    } finally {
      fallback.unsubscribe(receive);
    }
  });
  it.each(['wrong figure', 'The price will rise.', 'Cheap.', 'x'.repeat(2049)])(
    'refuses invented or oversized complete output without repair (%s)',
    async (text) => {
      const transport = modelTransportFixture(),
        generate = vi.fn(async (request: LanguageModelRequest) =>
          acknowledged(request.model, request.prompt === settings.probeText ? 'ready' : text),
        );
      await expect(
        new ReceiptModelExplainer({ generate }, transport).explain(
          receipt,
          context,
          new AbortController().signal,
          Date.now() + 10000,
        ),
      ).rejects.toMatchObject({ kind: 'rejected' });
      expect(transport.accepted).toBeNull();
      expect(generate).toHaveBeenCalledTimes(2);
    },
  );
  it.each([0, -1, 225, Number.NaN, undefined])(
    'rejects malformed or unbounded usage %s',
    async (outputTokens) => {
      const generate = vi.fn(async (request: LanguageModelRequest) => ({
        ...acknowledged(
          request.model,
          request.prompt === settings.probeText
            ? 'ready'
            : explanationFacts(receipt, 'en').join(' '),
        ),
        outputTokens,
      }));
      await expect(
        new ReceiptModelExplainer({ generate }, modelTransportFixture()).explain(
          receipt,
          context,
          new AbortController().signal,
          Date.now() + 10000,
        ),
      ).rejects.toMatchObject({ kind: 'rejected' });
    },
  );
  it('cancellation before/during probe never falls back or sends facts', async () => {
    const controller = new AbortController(),
      generate = vi.fn(async () => {
        controller.abort();
        throw new ModelExplanationFailure('cancelled');
      });
    const transport = modelTransportFixture();
    await expect(
      new ReceiptModelExplainer({ generate }, transport).explain(
        receipt,
        context,
        controller.signal,
        Date.now() + 10000,
      ),
    ).rejects.toMatchObject({ kind: 'cancelled' });
    expect(generate).toHaveBeenCalledOnce();
    generate.mockClear();
    await expect(
      new ReceiptModelExplainer({ generate }, transport).explain(
        receipt,
        context,
        controller.signal,
        Date.now() + 10000,
      ),
    ).rejects.toMatchObject({ kind: 'cancelled' });
    expect(generate).not.toHaveBeenCalled();
  });
  it('never replenishes uncertain reservations across repeated execution', async () => {
    const transport = modelTransportFixture(),
      generate = vi.fn(async (request: LanguageModelRequest) => {
        if (request.prompt !== settings.probeText) throw new ModelExplanationFailure('transient');
        return acknowledged(request.model);
      }),
      model = new ReceiptModelExplainer({ generate }, transport);
    for (let i = 0; i < 2; i++)
      await expect(
        model.explain(receipt, context, new AbortController().signal, Date.now() + 10000),
      ).rejects.toMatchObject({ kind: 'transient' });
    await expect(
      model.explain(receipt, context, new AbortController().signal, Date.now() + 10000),
    ).rejects.toMatchObject({ kind: 'budget' });
    expect(transport.accepted).toBeNull();
    expect(generate).toHaveBeenCalledTimes(9);
  });
  it('refuses stale, future, wrong model/route/privacy evidence and warnings', () => {
    const proof = {
      id: 'p'.repeat(32),
      model: settings.primary,
      route: settings.route,
      policy: 'gateway-zdr-routing-v1' as const,
      verifiedAt: 100,
      expiresAt: 30100,
    };
    expect(() => assertGatewayPrivacy(proof, settings.primary, 101)).not.toThrow();
    const wrongRoute = { ...proof };
    expect(Reflect.set(wrongRoute, 'route', 'direct-provider')).toBe(true);
    expect(() => assertGatewayPrivacy(wrongRoute, settings.primary, 101)).toThrow(
      ModelExplanationFailure,
    );
    for (const [value, model, now] of [
      [proof, settings.primary, 30100],
      [proof, settings.primary, 99],
      [proof, settings.secondary, 101],
      [{ ...proof, expiresAt: 30101 }, settings.primary, 101],
      [{ ...proof, id: 'bad' }, settings.primary, 101],
    ] as const)
      expect(() => assertGatewayPrivacy(value, model, now)).toThrow(ModelExplanationFailure);
    expect(() =>
      verifyGatewayAcknowledgement(
        { ...acknowledged(settings.primary), warnings: ['unknown control'] },
        settings.primary,
      ),
    ).toThrow(ModelExplanationFailure);
    expect(() =>
      verifyGatewayAcknowledgement(acknowledged(settings.secondary), settings.primary),
    ).toThrow(ModelExplanationFailure);
  });
});
