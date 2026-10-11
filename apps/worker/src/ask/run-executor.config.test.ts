import { describe, expect, it, vi } from 'vitest';
import { readRunExecutorConfig, requireRunExecutorConfig } from './run-executor.config';
import { ResilientRunExecutor } from './resilient-run-executor';
import { runExecutorResilienceSettings } from './run-executor-resilience.settings';
import { ExternalFailure, type RunExecutor } from '@rei/application';
const input = {
  version: 1,
  runId: '0197e4e0-0000-7000-8000-000000000001',
  threadId: '0197e4e0-0000-7000-8000-000000000002',
  step: 'foundation',
  query: 'private',
  locale: 'en',
} as const;
describe('worker execution config and policy', () => {
  it('retains the D-044 named policy calibration', () => {
    expect(runExecutorResilienceSettings.bulkhead).toEqual({
      maxConcurrent: 3,
      maxQueue: 6,
      queueTimeoutMs: 1000,
    });
    expect(runExecutorResilienceSettings.rateLimit).toEqual({
      limit: 10,
      intervalMs: 1000,
      maxWaitMs: 0,
    });
    expect(runExecutorResilienceSettings.attemptTimeoutMs).toBe(5000);
    expect(runExecutorResilienceSettings.circuitBreaker).toEqual({
      failureRateThreshold: 50,
      minimumCalls: 20,
      windowMs: 10000,
      openDurationMs: 30000,
      halfOpenMaxCalls: 1,
      slowCallThresholdMs: 4000,
    });
  });
  it('disables optional execution while explicit invocation fails closed', () => {
    expect(readRunExecutorConfig({})).toBeUndefined();
    expect(readRunExecutorConfig({ AI_INTERNAL_TOKEN: '' })).toBeUndefined();
    expect(() => requireRunExecutorConfig({})).toThrow('RunExecutor is disabled.');
    expect(
      requireRunExecutorConfig({ AI_URL: 'http://ai:4111', AI_INTERNAL_TOKEN: 'a'.repeat(48) }),
    ).toEqual({ baseUrl: 'http://ai:4111', token: 'a'.repeat(48) });
  });
  it.each([
    { AI_URL: 'http://user:secret@ai', AI_INTERNAL_TOKEN: 'a'.repeat(48) },
    { AI_URL: 'http://ai/?private', AI_INTERNAL_TOKEN: 'a'.repeat(48) },
    { AI_URL: 'http://ai/#private', AI_INTERNAL_TOKEN: 'a'.repeat(48) },
    { AI_URL: 'http://ai/path', AI_INTERNAL_TOKEN: 'a'.repeat(48) },
    { AI_URL: 'invalid', AI_INTERNAL_TOKEN: 'a'.repeat(48) },
    { AI_INTERNAL_TOKEN: 'a'.repeat(48) },
    { AI_URL: 'http://ai', AI_INTERNAL_TOKEN: ' short ' },
    { AI_URL: 'http://ai', AI_INTERNAL_TOKEN: `${'a'.repeat(48)}\n` },
  ])('rejects configured invalid settings without reflection', (environment) => {
    expect(() => readRunExecutorConfig(environment)).toThrow('Invalid RunExecutor configuration.');
  });
  it('passes evidence and performs exactly one attempt for transient failure', async () => {
    const execute = vi
      .fn<RunExecutor['execute']>()
      .mockRejectedValue(
        new ExternalFailure({ kind: 'transient', operation: 'run-executor.execute' }),
      );
    const policy = new ResilientRunExecutor({ execute });
    await expect(
      policy.execute(input, new AbortController().signal, Date.now() + 1000),
    ).rejects.toMatchObject({ kind: 'transient' });
    expect(execute).toHaveBeenCalledTimes(1);
    execute.mockResolvedValue({
      version: 1,
      runId: input.runId,
      threadId: input.threadId,
      step: 'foundation',
      outcome: 'foundation-executed',
      visitedNodes: ['noOp'],
    });
    expect(
      (await policy.execute(input, new AbortController().signal, Date.now() + 1000)).visitedNodes,
    ).toEqual(['noOp']);
  });
  it('refuses caller abort and expired deadline before admission', async () => {
    const execute = vi.fn<RunExecutor['execute']>();
    const policy = new ResilientRunExecutor({ execute });
    await expect(
      policy.execute(input, AbortSignal.abort(), Date.now() + 1000),
    ).rejects.toMatchObject({ kind: 'cancelled' });
    await expect(
      policy.execute(input, new AbortController().signal, Date.now() - 1),
    ).rejects.toMatchObject({ kind: 'exhausted' });
    expect(execute).not.toHaveBeenCalled();
  });
  it('bounds a non-cooperating adapter and opens the breaker without manufactured evidence', async () => {
    const settings = {
      ...runExecutorResilienceSettings,
      attemptTimeoutMs: 10,
      circuitBreaker: { ...runExecutorResilienceSettings.circuitBreaker, minimumCalls: 1 },
    };
    const execute = vi.fn<RunExecutor['execute']>(() => new Promise(() => {}));
    const policy = new ResilientRunExecutor({ execute }, settings);
    await expect(
      policy.execute(input, new AbortController().signal, Date.now() + 1000),
    ).rejects.toMatchObject({ kind: 'exhausted' });
    await expect(
      policy.execute(input, new AbortController().signal, Date.now() + 1000),
    ).rejects.toMatchObject({ kind: 'exhausted' });
    expect(execute).toHaveBeenCalledTimes(1);
  });
  it('bounds the whole operation across queued admission', async () => {
    const execute = vi.fn<RunExecutor['execute']>(() => new Promise(() => {}));
    const policy = new ResilientRunExecutor(
      { execute },
      {
        ...runExecutorResilienceSettings,
        bulkhead: { maxConcurrent: 1, maxQueue: 1, queueTimeoutMs: 1000 },
      },
    );
    const first = policy.execute(input, new AbortController().signal, Date.now() + 40);
    const queued = policy.execute(input, new AbortController().signal, Date.now() + 10);
    const full = policy.execute(input, new AbortController().signal, Date.now() + 1000);
    await expect(full).rejects.toMatchObject({ kind: 'exhausted' });
    await expect(queued).rejects.toMatchObject({ kind: 'exhausted' });
    await expect(first).rejects.toMatchObject({ kind: 'exhausted' });
    expect(execute).toHaveBeenCalledTimes(1);
  });
  it('fails closed on rate rejection without starting another transport attempt', async () => {
    const execute = vi.fn<RunExecutor['execute']>().mockResolvedValue({
      version: 1,
      runId: input.runId,
      threadId: input.threadId,
      step: 'foundation',
      outcome: 'foundation-executed',
      visitedNodes: ['noOp'],
    });
    const policy = new ResilientRunExecutor(
      { execute },
      {
        ...runExecutorResilienceSettings,
        rateLimit: { limit: 1, intervalMs: 10000, maxWaitMs: 0 },
      },
    );
    await policy.execute(input, new AbortController().signal, Date.now() + 1000);
    await expect(
      policy.execute(input, new AbortController().signal, Date.now() + 1000),
    ).rejects.toMatchObject({ kind: 'exhausted' });
    expect(execute).toHaveBeenCalledOnce();
  });
});
