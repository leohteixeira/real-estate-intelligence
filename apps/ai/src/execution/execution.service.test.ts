import { describe, expect, it, vi } from 'vitest';
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
