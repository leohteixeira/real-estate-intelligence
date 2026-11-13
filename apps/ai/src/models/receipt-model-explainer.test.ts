import { channel } from 'node:diagnostics_channel';
import { describe, expect, it, vi } from 'vitest';
import { explanationFacts } from '@rei/domain';
import type { LanguageModelRequest } from './language-model.port';
import { ModelExplanationFailure } from './language-model.port';
import { ReceiptModelExplainer } from './receipt-model-explainer';
import { generated, modelReceipt as receipt, modelTransportFixture } from './model-test.fixture';
import { modelExplanationSettings as settings } from './model-explanation.settings';
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
const facts = explanationFacts(receipt, 'en').join(' ');
describe('receipt-bound model orchestration', () => {
  it('treats malformed receipt transport as definitive without spending', async () => {
    const generate = vi.fn(async () => generated(facts));
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
      const generate = vi.fn(async (request: LanguageModelRequest) => {
        void request;
        return generated(golden, 60);
      });
      const model = new ReceiptModelExplainer({ generate }, transport);
      const result = await model.explain(
        receipt,
        { ...context, locale },
        new AbortController().signal,
        Date.now() + 10000,
      );
      expect(result.text).toBe(golden);
      expect(result).toMatchObject({
        authorship: 'model-written',
        model: 'claude-haiku-5-5',
        route: 'anthropic-direct',
        privacyEvidenceId: null,
        outputTokens: 60,
      });
      // One reservation and one provider request: there is no probe and no second model.
      expect(transport.operations).toEqual(['get', 'reserve', 'accept']);
      expect(transport.reserved).toBe(224);
      expect(generate).toHaveBeenCalledOnce();
      const request = generate.mock.calls[0]![0];
      expect(request).toEqual({
        model: 'claude-haiku-5-5',
        route: 'anthropic-direct',
        prompt: request.prompt,
        maxOutputTokens: 224,
      });
      // Only versioned instructions and computed receipt facts cross the provider boundary.
      for (const fact of explanationFacts(receipt, locale)) expect(request.prompt).toContain(fact);
      for (const privateValue of [
        context.runId,
        context.eventId,
        context.threadId,
        context.executionId,
        context.checkpointGrant,
        'private question',
      ])
        expect(request.prompt).not.toContain(privateValue);
      expect(
        await model.explain(
          { ...receipt, executionId: receipt.runId },
          { ...context, executionId: receipt.runId, locale },
          new AbortController().signal,
          Date.now() + 10000,
        ),
      ).toEqual(result);
      expect(generate).toHaveBeenCalledOnce();
    },
  );
  it.each(['policy', 'authentication', 'rejected', 'budget', 'cancelled', 'exhausted'] as const)(
    'does not retry or look for a retained explanation after %s',
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
      expect(transport.operations).toEqual(['get', 'reserve']);
      expect(transport.accepted).toBeNull();
    },
  );
  it('retries a transient failure once on the same model under a fresh reservation and never names another model', async () => {
    const transport = modelTransportFixture();
    let attempts = 0;
    const generate = vi.fn(async (request: LanguageModelRequest) => {
      void request;
      if (++attempts === 1) throw new ModelExplanationFailure('transient');
      return generated(facts);
    });
    const fallback = channel('nestjs:resilience:fallback');
    const receive = vi.fn<(message: unknown) => void>();
    fallback.subscribe(receive);
    try {
      const result = await new ReceiptModelExplainer({ generate }, transport).explain(
        receipt,
        context,
        new AbortController().signal,
        Date.now() + 10000,
      );
      expect(result.model).toBe(settings.model);
      expect(generate.mock.calls.map(([request]) => request.model)).toEqual([
        settings.model,
        settings.model,
      ]);
      expect(transport.operations).toEqual(['get', 'reserve', 'reserve', 'accept']);
      expect(transport.reserved).toBe(448);
      expect(receive).not.toHaveBeenCalled();
    } finally {
      fallback.unsubscribe(receive);
    }
  });
  it('fails with the transient outcome after the bounded attempts when nothing was retained', async () => {
    const transport = modelTransportFixture(),
      generate = vi.fn(async () => {
        throw new ModelExplanationFailure('transient');
      });
    await expect(
      new ReceiptModelExplainer({ generate }, transport).explain(
        receipt,
        context,
        new AbortController().signal,
        Date.now() + 10000,
      ),
    ).rejects.toMatchObject({ kind: 'transient' });
    expect(generate).toHaveBeenCalledTimes(settings.retry.attempts);
    // The closing read is the lost-acceptance check; it finds nothing and spends nothing.
    expect(transport.operations).toEqual(['get', 'reserve', 'reserve', 'get']);
    expect(transport.accepted).toBeNull();
  });
  it('recovers the retained explanation when the acceptance response is lost, without another request', async () => {
    const stored = modelTransportFixture();
    let lost = false;
    const transport: ModelExplanationTransport = {
      async execute(request, grant, signal, deadline) {
        const response = await stored.execute(request, grant, signal, deadline);
        if (request.operation === 'accept' && !lost) {
          lost = true;
          throw new ModelExplanationFailure('transient');
        }
        return response;
      },
    };
    const generate = vi.fn(async () => generated(facts, 60));
    const result = await new ReceiptModelExplainer({ generate }, transport).explain(
      receipt,
      context,
      new AbortController().signal,
      Date.now() + 10000,
    );
    expect(result).toEqual(stored.accepted);
    expect(generate).toHaveBeenCalledOnce();
    expect(stored.operations).toEqual(['get', 'reserve', 'accept', 'get']);
    expect(stored.reserved).toBe(224);
  });
  it('refuses a retained explanation that does not match the receipt during recovery', async () => {
    const stored = modelTransportFixture();
    const transport: ModelExplanationTransport = {
      async execute(request, grant, signal, deadline) {
        const response = await stored.execute(request, grant, signal, deadline);
        if (request.operation !== 'accept') return response;
        stored.accepted = { ...stored.accepted!, text: 'The price will rise.' };
        throw new ModelExplanationFailure('transient');
      },
    };
    await expect(
      new ReceiptModelExplainer({ generate: async () => generated(facts, 60) }, transport).explain(
        receipt,
        context,
        new AbortController().signal,
        Date.now() + 10000,
      ),
    ).rejects.toMatchObject({ kind: 'rejected' });
  });
  it.each([
    { fault: 'another route', field: 'route', value: 'vercel-ai-gateway' },
    { fault: 'another model', field: 'model', value: 'claude-opus-5-5' },
    { fault: 'malformed route', field: 'route', value: null },
    { fault: 'malformed model', field: 'model', value: 42 },
  ])('refuses a result reporting $fault without retry or acceptance', async ({ field, value }) => {
    const transport = modelTransportFixture();
    const generate = vi.fn(async () => {
      const result = generated(facts);
      // Deliberate runtime corruption tests the boundary without fabricating a typed client.
      expect(Reflect.set(result, field, value)).toBe(true);
      return result;
    });
    await expect(
      new ReceiptModelExplainer({ generate }, transport).explain(
        receipt,
        context,
        new AbortController().signal,
        Date.now() + 10000,
      ),
    ).rejects.toMatchObject({ kind: 'rejected' });
    expect(generate).toHaveBeenCalledOnce();
    expect(transport.operations).toEqual(['get', 'reserve']);
    expect(transport.reserved).toBe(settings.explanationTokens);
    expect(transport.accepted).toBeNull();
  });
  it.each([
    { fault: 'another model', field: 'model', value: 'claude-opus-5-5' },
    { fault: 'another purpose', field: 'purpose', value: 'privacy-probe' },
    { fault: 'another bound', field: 'maxOutputTokens', value: 16 },
    { fault: 'another attempt key', field: 'attemptKey', value: 'k'.repeat(32) },
  ])('refuses a reservation answering with $fault before any request', async ({ field, value }) => {
    const stored = modelTransportFixture();
    const transport: ModelExplanationTransport = {
      async execute(request, grant, signal, deadline) {
        const response = await stored.execute(request, grant, signal, deadline);
        return response.operation === 'reserve'
          ? { ...response, reservation: { ...response.reservation, [field]: value } }
          : response;
      },
    };
    const generate = vi.fn(async () => generated(facts));
    await expect(
      new ReceiptModelExplainer({ generate }, transport).explain(
        receipt,
        context,
        new AbortController().signal,
        Date.now() + 10000,
      ),
    ).rejects.toMatchObject({ kind: 'rejected' });
    expect(generate).not.toHaveBeenCalled();
  });
  it.each(['wrong figure', 'The price will rise.', 'Cheap.', 'x'.repeat(2049)])(
    'refuses invented or oversized complete output without repair (%s)',
    async (text) => {
      const transport = modelTransportFixture(),
        generate = vi.fn(async () => generated(text));
      await expect(
        new ReceiptModelExplainer({ generate }, transport).explain(
          receipt,
          context,
          new AbortController().signal,
          Date.now() + 10000,
        ),
      ).rejects.toMatchObject({ kind: 'rejected' });
      expect(transport.accepted).toBeNull();
      expect(generate).toHaveBeenCalledOnce();
    },
  );
  it.each([0, -1, 225, Number.NaN, undefined])(
    'rejects malformed or unbounded usage %s',
    async (outputTokens) => {
      const generate = vi.fn(async () => ({ ...generated(facts), outputTokens }));
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
  it('cancellation before or during the request never retries or sends facts again', async () => {
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
      generate = vi.fn(async () => {
        throw new ModelExplanationFailure('transient');
      }),
      model = new ReceiptModelExplainer({ generate }, transport);
    // Two executions spend four 224-token reservations; the fifth would exceed the 1000 budget.
    for (let i = 0; i < 2; i++)
      await expect(
        model.explain(receipt, context, new AbortController().signal, Date.now() + 10000),
      ).rejects.toMatchObject({ kind: 'transient' });
    for (let i = 0; i < 2; i++)
      await expect(
        model.explain(receipt, context, new AbortController().signal, Date.now() + 10000),
      ).rejects.toMatchObject({ kind: 'budget' });
    expect(transport.reserved).toBe(896);
    expect(transport.accepted).toBeNull();
    expect(generate).toHaveBeenCalledTimes(4);
  });
});
