import { describe, expect, it, vi } from 'vitest';
import { ExternalFailure, type RunExecutor } from '@rei/application';
import { readExecutionInput, runFoundationExecutionCommand } from './run-execution-command';
vi.mock('../otel', () => ({ shutdownTelemetry: vi.fn(async () => {}) }));
const input = {
  version: 1,
  runId: '0197e4e0-0000-7000-8000-000000000001',
  threadId: '0197e4e0-0000-7000-8000-000000000002',
  step: 'foundation',
  query: 'private question',
  locale: 'en',
} as const;
const env = { AI_URL: 'http://ai:4111', AI_INTERNAL_TOKEN: 'a'.repeat(48) };
async function* stdin(value = JSON.stringify(input)) {
  yield value;
}
describe('explicit worker foundation command', () => {
  it('reads bounded stdin and prints only parsed evidence through the production port seam', async () => {
    const output = vi.fn();
    const close = vi.fn(async () => {});
    const shutdown = vi.fn(async () => {});
    const execute = vi.fn<RunExecutor['execute']>().mockResolvedValue({
      version: 1,
      runId: input.runId,
      threadId: input.threadId,
      step: 'foundation',
      outcome: 'foundation-executed',
      visitedNodes: ['noOp'],
    });
    const create = vi.fn(async () => ({ executor: { execute }, close }));
    await runFoundationExecutionCommand(env, { input: stdin(), create, shutdown, output });
    expect(create).toHaveBeenCalledOnce();
    expect(execute).toHaveBeenCalledOnce();
    expect(output.mock.calls[0]?.[0]).not.toMatch(/private question|Bearer|query|token/);
    expect(close).toHaveBeenCalledOnce();
    expect(shutdown).toHaveBeenCalledOnce();
  });
  it.each(['bad json', 'x'.repeat(100001), '{}'])(
    'rejects invalid stdin categorically',
    async (text) => {
      await expect(readExecutionInput(stdin(text))).rejects.toMatchObject({ kind: 'rejected' });
    },
  );
  it('fails closed before context creation when execution is disabled', async () => {
    const create = vi.fn();
    const shutdown = vi.fn(async () => {});
    await expect(
      runFoundationExecutionCommand({}, { input: stdin(), create, shutdown }),
    ).rejects.toMatchObject({ kind: 'rejected' });
    expect(create).not.toHaveBeenCalled();
    expect(shutdown).toHaveBeenCalledOnce();
  });
  it('bounds stalled stdin and operation and propagates SIGTERM', async () => {
    const shutdown = vi.fn(async () => {});
    const stalled: AsyncIterable<string> = {
      [Symbol.asyncIterator]: () => ({ next: () => new Promise(() => {}) }),
    };
    await expect(
      runFoundationExecutionCommand(env, { input: stalled, shutdown, deadlineMs: 10 }),
    ).rejects.toMatchObject({ kind: 'exhausted' });
    let ready!: () => void;
    const started = new Promise<void>((resolve) => {
      ready = resolve;
    });
    const execute: RunExecutor['execute'] = async () => {
      ready();
      return new Promise(() => {});
    };
    const close = vi.fn(async () => {});
    const running = runFoundationExecutionCommand(env, {
      input: stdin(),
      shutdown,
      create: async () => ({ executor: { execute }, close }),
    });
    await started;
    process.emit('SIGTERM', 'SIGTERM');
    await expect(running).rejects.toMatchObject({ kind: 'cancelled' });
    expect(close).toHaveBeenCalledOnce();
  });
  it('retains primary plus every sanitized cleanup failure', async () => {
    const execute: RunExecutor['execute'] = async () => {
      throw new ExternalFailure({ kind: 'unauthorized', operation: 'run-executor.execute' });
    };
    const close = vi.fn(async () => {
      throw new Error(env.AI_INTERNAL_TOKEN);
    });
    const shutdown = vi.fn(async () => {
      throw new Error(input.query);
    });
    const failure = await runFoundationExecutionCommand(env, {
      input: stdin(),
      create: async () => ({ executor: { execute }, close }),
      shutdown,
    }).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(AggregateError);
    if (!(failure instanceof AggregateError)) throw new Error('Expected aggregate failure.');
    expect(failure.errors).toHaveLength(3);
    expect(failure.errors.every((error: unknown) => error instanceof ExternalFailure)).toBe(true);
    expect(JSON.stringify(failure)).not.toContain(env.AI_INTERNAL_TOKEN);
    expect(close).toHaveBeenCalledOnce();
    expect(shutdown).toHaveBeenCalledOnce();
  });
  it('bounds every stalled cleanup and removes command signal listeners', async () => {
    const beforeInt = process.listenerCount('SIGINT');
    const beforeTerm = process.listenerCount('SIGTERM');
    const execute: RunExecutor['execute'] = async () => {
      throw new ExternalFailure({ kind: 'unauthorized', operation: 'run-executor.execute' });
    };
    const close = vi.fn(() => new Promise<void>(() => {}));
    const shutdown = vi.fn(() => new Promise<void>(() => {}));
    const failure = await runFoundationExecutionCommand(env, {
      input: stdin(),
      create: async () => ({ executor: { execute }, close }),
      shutdown,
      cleanupTimeoutMs: 10,
    }).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(AggregateError);
    if (!(failure instanceof AggregateError)) throw new Error('Expected aggregate failure.');
    expect(failure.errors.map((error: ExternalFailure) => error.kind)).toEqual([
      'unauthorized',
      'exhausted',
      'exhausted',
    ]);
    expect(close).toHaveBeenCalledOnce();
    expect(shutdown).toHaveBeenCalledOnce();
    expect(process.listenerCount('SIGINT')).toBe(beforeInt);
    expect(process.listenerCount('SIGTERM')).toBe(beforeTerm);
  });
  it('retains a late-created context close rejection alongside the deadline failure', async () => {
    const execute = vi.fn<RunExecutor['execute']>();
    const output = vi.fn();
    const close = vi.fn(async () => {
      throw new Error(env.AI_INTERNAL_TOKEN);
    });
    const shutdown = vi.fn(async () => {});
    const failure = await runFoundationExecutionCommand(env, {
      input: stdin(),
      create: () =>
        new Promise((resolve) => {
          setTimeout(() => resolve({ executor: { execute }, close }), 40);
        }),
      shutdown,
      output,
      deadlineMs: 10,
      cleanupTimeoutMs: 100,
    }).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(AggregateError);
    if (!(failure instanceof AggregateError)) throw new Error('Expected aggregate failure.');
    expect(failure.errors.map((error: ExternalFailure) => error.kind)).toEqual([
      'exhausted',
      'rejected',
    ]);
    expect(failure.errors.every((error: unknown) => error instanceof ExternalFailure)).toBe(true);
    expect(JSON.stringify(failure)).not.toContain(env.AI_INTERNAL_TOKEN);
    expect(close).toHaveBeenCalledOnce();
    expect(shutdown).toHaveBeenCalledOnce();
    expect(execute).not.toHaveBeenCalled();
    expect(output).not.toHaveBeenCalled();
  });
  it('bounds finalization when context startup never cooperates', async () => {
    vi.useFakeTimers();
    const output = vi.fn();
    const shutdown = vi.fn(async () => {});
    const beforeInt = process.listenerCount('SIGINT');
    const beforeTerm = process.listenerCount('SIGTERM');
    try {
      const pending = runFoundationExecutionCommand(env, {
        input: stdin(),
        create: () => new Promise(() => {}),
        shutdown,
        output,
        deadlineMs: 10,
        cleanupTimeoutMs: 20,
      }).catch((error: unknown) => error);
      await vi.advanceTimersByTimeAsync(30);
      const failure = await pending;
      expect(failure).toBeInstanceOf(AggregateError);
      if (!(failure instanceof AggregateError)) throw new Error('Expected aggregate failure.');
      expect(failure.errors.map((error: ExternalFailure) => error.kind)).toEqual([
        'exhausted',
        'exhausted',
      ]);
      expect(shutdown).toHaveBeenCalledOnce();
      expect(output).not.toHaveBeenCalled();
      expect(process.listenerCount('SIGINT')).toBe(beforeInt);
      expect(process.listenerCount('SIGTERM')).toBe(beforeTerm);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});
