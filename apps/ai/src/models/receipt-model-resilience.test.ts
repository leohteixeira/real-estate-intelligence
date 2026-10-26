import { channel } from 'node:diagnostics_channel';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ResilienceTimeoutError } from '@nestjs/resilience';
import { explanationFacts } from '@rei/domain';
import {
  ModelExplanationFailure,
  type LanguageModel,
  type LanguageModelRequest,
} from './language-model.port';
import { ReceiptModelExplainer } from './receipt-model-explainer';
import { acknowledged, modelReceipt, modelTransportFixture } from './model-test.fixture';
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
function good(request: LanguageModelRequest) {
  return acknowledged(
    request.model,
    request.prompt === settings.probeText
      ? 'ready'
      : explanationFacts(modelReceipt, 'en').join(' '),
  );
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
describe('model/route-isolated named resilience across runs', () => {
  afterEach(() => vi.useRealTimers());
  it('an open primary never suppresses a healthy approved secondary, including half-open recovery', async () => {
    vi.useFakeTimers();
    const generate = vi.fn(async (request: LanguageModelRequest) => {
      if (request.model === settings.primary) throw new ModelExplanationFailure('transient');
      return good(request);
    });
    const campaign = runs(generate);
    for (let index = 0; index < settings.breaker.minimumCalls + 2; index++) {
      expect((await settle(campaign.explain(index))).model).toBe(settings.secondary);
      vi.advanceTimersByTime(301);
    }
    expect(
      generate.mock.calls.filter(([request]) => request.model === settings.primary),
    ).toHaveLength(settings.breaker.minimumCalls + settings.retry.lowTrafficRetryReserve);
    const probes = generate.mock.calls.length;
    generate.mockImplementation(async (request) => good(request));
    vi.advanceTimersByTime(settings.breaker.openDuration);
    expect((await campaign.explain(100)).model).toBe(settings.primary);
    expect((await campaign.explain(101)).model).toBe(settings.primary);
    expect(generate.mock.calls.length - probes).toBe(4);
    for (const fixture of campaign.fixtures.values())
      expect(fixture.reserved).toBeLessThanOrEqual(1000);
  });
  it('returns real slow model output and counts each logical phase once before opening only its route', async () => {
    vi.useFakeTimers();
    let now = 0;
    const generate = vi.fn(async (request: LanguageModelRequest) => {
      now += settings.slowCallThresholdMs;
      return good(request);
    });
    const campaign = runs(generate, () => now);
    for (let index = 0; index < settings.breaker.minimumCalls / 2; index++) {
      if (index > 0 && index % 5 === 0) vi.advanceTimersByTime(1001);
      const explanation = await campaign.explain(index);
      expect(explanation.model).toBe(settings.primary);
      expect(explanation.text).toBe(explanationFacts(modelReceipt, 'en').join(' '));
      expect(generate).toHaveBeenCalledTimes((index + 1) * 2);
    }
    vi.advanceTimersByTime(1001);
    expect((await campaign.explain(100)).model).toBe(settings.secondary);
    expect(
      generate.mock.calls.filter(([request]) => request.model === settings.primary),
    ).toHaveLength(settings.breaker.minimumCalls);
    expect(
      generate.mock.calls.filter(([request]) => request.model === settings.secondary),
    ).toHaveLength(2);
  });
  it('refuses exhausted quota without current-call fallback, opens only its route, then allows circuit-open fallback', async () => {
    vi.useFakeTimers();
    const fallback = channel('nestjs:resilience:fallback');
    const events: unknown[] = [];
    const receive = (event: unknown) => events.push(event);
    fallback.subscribe(receive);
    try {
      const generate = vi.fn(async (request: LanguageModelRequest) => {
        if (request.model === settings.primary) throw new ModelExplanationFailure('exhausted');
        return good(request);
      });
      const campaign = runs(generate);
      await expect(campaign.explain(1)).rejects.toMatchObject({ kind: 'exhausted' });
      expect(events).toHaveLength(0);
      expect(generate).toHaveBeenCalledOnce();
      expect((await campaign.explain(2)).model).toBe(settings.secondary);
      expect(
        generate.mock.calls.filter(([request]) => request.model === settings.primary),
      ).toHaveLength(1);
      expect(events).toHaveLength(1);
      for (const event of events)
        expect(event).toMatchObject({ policy: settings.policies.fallback });
    } finally {
      fallback.unsubscribe(receive);
    }
  });
  it.each(['policy', 'authentication', 'rejected', 'budget', 'cancelled'] as const)(
    'repeated %s refusals never open a circuit or select secondary',
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
      generate.mockImplementation(async (request: LanguageModelRequest) => good(request));
      expect((await campaign.explain(100)).model).toBe(settings.primary);
    },
  );
  it('package attempt timeout is transient, but caller/deadline cancellation never falls back', async () => {
    vi.useFakeTimers();
    const generate = vi.fn(async (request: LanguageModelRequest) => {
      if (request.model === settings.primary)
        throw new ResilienceTimeoutError(3500, settings.policies.timeout);
      return good(request);
    });
    expect((await settle(runs(generate).explain(1))).model).toBe(settings.secondary);
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
    generate.mockImplementation(async (request) => good(request));
    expect((await campaign.explain(100)).model).toBe(settings.primary);
    const controller = new AbortController();
    controller.abort(new ResilienceTimeoutError(10, 'caller-deadline'));
    generate.mockClear();
    await expect(campaign.explain(101, controller.signal)).rejects.toMatchObject({
      kind: 'cancelled',
    });
    expect(generate).not.toHaveBeenCalled();
  });
  it('a secondary exhausted circuit does not poison primary success or recurse through fallback', async () => {
    vi.useFakeTimers();
    let primaryHealthy = false;
    const generate = vi.fn(async (request: LanguageModelRequest) => {
      if (request.model === settings.secondary) throw new ModelExplanationFailure('exhausted');
      if (!primaryHealthy) throw new ModelExplanationFailure('transient');
      return good(request);
    });
    const campaign = runs(generate);
    await expect(settle(campaign.explain(1))).rejects.toMatchObject({ kind: 'exhausted' });
    primaryHealthy = true;
    expect((await campaign.explain(2)).model).toBe(settings.primary);
    primaryHealthy = false;
    await expect(settle(campaign.explain(3))).rejects.toMatchObject({ kind: 'transient' });
    expect(
      generate.mock.calls.filter(([request]) => request.model === settings.secondary),
    ).toHaveLength(1);
  });
  it('actual named attempt timeout cancels the attempt but allows bounded healthy secondary', async () => {
    vi.useFakeTimers();
    const generate = vi.fn<LanguageModel['generate']>(async (request, signal) => {
      if (request.model === settings.primary)
        return new Promise((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(signal.reason), { once: true });
        });
      return good(request);
    });
    const campaign = runs(generate);
    const pending = campaign.explain(1);
    await vi.advanceTimersByTimeAsync(settings.timeoutMs * 2 + settings.retry.baseDelayMs + 1);
    expect((await pending).model).toBe(settings.secondary);
    expect(generate).toHaveBeenCalledTimes(4);
    expect([...campaign.fixtures.values()][0]?.reserved).toBe(272);
  });
  it('caller abort during a live timeout-wrapped attempt records neither circuit failure nor fallback', async () => {
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
    generate.mockImplementation(async (request) => good(request));
    expect((await campaign.explain(100)).model).toBe(settings.primary);
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
    generate.mockImplementation(async (request) => good(request));
    expect((await campaign.explain(100)).model).toBe(settings.primary);
  });
});
