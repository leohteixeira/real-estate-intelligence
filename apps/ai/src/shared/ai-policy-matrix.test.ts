import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import { channel } from 'node:diagnostics_channel';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseCheckpointRequest, parsePriceToolRequest } from '@rei/contracts';
import { explanationFacts } from '@rei/domain';
import { AiRetryAllowance, withinAiDeadline } from './ai-resilience';
import {
  AiDependencyPolicyTelemetry,
  safeAiDependencyPolicyAttributes,
} from './ai-policy.telemetry';
import type { AnthropicFetch } from '../models/anthropic-client';
import { providerRetryAfter } from '../models/anthropic-failure';
import { AnthropicIntentDecider } from '../models/intent-decider';
import { GraphModule } from '../graph/graph.module';
import { INTENT_DECIDER, type IntentDecider } from '../models/intent-decider';
import { ResilientIntentDecider } from '../models/resilient-intent-decider';
import { intentResilienceSettings as intentSettings } from '../models/intent-resilience.settings';
import { modelExplanationSettings as modelSettings } from '../models/model-explanation.settings';
import { ModelExplanationFailure } from '../models/language-model.port';
import { ReceiptModelExplainer } from '../models/receipt-model-explainer';
import {
  anthropicError,
  anthropicMessage,
  generated,
  modelReceipt,
  modelTransportFixture,
} from '../models/model-test.fixture';
import { ResilientGraphCheckpointAdapter } from '../graph/resilient-graph-checkpoint.adapter';
import { GraphCheckpointFailure } from '../graph/graph-checkpoint.port';
import { graphCheckpointResilienceSettings as checkpointSettings } from '../graph/graph-checkpoint-resilience.settings';
import { ResilientPricePerSquareMeterTool } from '../tools/resilient-price-per-square-meter.tool';
import { PriceToolFailure } from '../tools/price-per-square-meter.port';
import { HttpGraphCheckpointAdapter } from '../graph/http-graph-checkpoint.adapter';
import { HttpPricePerSquareMeterTool } from '../tools/http-price-per-square-meter.tool';

const signal = () => new AbortController().signal;
const grant = 'g'.repeat(43);
const checkpoint = parseCheckpointRequest({
  version: 1,
  eventId: modelReceipt.eventId,
  runId: modelReceipt.runId,
  threadId: modelReceipt.threadId,
  executionId: modelReceipt.executionId,
  graphVersion: 'price-v1',
  namespace: '',
  operation: 'get',
  checkpointId: null,
});
const price = parsePriceToolRequest({
  version: 1,
  eventId: modelReceipt.eventId,
  runId: modelReceipt.runId,
  threadId: modelReceipt.threadId,
  executionId: modelReceipt.executionId,
  operation: 'price-per-square-meter',
  inputs: modelReceipt.inputs,
});
const context = {
  version: 1 as const,
  eventId: modelReceipt.eventId,
  runId: modelReceipt.runId,
  threadId: modelReceipt.threadId,
  executionId: modelReceipt.executionId,
  checkpointGrant: grant,
  locale: 'en' as const,
};
type Fetch = NonNullable<AnthropicFetch>;
const decisionResponse = () =>
  anthropicMessage(JSON.stringify({ intent: 'price_per_square_meter', probability: 0.9 }));
const facts = () => generated(explanationFacts(modelReceipt, 'en').join(' '));
function classifier(fetch: Fetch) {
  return new ResilientIntentDecider(
    new AnthropicIntentDecider('offline-fixture', fetch),
    Date.now,
    () => 1,
  );
}
async function advance<T>(promise: Promise<T>, ms = 301): Promise<T> {
  const settled = promise.then(
    (value) => ({ value }),
    (error: unknown) => ({ error }),
  );
  await vi.advanceTimersByTimeAsync(ms);
  const outcome = await settled;
  if ('error' in outcome) throw outcome.error;
  return outcome.value;
}
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('offline AI policy failure matrix', () => {
  it('production GraphModule wires the named decision policy around the real SDK', async () => {
    vi.useFakeTimers();
    vi.stubEnv('ANTHROPIC_API_KEY', 'offline-fixture-not-a-real-key');
    let physicalCalls = 0;
    const fetch = vi.fn<typeof globalThis.fetch>(async (url, init) => {
      expect(String(url)).toBe('https://api.anthropic.com/v1/messages');
      expect(new Headers(init?.headers).get('x-api-key')).toBe('offline-fixture-not-a-real-key');
      return ++physicalCalls === 1
        ? Response.json(anthropicError('api_error'), { status: 503 })
        : Response.json(decisionResponse());
    });
    vi.stubGlobal('fetch', fetch);
    const module = await Test.createTestingModule({ imports: [GraphModule] }).compile();
    try {
      await module.init();
      const adapter = module.get<IntentDecider>(INTENT_DECIDER);
      expect(adapter).toBeInstanceOf(ResilientIntentDecider);
      expect(
        await advance(
          adapter.decide('private price per square meter', 'en', signal(), Date.now() + 10000),
        ),
      ).toMatchObject({ degraded: false, source: 'claude-haiku-v1', privacyEvidenceId: null });
      expect(fetch).toHaveBeenCalledTimes(2);
    } finally {
      await module.close();
    }
  });
  it.each(['checkpoint', 'price', 'intent'] as const)(
    '%s breaker records one outcome after retries and admits one half-open probe',
    async (dependency) => {
      vi.useFakeTimers();
      let healthy = false;
      const execute = vi.fn(async () => {
        if (!healthy) throw new GraphCheckpointFailure('transient');
        return { operation: 'get' as const, record: null };
      });
      const calculate = vi.fn(async () => {
        if (!healthy) throw new PriceToolFailure('transient');
        return modelReceipt;
      });
      const fetch = vi.fn<Fetch>(async () =>
        healthy
          ? Response.json(decisionResponse())
          : Response.json(anthropicError('api_error'), { status: 503 }),
      );
      const saver = new ResilientGraphCheckpointAdapter({ execute }, Date.now, () => 1);
      const tool = new ResilientPricePerSquareMeterTool({ calculate }, Date.now, () => 1);
      const decider = classifier(fetch);
      const invoke = (): Promise<unknown> =>
        dependency === 'checkpoint'
          ? saver.execute(checkpoint, grant, signal(), Date.now() + 10000)
          : dependency === 'price'
            ? tool.calculate(price, grant, signal(), Date.now() + 10000)
            : decider.decide('private', 'en', signal(), Date.now() + 10000);
      const requests = () =>
        dependency === 'checkpoint'
          ? execute.mock.calls.length
          : dependency === 'price'
            ? calculate.mock.calls.length
            : fetch.mock.calls.length;
      for (let index = 0; index < 20; index++) {
        const pending = advance(invoke());
        if (dependency === 'intent') expect(await pending).toMatchObject({ degraded: true });
        else await expect(pending).rejects.toMatchObject({ kind: 'transient' });
      }
      expect(requests()).toBe(22);
      const rejected = invoke();
      if (dependency === 'intent') expect(await rejected).toMatchObject({ degraded: true });
      else await expect(rejected).rejects.toMatchObject({ kind: 'transient' });
      expect(requests()).toBe(22);
      healthy = true;
      vi.advanceTimersByTime(30001);
      await invoke();
      expect(requests()).toBe(23);
    },
  );
  it.each(['connection reset', '502 HTML', '503 nonconforming JSON'] as const)(
    'classifier native SDK %s retries and records one transient breaker outcome per decision',
    async (fault) => {
      vi.useFakeTimers();
      let healthy = false;
      const times: number[] = [];
      const fetch = vi.fn<Fetch>(async () => {
        times.push(Date.now());
        if (healthy) return Response.json(decisionResponse());
        if (fault === 'connection reset')
          throw new TypeError('fetch failed', {
            cause: Object.assign(new Error('private network detail'), { code: 'ECONNRESET' }),
          });
        return fault === '502 HTML'
          ? new Response('<html>private upstream failure</html>', {
              status: 502,
              headers: { 'retry-after': '0.1' },
            })
          : Response.json(
              { unexpected: 'private upstream detail' },
              { status: 503, headers: { 'retry-after': '0.1' } },
            );
      });
      const adapter = classifier(fetch);
      for (let index = 0; index < intentSettings.breaker.minimumCalls; index++) {
        const decision = await advance(
          adapter.decide('private', 'en', signal(), Date.now() + 10000),
        );
        expect(decision).toMatchObject({ degraded: true, source: 'heuristic-v1' });
      }
      expect(times.slice(0, 3).map((time) => time - times[0]!)).toEqual(
        fault === 'connection reset' ? [0, 100, 300] : [0, 100, 200],
      );
      expect(fetch).toHaveBeenCalledTimes(
        intentSettings.breaker.minimumCalls + intentSettings.retry.lowTrafficRetryReserve,
      );
      expect(await adapter.decide('private', 'en', signal(), Date.now() + 10000)).toMatchObject({
        degraded: true,
      });
      expect(fetch).toHaveBeenCalledTimes(22);
      healthy = true;
      vi.advanceTimersByTime(intentSettings.breaker.openDuration + 1);
      expect(
        await adapter.decide('price per square meter', 'en', signal(), Date.now() + 10000),
      ).toMatchObject({ degraded: false });
      expect(fetch).toHaveBeenCalledTimes(23);
    },
  );
  it('attempt timeout retries the classifier but original deadline cancellation never yields a heuristic', async () => {
    vi.useFakeTimers();
    const fetch = vi.fn<Fetch>(() => new Promise<Response>(() => {}));
    const adapter = classifier(fetch);
    const pending = adapter.decide('private', 'en', signal(), Date.now() + 10000);
    expect((await advance(pending, 7101)).degraded).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(2);
    const cancelled = adapter.decide('private', 'en', signal(), Date.now() + 25);
    const assertion = expect(cancelled).rejects.toMatchObject({ kind: 'cancelled' });
    await vi.advanceTimersByTimeAsync(25);
    await assertion;
    expect(fetch).toHaveBeenCalledTimes(3);
  });
  it('does not ignore valid provider advice beyond the deadline or configured bound', async () => {
    vi.useFakeTimers();
    for (const advice of ['8', '31']) {
      const fetch = vi.fn<Fetch>(async () =>
        Response.json(anthropicError('rate_limit_error'), {
          status: 429,
          headers: { 'retry-after': advice },
        }),
      );
      expect(
        (await classifier(fetch).decide('private', 'en', signal(), Date.now() + 10000)).degraded,
      ).toBe(true);
      expect(fetch).toHaveBeenCalledOnce();
    }
  });
  it.each([429, 503, 529])(
    'retries classifier HTTP %s using advice with the identical request',
    async (status) => {
      vi.useFakeTimers();
      const times: number[] = [],
        bodies: string[] = [];
      const fetch = vi.fn<Fetch>(async (_url, init) => {
        times.push(Date.now());
        bodies.push(String(init?.body));
        return times.length === 1
          ? Response.json(anthropicError('overloaded_error'), {
              status,
              headers: { 'retry-after': '0.2', 'x-private': 'secret' },
            })
          : Response.json(decisionResponse());
      });
      const pending = classifier(fetch).decide(
        'private price per square meter',
        'en',
        signal(),
        Date.now() + 10000,
      );
      const result = await advance(pending);
      expect(result.degraded).toBe(false);
      expect(times[1]! - times[0]!).toBe(200);
      expect(fetch).toHaveBeenCalledTimes(2);
      expect(bodies[1]).toBe(bodies[0]);
    },
  );
  it.each([400, 401, 403])(
    'does not retry classifier definitive HTTP %s or open its breaker',
    async (status) => {
      vi.useFakeTimers();
      const fetch = vi.fn<Fetch>(async () =>
        Response.json(anthropicError('invalid_request_error'), { status }),
      );
      const adapter = classifier(fetch);
      for (let index = 0; index < 22; index++) {
        const pending = adapter.decide('private query', 'en', signal(), Date.now() + 10000);
        if (status === 400) await expect(pending).rejects.toMatchObject({ kind: 'rejected' });
        else expect((await pending).degraded).toBe(true);
        vi.advanceTimersByTime(101);
      }
      expect(fetch).toHaveBeenCalledTimes(22);
    },
  );
  it('trips exhausted credit immediately and keeps a provider refusal local', async () => {
    vi.useFakeTimers();
    const fetch = vi.fn<Fetch>(async () =>
      Response.json(anthropicError('billing_error'), { status: 402 }),
    );
    const adapter = classifier(fetch);
    expect((await adapter.decide('private', 'en', signal(), Date.now() + 10000)).degraded).toBe(
      true,
    );
    expect((await adapter.decide('private', 'en', signal(), Date.now() + 10000)).degraded).toBe(
      true,
    );
    expect(fetch).toHaveBeenCalledOnce();
    const refusalFetch = vi.fn<Fetch>(async () =>
      Response.json(anthropicMessage('', { stop_reason: 'refusal', content: [] })),
    );
    const refused = classifier(refusalFetch);
    for (let index = 0; index < 22; index++) {
      expect((await refused.decide('private', 'en', signal(), Date.now() + 10000)).degraded).toBe(
        true,
      );
      vi.advanceTimersByTime(101);
    }
    // A refusal is neither retried nor a breaker failure: every decision still reaches the provider.
    expect(refusalFetch).toHaveBeenCalledTimes(22);
  });
  it('bounds classifier physical admission per request, then recovers', async () => {
    vi.useFakeTimers();
    const fetch = vi.fn<Fetch>(async () => Response.json(decisionResponse()));
    const adapter = classifier(fetch);
    for (let index = 0; index < intentSettings.rateLimit.limit; index++)
      expect((await adapter.decide('private', 'en', signal(), Date.now() + 10000)).degraded).toBe(
        false,
      );
    expect((await adapter.decide('private', 'en', signal(), Date.now() + 10000)).degraded).toBe(
      true,
    );
    expect(fetch).toHaveBeenCalledTimes(10);
    vi.advanceTimersByTime(1001);
    expect((await adapter.decide('private', 'en', signal(), Date.now() + 10000)).degraded).toBe(
      false,
    );
  });
  it('cancels the classifier during backoff without a local answer or further HTTP', async () => {
    vi.useFakeTimers();
    const stop = new AbortController();
    const fetch = vi.fn<Fetch>(async () =>
      Response.json(anthropicError('api_error'), { status: 503 }),
    );
    const pending = classifier(fetch).decide('private', 'en', stop.signal, Date.now() + 10000);
    const assertion = expect(pending).rejects.toMatchObject({ kind: 'cancelled' });
    await vi.advanceTimersByTimeAsync(50);
    stop.abort();
    await assertion;
    await vi.advanceTimersByTimeAsync(1000);
    expect(fetch).toHaveBeenCalledOnce();
  });
  it.each(['checkpoint', 'price'] as const)(
    'replays lost %s responses with identical request and stable authority',
    async (dependency) => {
      vi.useFakeTimers();
      const bodies: string[] = [];
      const fetch = vi.fn<typeof globalThis.fetch>(async (_url, init) => {
        bodies.push(String(init?.body));
        if (bodies.length === 1) throw new TypeError('lost response after durable effect');
        return Response.json(
          dependency === 'checkpoint' ? { operation: 'get', record: null } : modelReceipt,
        );
      });
      const pending =
        dependency === 'checkpoint'
          ? new ResilientGraphCheckpointAdapter(
              new HttpGraphCheckpointAdapter('http://api.invalid', fetch),
              Date.now,
              () => 1,
            ).execute(checkpoint, grant, signal(), Date.now() + 10000)
          : new ResilientPricePerSquareMeterTool(
              new HttpPricePerSquareMeterTool('http://api.invalid', fetch),
              Date.now,
              () => 1,
            ).calculate(price, grant, signal(), Date.now() + 10000);
      await advance<unknown>(pending);
      expect(fetch).toHaveBeenCalledTimes(2);
      expect(bodies[1]).toBe(bodies[0]);
      expect(new Headers(fetch.mock.calls[1]?.[1]?.headers).get('authorization')).toBe(
        `Bearer ${grant}`,
      );
    },
  );
  it.each(['checkpoint', 'price'] as const)(
    '%s refusals and caller cancellation never poison its breaker',
    async (dependency) => {
      vi.useFakeTimers();
      const execute = vi.fn(async () => {
        throw new GraphCheckpointFailure('rejected');
      });
      const calculate = vi.fn(async () => {
        throw new PriceToolFailure('rejected');
      });
      const saver = new ResilientGraphCheckpointAdapter({ execute });
      const tool = new ResilientPricePerSquareMeterTool({ calculate });
      for (let index = 0; index < 22; index++) {
        await expect(
          dependency === 'checkpoint'
            ? saver.execute(checkpoint, grant, signal(), Date.now() + 10000)
            : tool.calculate(price, grant, signal(), Date.now() + 10000),
        ).rejects.toMatchObject({ kind: 'rejected' });
        vi.advanceTimersByTime(101);
      }
      expect(dependency === 'checkpoint' ? execute : calculate).toHaveBeenCalledTimes(22);
    },
  );
  it.each(['checkpoint', 'price'] as const)(
    '%s numeric deadline expires while queued before adapter admission',
    async (dependency) => {
      vi.useFakeTimers();
      const execute = vi.fn(() => new Promise<never>(() => {}));
      const calculate = vi.fn(() => new Promise<never>(() => {}));
      const saver = new ResilientGraphCheckpointAdapter({ execute });
      const tool = new ResilientPricePerSquareMeterTool({ calculate });
      const call = (controller: AbortController, remaining: number) =>
        dependency === 'checkpoint'
          ? saver.execute(checkpoint, grant, controller.signal, Date.now() + remaining)
          : tool.calculate(price, grant, controller.signal, Date.now() + remaining);
      const controllers = Array.from({ length: 3 }, () => new AbortController());
      const occupied = controllers.map((controller) =>
        call(controller, 10000).catch((error: unknown) => error),
      );
      await vi.advanceTimersByTimeAsync(0);
      const pending = call(new AbortController(), 25);
      const assertion = expect(pending).rejects.toMatchObject({ kind: 'cancelled' });
      await vi.advanceTimersByTimeAsync(25);
      await assertion;
      expect(dependency === 'checkpoint' ? execute : calculate).toHaveBeenCalledTimes(3);
      controllers.forEach((controller) => controller.abort());
      await Promise.all(occupied);
    },
  );
  it('returns slow real classifier decisions while recording exactly one logical breaker outcome', async () => {
    vi.useFakeTimers();
    let now = 0;
    const fetch = vi.fn<Fetch>(async () => {
      now += intentSettings.slowCallThresholdMs;
      return Response.json(decisionResponse());
    });
    const adapter = new ResilientIntentDecider(
      new AnthropicIntentDecider('offline-fixture', fetch),
      () => now,
    );
    for (let index = 0; index < intentSettings.breaker.minimumCalls; index++) {
      if (index > 0 && index % 10 === 0) vi.advanceTimersByTime(1001);
      expect(
        (await adapter.decide('price per square meter', 'en', signal(), Date.now() + 10000))
          .degraded,
      ).toBe(false);
      expect(fetch).toHaveBeenCalledTimes(index + 1);
    }
    expect(
      (await adapter.decide('price per square meter', 'en', signal(), Date.now() + 10000)).degraded,
    ).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(intentSettings.breaker.minimumCalls);
  });
  it('retries facts only with a fresh prior reservation, no duplicate acceptance and no later spend', async () => {
    vi.useFakeTimers();
    const transport = modelTransportFixture();
    const keys: string[] = [];
    const savedExecute = transport.execute.bind(transport);
    transport.execute = async (...args) => {
      if (args[0].operation === 'reserve') keys.push(args[0].attemptKey);
      return savedExecute(...args);
    };
    const times: number[] = [];
    const generate = vi.fn(async () => {
      expect(keys.length).toBe(generate.mock.calls.length);
      times.push(Date.now());
      if (times.length === 1) throw new ModelExplanationFailure('transient', 200);
      return facts();
    });
    const model = new ReceiptModelExplainer({ generate }, transport, Date.now, () => 1);
    const explanation = await advance(
      model.explain(modelReceipt, context, signal(), Date.now() + 10000),
    );
    expect(explanation.model).toBe(modelSettings.model);
    expect(times[1]! - times[0]!).toBe(200);
    expect(transport.reserved).toBe(448);
    expect(new Set(keys).size).toBe(2);
    expect(transport.operations).toEqual(['get', 'reserve', 'reserve', 'accept']);
    expect(await model.explain(modelReceipt, context, signal(), Date.now() + 10000)).toEqual(
      explanation,
    );
    expect(generate).toHaveBeenCalledTimes(2);
  });
  it('does not repeat an uncertain reservation, and its original deadline covers a hanging receipt get', async () => {
    vi.useFakeTimers();
    const transport = modelTransportFixture();
    const execute = transport.execute.bind(transport);
    let reservationCalls = 0;
    transport.execute = async (...args) => {
      if (args[0].operation === 'reserve') {
        reservationCalls++;
        throw new ModelExplanationFailure('transient');
      }
      return execute(...args);
    };
    const generate = vi.fn(async () => facts());
    await expect(
      new ReceiptModelExplainer({ generate }, transport).explain(
        modelReceipt,
        context,
        signal(),
        Date.now() + 10000,
      ),
    ).rejects.toMatchObject({ kind: 'transient' });
    expect(reservationCalls).toBe(1); // Never a retry of an uncertain reservation.
    expect(generate).not.toHaveBeenCalled();
    const pending = new ReceiptModelExplainer(
      { generate },
      { execute: () => new Promise<never>(() => {}) },
    ).explain(modelReceipt, context, signal(), Date.now() + 25);
    const assertion = expect(pending).rejects.toMatchObject({ kind: 'cancelled' });
    await vi.advanceTimersByTimeAsync(25);
    await assertion;
    expect(generate).not.toHaveBeenCalled();
  });
  it('does not retry an ambiguous acceptance and recovers the retained output without another request', async () => {
    const transport = modelTransportFixture();
    const execute = transport.execute.bind(transport);
    transport.execute = async (...args) => {
      const response = await execute(...args);
      if (args[0].operation === 'accept') throw new ModelExplanationFailure('transient');
      return response;
    };
    const generate = vi.fn(async () => facts());
    expect(
      (
        await new ReceiptModelExplainer({ generate }, transport).explain(
          modelReceipt,
          context,
          signal(),
          Date.now() + 10000,
        )
      ).model,
    ).toBe(modelSettings.model);
    expect(generate).toHaveBeenCalledOnce();
    expect(transport.operations).toEqual(['get', 'reserve', 'accept', 'get']);
  });
  it('enforces bounded rolling retry allowance, full jitter and deadline fit', async () => {
    vi.useFakeTimers();
    const allowance = new AiRetryAllowance(checkpointSettings.retry, Date.now, () => 0.5);
    const transient = new ModelExplanationFailure('transient');
    const started = Date.now();
    const attemptedAt: number[] = [];
    const work = vi.fn(async () => {
      attemptedAt.push(Date.now() - started);
      throw transient;
    });
    const run = (remaining: number) => {
      allowance.recordCall();
      return allowance
        .policy(
          'checkpoint.transient-retry',
          signal(),
          Date.now() + remaining,
          3500,
          (error) => error === transient,
        )
        .execute(work);
    };
    await expect(advance(run(10000))).rejects.toBe(transient);
    expect(work).toHaveBeenCalledTimes(3);
    expect(attemptedAt).toEqual([0, 50, 150]);
    await expect(run(10000)).rejects.toBe(transient);
    expect(work).toHaveBeenCalledTimes(4);
    vi.advanceTimersByTime(10001);
    const deadlineFitStarted = Date.now();
    await expect(run(3500)).rejects.toBe(transient);
    expect(Date.now()).toBe(deadlineFitStarted);
    expect(work).toHaveBeenCalledTimes(5);
    await expect(advance(run(10000))).rejects.toBe(transient);
    expect(work).toHaveBeenCalledTimes(8);
  });
  it('bounds even ignored cancellation and rejects non-finite or already expired deadlines', async () => {
    vi.useFakeTimers();
    const cancel = () => new ModelExplanationFailure('cancelled');
    const work = vi.fn(() => new Promise<never>(() => {}));
    for (const deadline of [NaN, Infinity, Date.now()])
      await expect(
        withinAiDeadline(signal(), deadline, Date.now, cancel, work),
      ).rejects.toMatchObject({ kind: 'cancelled' });
    expect(work).not.toHaveBeenCalled();
    const stop = new AbortController();
    const pending = withinAiDeadline(stop.signal, Date.now() + 100, Date.now, cancel, work);
    const assertion = expect(pending).rejects.toMatchObject({ kind: 'cancelled' });
    stop.abort();
    await assertion;
  });
  it('keeps advice numeric and bounded and categorical telemetry payload-free through lifecycle', () => {
    expect(providerRetryAfter('0.2')).toBe(200);
    expect(providerRetryAfter('31')).toBe(31000);
    expect(providerRetryAfter('999999999999')).toBe(2_147_483_647);
    expect(providerRetryAfter(new Date(Date.now() + 10000).toUTCString())).toBeLessThanOrEqual(
      10000,
    );
    for (const value of ['-1', 'secret', 'x'.repeat(65), ''])
      expect(providerRetryAfter(value)).toBeUndefined();
    expect(new ModelExplanationFailure('transient', Infinity).retryAfterMs).toBeUndefined();
    const event = {
      policy: intentSettings.policies.retry,
      type: 'retry',
      source: 'private query',
      error: { token: 'private' },
    };
    expect(safeAiDependencyPolicyAttributes(event)).toEqual({
      'dependency.name': 'intent',
      'resilience.policy.name': intentSettings.policies.retry,
      'resilience.event.type': 'retry',
    });
    for (const value of [null, {}, { ...event, policy: 'private' }, { ...event, type: 'private' }])
      expect(safeAiDependencyPolicyAttributes(value)).toBeUndefined();
    const telemetry = new AiDependencyPolicyTelemetry();
    telemetry.onModuleInit();
    telemetry.onModuleInit();
    channel('nestjs:resilience:retry').publish(event);
    channel('nestjs:resilience:retry').publish({
      ...event,
      policy: checkpointSettings.policies.retry,
    });
    channel('nestjs:resilience:retry').publish({ ...event, policy: 'unknown' });
    telemetry.onModuleDestroy();
    telemetry.onModuleDestroy();
  });
});
