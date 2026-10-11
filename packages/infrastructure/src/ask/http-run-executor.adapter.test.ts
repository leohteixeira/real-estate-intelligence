import { describe, expect, it, vi } from 'vitest';
import type { RunExecutionInput } from '@rei/domain';
import { HttpRunExecutor } from './http-run-executor.adapter.js';
import { InMemoryRunExecutor } from './in-memory-run-executor.adapter.js';

const input: RunExecutionInput = {
  version: 1,
  runId: '0197e4e0-0000-7000-8000-000000000001',
  threadId: '0197e4e0-0000-7000-8000-000000000002',
  step: 'foundation',
  query: 'synthetic-private-query',
  locale: 'en',
};
const evidence = {
  version: 1,
  runId: input.runId,
  threadId: input.threadId,
  step: 'foundation',
  outcome: 'foundation-executed',
  visitedNodes: ['noOp'],
};
const options = { baseUrl: 'http://ai.test', token: 'a'.repeat(48) };
const invoke = (
  adapter: HttpRunExecutor | InMemoryRunExecutor,
  signal = new AbortController().signal,
  deadline = Date.now() + 1000,
) => adapter.execute(input, signal, deadline);
describe('single attempt foundation adapters', () => {
  it('posts once to the fixed path and accepts correlated evidence', async () => {
    const transport = vi.fn<typeof fetch>().mockResolvedValue(Response.json(evidence));
    const result = await invoke(new HttpRunExecutor(options, transport));
    expect(result).toEqual(evidence);
    expect(transport).toHaveBeenCalledTimes(1);
    expect(transport.mock.calls[0]).toEqual([
      'http://ai.test/internal/v1/runs/execute',
      expect.objectContaining({
        method: 'POST',
        redirect: 'manual',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${options.token}` },
      }),
    ]);
  });
  it.each([
    [400, 'rejected'],
    [401, 'unauthorized'],
    [403, 'forbidden'],
    [429, 'transient'],
    [500, 'transient'],
    [302, 'rejected'],
  ])('maps HTTP %s without retry or reflection', async (status, kind) => {
    const transport = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response('secret error', { status: Number(status) }));
    const failure = invoke(new HttpRunExecutor(options, transport));
    await expect(failure).rejects.toMatchObject({ kind, operation: 'run-executor.execute' });
    await expect(failure).rejects.not.toHaveProperty('cause');
    expect(transport).toHaveBeenCalledTimes(1);
  });
  it.each([
    Response.json({ ...evidence, runId: input.threadId }),
    Response.json({ ...evidence, threadId: input.runId }),
    Response.json({ ...evidence, query: input.query }),
    new Response('bad json', { headers: { 'content-type': 'application/json' } }),
    new Response(JSON.stringify(evidence)),
    new Response('x'.repeat(17000), { headers: { 'content-type': 'application/json' } }),
  ])('rejects malformed, mismatched or oversized response', async (response) => {
    const transport = vi.fn<typeof fetch>().mockResolvedValue(response);
    await expect(invoke(new HttpRunExecutor(options, transport))).rejects.toMatchObject({
      kind: 'rejected',
    });
    expect(transport).toHaveBeenCalledTimes(1);
  });
  it('sanitizes network errors', async () => {
    const failure = invoke(
      new HttpRunExecutor(options, vi.fn().mockRejectedValue(new Error(options.token))),
    );
    await expect(failure).rejects.toMatchObject({ kind: 'transient' });
    await expect(failure).rejects.not.toHaveProperty('cause');
  });
  it('rejects token control characters without reflection', () => {
    expect(() => new HttpRunExecutor({ ...options, token: `${options.token}\n` })).toThrow(
      'Invalid RunExecutor configuration.',
    );
  });
  it('correlates evidence with the submitted request even when the caller mutates its input', async () => {
    const caller = { ...input };
    let respond!: (response: Response) => void;
    const transport = vi.fn<typeof fetch>(
      () =>
        new Promise((resolve) => {
          respond = resolve;
        }),
    );
    const pending = new HttpRunExecutor(options, transport).execute(
      caller,
      new AbortController().signal,
      Date.now() + 1000,
    );
    caller.runId = input.threadId;
    caller.query = 'caller mutation';
    respond(Response.json(evidence));
    await expect(pending).resolves.toEqual(evidence);
    expect(transport.mock.calls[0]?.[1]?.body).toBe(JSON.stringify(input));
  });
  it('does not call transport for abort, expiry or invalid input', async () => {
    const transport = vi.fn<typeof fetch>();
    const adapter = new HttpRunExecutor(options, transport);
    await expect(invoke(adapter, AbortSignal.abort())).rejects.toMatchObject({ kind: 'cancelled' });
    await expect(invoke(adapter, undefined, Date.now() - 1)).rejects.toMatchObject({
      kind: 'transient',
    });
    await expect(
      adapter.execute({ ...input, query: '' }, new AbortController().signal, Date.now() + 1000),
    ).rejects.toMatchObject({ kind: 'rejected' });
    expect(transport).not.toHaveBeenCalled();
  });
  it('bounds a transport and a body that ignore abort', async () => {
    const never = vi.fn<typeof fetch>(() => new Promise(() => {}));
    await expect(
      invoke(new HttpRunExecutor(options, never), undefined, Date.now() + 15),
    ).rejects.toMatchObject({ kind: 'transient' });
    const stream = new ReadableStream<Uint8Array>({ start() {} });
    const body = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(stream, { headers: { 'content-type': 'application/json' } }));
    await expect(
      invoke(new HttpRunExecutor(options, body), undefined, Date.now() + 15),
    ).rejects.toMatchObject({ kind: 'transient' });
  });
  it.each([
    'http://user:password@ai.test',
    'http://ai.test/query?secret',
    'http://ai.test/#token',
    'ftp://ai.test',
    'invalid',
  ])('rejects unsafe destination %s', (baseUrl) => {
    expect(() => new HttpRunExecutor({ ...options, baseUrl })).toThrow(
      'Invalid RunExecutor configuration.',
    );
  });
  it('fake captures isolated input, returns isolated evidence and uses closed failures', async () => {
    const fake = new InMemoryRunExecutor();
    const result = await invoke(fake);
    Reflect.set(input, 'query', 'caller mutation');
    Reflect.set(result.visitedNodes, '0', 'mutation');
    expect(fake.inputs[0]?.query).toBe('synthetic-private-query');
    Reflect.set(fake.inputs[0]!, 'query', 'reader mutation');
    expect(fake.inputs[0]?.query).toBe('synthetic-private-query');
    expect((await invoke(fake)).visitedNodes).toEqual(['noOp']);
    await expect(invoke(new InMemoryRunExecutor('unauthorized'))).rejects.toMatchObject({
      kind: 'unauthorized',
    });
    await expect(invoke(fake, AbortSignal.abort())).rejects.toMatchObject({ kind: 'cancelled' });
    await expect(invoke(fake, undefined, Date.now() - 1)).rejects.toMatchObject({
      kind: 'transient',
    });
    Reflect.set(input, 'query', 'synthetic-private-query');
  });
});
