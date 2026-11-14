import {
  ConsumeAskRunRequest,
  ExternalFailure,
  type RunDispatch,
  type RunExecutor,
} from '@rei/application';
import { AskRunRequested, askExecutionBudget, type StructuredExecutionInput } from '@rei/domain';
import { afterEach, expect, it, vi } from 'vitest';
import { ResilientRunExecutor } from './resilient-run-executor';
import { runDispatchResilienceSettings } from './run-dispatch-resilience.settings';
import { runExecutorResilienceSettings } from './run-executor-resilience.settings';

afterEach(() => vi.useRealTimers());

it('fits the AI graph deadline, one executor attempt and one completion attempt inside the claim lease', () => {
  expect(runExecutorResilienceSettings.attemptTimeoutMs).toBeGreaterThan(
    askExecutionBudget.graphDeadlineMs,
  );
  expect(runExecutorResilienceSettings.circuitBreaker.slowCallThresholdMs).toBeGreaterThanOrEqual(
    askExecutionBudget.graphDeadlineMs,
  );
  expect(
    runExecutorResilienceSettings.attemptTimeoutMs + runDispatchResilienceSettings.attemptTimeoutMs,
  ).toBeLessThanOrEqual(askExecutionBudget.claimedWorkMs);
  expect(askExecutionBudget.claimedWorkMs).toBeLessThan(askExecutionBudget.claimLeaseMs);
});

it('lets an execution run past the former five-second cap and commits it in the same claim', async () => {
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
    checkpointGrant: 'c'.repeat(43),
    inputs: { priceMinorUnits: 100, currency: 'BRL', areaSquareMeters: 2 },
  };
  const evidence = {
    ...identity,
    executionId: input.executionId,
    step: input.step,
    outcome: 'price-calculated' as const,
    visitedNodes: ['fixedDecision', 'priceTool'],
    receipt: {
      ...identity,
      executionId: input.executionId,
      operation: 'price-per-square-meter' as const,
      inputs: input.inputs,
      receiptId: input.executionId,
      provenance: 'market-domain-v1' as const,
      result: {
        kind: 'price_per_square_meter' as const,
        minorUnits: 50,
        currency: 'BRL' as const,
        areaUnit: 'm2' as const,
        inputs: input.inputs,
        computedAt: new Date(startedAt).toISOString(),
      },
    },
  };
  const claim = vi.fn<RunDispatch['claim']>().mockResolvedValue({
    disposition: 'claimed',
    identity,
    input,
    expiresAt: new Date(startedAt + askExecutionBudget.claimLeaseMs).toISOString(),
  });
  const complete = vi.fn<RunDispatch['complete']>().mockResolvedValue({} as never);
  const attempt = vi
    .fn<RunExecutor['execute']>()
    .mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve(evidence), 12_000)),
    );
  const consumer = new ConsumeAskRunRequest(
    { claim, complete },
    new ResilientRunExecutor({ execute: attempt }),
  );
  const outcome = consumer.execute(
    new AskRunRequested(identity, new Date(startedAt).toISOString()),
    new AbortController().signal,
    startedAt + 60000,
  );
  await vi.advanceTimersByTimeAsync(12_000);
  await expect(outcome).resolves.toBeUndefined();
  expect(attempt).toHaveBeenCalledOnce();
  expect(complete).toHaveBeenCalledExactlyOnceWith(
    { ...identity, executionId: input.executionId, evidence, failure: null },
    expect.any(AbortSignal),
    startedAt + askExecutionBudget.claimedWorkMs,
  );
});

it('preserves executor attempt exhaustion inside the claimed-work budget', async () => {
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
    checkpointGrant: 'c'.repeat(43),
    inputs: { priceMinorUnits: 100, currency: 'BRL', areaSquareMeters: 2 },
  };
  const claim = vi.fn<RunDispatch['claim']>().mockResolvedValue({
    disposition: 'claimed',
    identity,
    input,
    expiresAt: new Date(startedAt + askExecutionBudget.claimLeaseMs).toISOString(),
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

  const attemptTimeoutMs = runExecutorResilienceSettings.attemptTimeoutMs;
  await vi.advanceTimersByTimeAsync(attemptTimeoutMs - 1);
  expect(attempt).toHaveBeenCalledOnce();
  expect(execute).toHaveBeenCalledWith(
    input,
    stop.signal,
    startedAt + askExecutionBudget.claimedWorkMs,
  );
  expect(complete).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1);
  const failure = await outcome;
  expect(failure).toBeInstanceOf(ExternalFailure);
  expect(failure).toMatchObject({ kind: 'exhausted', operation: 'run-executor.execute' });
  expect(failure).toBe(await execute.mock.results[0]!.value.catch((error: unknown) => error));
  expect(Date.now() - startedAt).toBe(attemptTimeoutMs);
  expect(stop.signal.aborted).toBe(false);
  expect(attempt).toHaveBeenCalledOnce();
  expect(complete).not.toHaveBeenCalled();
});
