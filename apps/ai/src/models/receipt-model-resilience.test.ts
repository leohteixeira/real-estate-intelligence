import { channel } from 'node:diagnostics_channel';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ResilienceTimeoutError } from '@nestjs/resilience';
import { explanationFacts } from '@rei/domain';
import { ModelExplanationFailure, type LanguageModel } from './language-model.port';
import { ReceiptModelExplainer } from './receipt-model-explainer';
import { generated, modelReceipt, modelTransportFixture } from './model-test.fixture';
import { modelExplanationSettings as settings } from './model-explanation.settings';
import type { ModelExplanationTransport } from './model-explanation.port';

function runs(generate: LanguageModel['generate'], now: () => number = Date.now) {
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
  const model = new ReceiptModelExplainer({ generate }, transport, now, () => 1);
  return {
    fixtures,
    async explain(index: number, signal = new AbortController().signal, remainingMs = 10000) {
      const receipt = {
        ...modelReceipt,
        runId: `0199c8f2-2394-7ba0-8f9e-${String(index).padStart(12, '0')}`,
      };
      return model.explain(
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
        signal,
        Date.now() + remainingMs,
      );
    },
  };
}
function good() {
  return generated(explanationFacts(modelReceipt, 'en').join(' '));
}

async function settle<T>(promise: Promise<T>): Promise<T> {
  const outcome = promise.then(
    (value) => ({ value }),
    (error: unknown) => ({ error }),
  );
  await vi.advanceTimersByTimeAsync(101);
  const result = await outcome;
  if ('error' in result) throw result.error;
  return result.value;
}
describe('named resilience for the single approved model across runs', () => {
  afterEach(() => vi.useRealTimers());
  it('opens after repeated transient failures, refuses without a provider request, then recovers half-open', async () => {
    vi.useFakeTimers();
    const fallback = channel('nestjs:resilience:fallback');
    const receive = vi.fn<(message: unknown) => void>();
    fallback.subscribe(receive);
    try {
      const generate = vi.fn<LanguageModel['generate']>(async () => {
        throw new ModelExplanationFailure('transient');
      });
      const campaign = runs(generate);
      for (let index = 0; index < settings.breaker.minimumCalls + 2; index++) {
        await expect(settle(campaign.explain(index))).rejects.toMatchObject({ kind: 'transient' });
        vi.advanceTimersByTime(301);
      }
      // Twenty logical calls plus the low-traffic retry reserve; the open circuit sends nothing.
      expect(generate).toHaveBeenCalledTimes(
        settings.breaker.minimumCalls + settings.retry.lowTrafficRetryReserve,
      );
      expect(generate.mock.calls.every(([request]) => request.model === settings.model)).toBe(true);
      const refused = [...campaign.fixtures.values()].at(-1)!;
      expect(refused.operations).toEqual(['get', 'get']);
      expect(refused.reserved).toBe(0);
      const before = generate.mock.calls.length;
      generate.mockImplementation(async () => good());
      vi.advanceTimersByTime(settings.breaker.openDuration);
      expect((await campaign.explain(100)).model).toBe(settings.model);
      expect((await campaign.explain(101)).model).toBe(settings.model);
      expect(generate.mock.calls.length - before).toBe(2);
      for (const fixture of campaign.fixtures.values())
        expect(fixture.reserved).toBeLessThanOrEqual(1000);
      expect(receive).not.toHaveBeenCalled();
    } finally {
      fallback.unsubscribe(receive);
    }
  });
  it('returns real slow model output and counts each logical call once before opening', async () => {
    vi.useFakeTimers();
    let now = 0;
    const generate = vi.fn<LanguageModel['generate']>(async () => {
      now += settings.slowCallThresholdMs;
      return good();
    });
    const campaign = runs(generate, () => now);
    for (let index = 0; index < settings.breaker.minimumCalls; index++) {
      if (index > 0 && index % 10 === 0) vi.advanceTimersByTime(1001);
      const explanation = await campaign.explain(index);
      expect(explanation.model).toBe(settings.model);
      expect(explanation.text).toBe(explanationFacts(modelReceipt, 'en').join(' '));
      expect(generate).toHaveBeenCalledTimes(index + 1);
    }
    vi.advanceTimersByTime(1001);
    await expect(campaign.explain(100)).rejects.toMatchObject({ kind: 'transient' });
    expect(generate).toHaveBeenCalledTimes(settings.breaker.minimumCalls);
  });
  it('refuses exhausted credit without a retry, opens the circuit and sends nothing on the next run', async () => {
    vi.useFakeTimers();
    const generate = vi.fn<LanguageModel['generate']>(async () => {
      throw new ModelExplanationFailure('exhausted');
    });
    const campaign = runs(generate);
    await expect(campaign.explain(1)).rejects.toMatchObject({ kind: 'exhausted' });
    expect(generate).toHaveBeenCalledOnce();
    await expect(campaign.explain(2)).rejects.toMatchObject({ kind: 'transient' });
    expect(generate).toHaveBeenCalledOnce();
    expect([...campaign.fixtures.values()][1]?.reserved).toBe(0);
    generate.mockImplementation(async () => good());
    vi.advanceTimersByTime(settings.breaker.openDuration);
    expect((await campaign.explain(3)).model).toBe(settings.model);
  });
  it.each(['policy', 'authentication', 'rejected', 'budget', 'cancelled'] as const)(
    'repeated %s refusals never open the circuit',
    async (kind) => {
      vi.useFakeTimers();
      const generate = vi.fn<LanguageModel['generate']>(async () => {
        throw new ModelExplanationFailure(kind);
      });
      const campaign = runs(generate);
      for (let index = 0; index < settings.breaker.minimumCalls + 2; index++) {
        await expect(campaign.explain(index)).rejects.toMatchObject({ kind });
        vi.advanceTimersByTime(301);
      }
      expect(generate).toHaveBeenCalledTimes(settings.breaker.minimumCalls + 2);
      generate.mockImplementation(async () => good());
      expect((await campaign.explain(100)).model).toBe(settings.model);
    },
  );
  it('package attempt timeout is transient and retried, but caller/deadline cancellation is not', async () => {
    vi.useFakeTimers();
    let attempts = 0;
    const generate = vi.fn<LanguageModel['generate']>(async () => {
      if (++attempts === 1) throw new ResilienceTimeoutError(3500, settings.policies.timeout);
      return good();
    });
    expect((await settle(runs(generate).explain(1))).model).toBe(settings.model);
    expect(generate).toHaveBeenCalledTimes(2);
    generate.mockClear();
    generate.mockImplementation(async () => {
      throw new DOMException('private abort reason', 'AbortError');
    });
    const campaign = runs(generate);
    for (let index = 0; index < settings.breaker.minimumCalls + 2; index++) {
      await expect(campaign.explain(index)).rejects.toMatchObject({ kind: 'cancelled' });
      vi.advanceTimersByTime(301);
    }
    expect(generate).toHaveBeenCalledTimes(settings.breaker.minimumCalls + 2);
    generate.mockImplementation(async () => good());
    expect((await campaign.explain(100)).model).toBe(settings.model);
    const controller = new AbortController();
    controller.abort(new ResilienceTimeoutError(10, 'caller-deadline'));
    generate.mockClear();
    await expect(campaign.explain(101, controller.signal)).rejects.toMatchObject({
      kind: 'cancelled',
    });
    expect(generate).not.toHaveBeenCalled();
  });
  it('actual named attempt timeout cancels the attempt and retries once under a fresh reservation', async () => {
    vi.useFakeTimers();
    let attempts = 0;
    const generate = vi.fn<LanguageModel['generate']>(async (_request, signal) => {
      if (++attempts === 1)
        return new Promise((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(signal.reason), { once: true });
        });
      return good();
    });
    const campaign = runs(generate);
    const pending = campaign.explain(1);
    await vi.advanceTimersByTimeAsync(settings.timeoutMs + settings.retry.baseDelayMs + 1);
    expect((await pending).model).toBe(settings.model);
    expect(generate).toHaveBeenCalledTimes(2);
    expect([...campaign.fixtures.values()][0]?.reserved).toBe(448);
  });
  it('caller abort during a live timeout-wrapped attempt records no circuit failure', async () => {
    vi.useFakeTimers();
    const generate = vi.fn<LanguageModel['generate']>(
      async (_request, signal) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(signal.reason), { once: true });
        }),
    );
    const campaign = runs(generate);
    for (let index = 0; index < settings.breaker.minimumCalls + 2; index++) {
      const controller = new AbortController();
      const pending = campaign.explain(index, controller.signal);
      const asserted = expect(pending).rejects.toMatchObject({ kind: 'cancelled' });
      await vi.advanceTimersByTimeAsync(1);
      controller.abort(new ResilienceTimeoutError(1, 'caller-deadline'));
      await asserted;
      vi.advanceTimersByTime(301);
    }
    expect(generate).toHaveBeenCalledTimes(settings.breaker.minimumCalls + 2);
    generate.mockImplementation(async () => good());
    expect((await campaign.explain(100)).model).toBe(settings.model);
  });
  it('an expired numeric deadline wins before its abort timer dispatches and never poisons the circuit', async () => {
    vi.useFakeTimers();
    const generate = vi.fn<LanguageModel['generate']>(async () => {
      vi.advanceTimersByTime(11);
      throw new ResilienceTimeoutError(10, 'attempt-timeout');
    });
    const campaign = runs(generate);
    for (let index = 0; index < settings.breaker.minimumCalls + 2; index++) {
      await expect(campaign.explain(index, new AbortController().signal, 10)).rejects.toMatchObject(
        { kind: 'cancelled' },
      );
      vi.advanceTimersByTime(301);
    }
    expect(generate).toHaveBeenCalledTimes(settings.breaker.minimumCalls + 2);
    generate.mockImplementation(async () => good());
    expect((await campaign.explain(100)).model).toBe(settings.model);
  });
});
