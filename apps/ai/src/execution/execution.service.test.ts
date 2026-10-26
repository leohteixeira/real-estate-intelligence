import { describe, expect, it, vi } from 'vitest';
import { trace, TraceFlags } from '@opentelemetry/api';
import type { RoutedExplainedExecutionInput } from '@rei/domain';
import { ConsoleLogger } from '@nestjs/common';
import { GraphCheckpointFailure } from '../graph/graph-checkpoint.port';
import { compileNoOpGraph } from '../graph/no-op.graph';
import { ExecutionService } from './execution.service';
import { authorizeExecution } from './execution.authorization';
const input = {
  version: 1,
  runId: '0197e4e0-0000-7000-8000-000000000001',
  threadId: '0197e4e0-0000-7000-8000-000000000002',
  step: 'foundation',
  query: 'private',
  locale: 'en',
} as const;
describe('AI foundation execution', () => {
  it('records only closed checkpoint category/source/operation without raw input or cause', async () => {
    const log = vi.spyOn(ConsoleLogger.prototype, 'warn').mockImplementation(() => {});
    const graph = compileNoOpGraph();
    vi.spyOn(graph, 'stream').mockRejectedValueOnce(
      new GraphCheckpointFailure('rejected', 'http-status', 'put-writes'),
    );
    try {
      await expect(
        new ExecutionService(graph).execute(input, new AbortController().signal),
      ).rejects.toThrow('Execution unavailable.');
      expect(log).toHaveBeenCalledWith(
        JSON.stringify({
          event: 'ask.execution.unavailable',
          category: 'rejected',
          source: 'http-status',
          operation: 'put-writes',
        }),
      );
      expect(JSON.stringify(log.mock.calls)).not.toContain(input.query);
      expect(JSON.stringify(log.mock.calls)).not.toContain(input.runId);
    } finally {
      log.mockRestore();
    }
  });
  it.each([0, 125])(
    'emits this attempt queue interval %s independently of admission age',
    async (queueDurationMs) => {
      const combined: RoutedExplainedExecutionInput = {
        ...input,
        step: 'routed-text-explanation-v1',
        eventId: input.runId,
        executionId: input.runId,
        toolGrant: 'g'.repeat(43),
        checkpointGrant: 'c'.repeat(43),
        inputs: null,
        admittedAt: '2026-01-01T00:00:00.000Z',
        queueDurationMs,
      };
      const span = trace.wrapSpanContext({
        traceId: '1'.repeat(32),
        spanId: '2'.repeat(16),
        traceFlags: TraceFlags.SAMPLED,
      });
      const setAttribute = vi.spyOn(span, 'setAttribute');
      const active = vi.spyOn(trace, 'getActiveSpan').mockReturnValue(span);
      const log = vi.spyOn(ConsoleLogger.prototype, 'warn').mockImplementation(() => {});
      try {
        await expect(
          new ExecutionService(compileNoOpGraph()).execute(combined, new AbortController().signal),
        ).rejects.toThrow('Execution unavailable.');
        expect(setAttribute).toHaveBeenCalledWith('rei.ask.queue_duration_ms', queueDurationMs);
        expect(setAttribute).toHaveBeenCalledWith('rei.ask.total_duration_ms', expect.any(Number));
      } finally {
        active.mockRestore();
        log.mockRestore();
      }
    },
  );
  it('collects actual compiled graph updates with correlated safe evidence', async () => {
    const result = await new ExecutionService(compileNoOpGraph()).execute(
      input,
      new AbortController().signal,
    );
    expect(result).toEqual({
      version: 1,
      runId: input.runId,
      threadId: input.threadId,
      step: 'foundation',
      outcome: 'foundation-executed',
      visitedNodes: ['noOp'],
    });
    expect(JSON.stringify(result)).not.toContain('private');
  });
  it('rejects cancellation before graph invocation', async () => {
    await expect(
      new ExecutionService(compileNoOpGraph()).execute(input, AbortSignal.abort()),
    ).rejects.toThrow('Execution unavailable.');
  });
  it('sanitizes graph failure and bounds a non-cooperating graph invocation', async () => {
    const graph = compileNoOpGraph();
    vi.spyOn(graph, 'stream').mockRejectedValueOnce(new Error(input.query));
    await expect(
      new ExecutionService(graph).execute(input, new AbortController().signal),
    ).rejects.toThrow('Execution unavailable.');
    vi.spyOn(graph, 'stream').mockImplementationOnce(() => new Promise(() => {}));
    const controller = new AbortController();
    const executing = new ExecutionService(graph).execute(input, controller.signal);
    controller.abort();
    await expect(executing).rejects.toThrow('Execution unavailable.');
  });
  it('refuses missing or wrong internal authority and disables execution when absent', () => {
    const token = 'a'.repeat(48);
    expect(authorizeExecution(undefined, `Bearer ${token}`)).toBe(503);
    for (const header of [
      undefined,
      '',
      `bearer ${token}`,
      `Bearer ${'b'.repeat(48)}`,
      `Bearer ${token} `,
      [`Bearer ${token}`],
    ])
      expect(authorizeExecution(token, header)).toBe(401);
    expect(authorizeExecution(token, `Bearer ${token}`)).toBe(200);
  });
});
