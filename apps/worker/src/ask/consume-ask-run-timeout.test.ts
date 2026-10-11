import {
  ConsumeAskRunRequest,
  ExternalFailure,
  type RunDispatch,
  type RunExecutor,
} from '@rei/application';
import { AskRunRequested, type StructuredExecutionInput } from '@rei/domain';
import { afterEach, expect, it, vi } from 'vitest';
import { ResilientRunExecutor } from './resilient-run-executor';
import { runExecutorResilienceSettings } from './run-executor-resilience.settings';

afterEach(() => vi.useRealTimers());

it('preserves actual five-second executor exhaustion inside the ten-second consumer budget', async () => {
  vi.useFakeTimers();
  const startedAt = Date.now();
  const identity = {
    version: 1 as const,
    eventId: '0199c8f2-2394-7ba0-8f9e-286378779212',
    runId: '0199c8f2-2394-7ba0-8f9e-286378779210',
    threadId: '0199c8f2-2394-7ba0-8f9e-286378779211',
  };
  const input: StructuredExecutionInput = {
    ...identity,
    executionId: '0199c8f2-2394-7ba0-8f9e-286378779213',
    step: 'structured-price-v1',
    query: 'Calculate.',
    locale: 'en',
    toolGrant: 'g'.repeat(43),
    inputs: { priceMinorUnits: 100, currency: 'BRL', areaSquareMeters: 2 },
  };
  const claim = vi.fn<RunDispatch['claim']>().mockResolvedValue({
    disposition: 'claimed',
    identity,
    input,
    expiresAt: new Date(startedAt + 30000).toISOString(),
  });
  const complete = vi.fn<RunDispatch['complete']>();
  const attempt = vi.fn<RunExecutor['execute']>().mockImplementation(() => new Promise(() => {}));
  const executor = new ResilientRunExecutor({ execute: attempt });
  const execute = vi.spyOn(executor, 'execute');
  const consumer = new ConsumeAskRunRequest({ claim, complete }, executor);
  const stop = new AbortController();
  const outcome = consumer
    .execute(
      new AskRunRequested(identity, new Date(startedAt).toISOString()),
      stop.signal,
      startedAt + 60000,
    )
    .catch((error: unknown) => error);

  expect(runExecutorResilienceSettings.attemptTimeoutMs).toBe(5000);
  await vi.advanceTimersByTimeAsync(4999);
  expect(attempt).toHaveBeenCalledOnce();
  expect(execute).toHaveBeenCalledWith(input, stop.signal, startedAt + 10000);
  expect(complete).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1);
  const failure = await outcome;
  expect(failure).toBeInstanceOf(ExternalFailure);
  expect(failure).toMatchObject({ kind: 'exhausted', operation: 'run-executor.execute' });
  expect(failure).toBe(await execute.mock.results[0]!.value.catch((error: unknown) => error));
  expect(Date.now() - startedAt).toBe(5000);
  expect(stop.signal.aborted).toBe(false);
  expect(attempt).toHaveBeenCalledOnce();
  expect(complete).not.toHaveBeenCalled();
});
