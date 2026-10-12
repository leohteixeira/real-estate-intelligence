import { describe, expect, it, vi } from 'vitest';
import { parseCheckpointRequest } from '@rei/contracts';
import { HttpGraphCheckpointAdapter } from './http-graph-checkpoint.adapter';
import { ResilientGraphCheckpointAdapter } from './resilient-graph-checkpoint.adapter';
import { GraphCheckpointFailure } from './graph-checkpoint.port';

const id = '0199bd4a-1111-7111-8111-111111111111';
const request = parseCheckpointRequest({
  version: 1,
  eventId: id,
  runId: id,
  threadId: id,
  executionId: id,
  graphVersion: 'price-v1',
  namespace: '',
  operation: 'get',
  checkpointId: null,
});
const grant = 'g'.repeat(43),
  signal = () => new AbortController().signal;
const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });
describe('bounded remote checkpoint HTTP', () => {
  it.each([
    'file:///tmp/x',
    'http://user:pass@localhost',
    'http://localhost/path',
    'http://localhost/?token=x',
    'http://localhost/#x',
  ])('refuses unsafe fixed origin %s', (origin) =>
    expect(() => new HttpGraphCheckpointAdapter(origin)).toThrow(GraphCheckpointFailure),
  );
  it('makes one fixed authenticated request without authority in the body', async () => {
    const transport = vi
      .fn<typeof fetch>()
      .mockResolvedValue(json({ operation: 'get', record: null }));
    const adapter = new HttpGraphCheckpointAdapter('http://localhost:8200', transport);
    expect(await adapter.execute(request, grant, signal(), Date.now() + 1000)).toEqual({
      operation: 'get',
      record: null,
    });
    expect(transport).toHaveBeenCalledOnce();
    const [url, options] = transport.mock.calls[0]!;
    expect(url).toBe(`http://localhost:8200/api/v1/ask/runs/${id}/checkpoints`);
    expect(options?.redirect).toBe('manual');
    expect(new Headers(options?.headers).get('authorization')).toBe(`Bearer ${grant}`);
    expect(options?.body).toBe(JSON.stringify(request));
    expect(String(options?.body)).not.toContain(grant);
  });
  it.each([301, 400, 401, 403, 409, 413, 500, 503])(
    'preserves definitive versus transient status %s',
    async (status) => {
      const transport = vi.fn<typeof fetch>().mockResolvedValue(json({}, status));
      await expect(
        new HttpGraphCheckpointAdapter('http://localhost', transport).execute(
          request,
          grant,
          signal(),
          Date.now() + 1000,
        ),
      ).rejects.toMatchObject({ kind: status >= 500 ? 'transient' : 'rejected' });
      expect(transport).toHaveBeenCalledOnce();
    },
  );
  it.each([
    new Response('not json', { headers: { 'content-type': 'application/json' } }),
    new Response('{}'),
    json({ operation: 'list', records: [] }),
    json({ operation: 'get', record: null, extra: true }),
    new Response('{}', {
      headers: { 'content-type': 'application/json', 'content-length': '8388609' },
    }),
  ])('rejects malformed, mismatched and declared oversized envelopes', async (response) => {
    await expect(
      new HttpGraphCheckpointAdapter('http://localhost', async () => response).execute(
        request,
        grant,
        signal(),
        Date.now() + 1000,
      ),
    ).rejects.toMatchObject({ kind: 'rejected' });
  });
  it('rejects streaming oversize and cancels its reader', async () => {
    const cancelled = vi.fn();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(8388609));
      },
      cancel: cancelled,
    });
    await expect(
      new HttpGraphCheckpointAdapter(
        'http://localhost',
        async () => new Response(body, { headers: { 'content-type': 'application/json' } }),
      ).execute(request, grant, signal(), Date.now() + 1000),
    ).rejects.toMatchObject({ kind: 'rejected' });
    expect(cancelled).toHaveBeenCalledOnce();
  });
  it('fails closed for malformed authority, cancelled input and network failure without raw details', async () => {
    const transport = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new Error('private connection secret'));
    const adapter = new HttpGraphCheckpointAdapter('http://localhost', transport);
    await expect(
      adapter.execute(request, 'bad', signal(), Date.now() + 1000),
    ).rejects.toMatchObject({ kind: 'rejected' });
    expect(transport).not.toHaveBeenCalled();
    await expect(
      adapter.execute(request, grant, AbortSignal.abort(), Date.now() + 1000),
    ).rejects.toMatchObject({ kind: 'cancelled' });
    await expect(
      adapter.execute(request, grant, signal(), Date.now() + 1000),
    ).rejects.toMatchObject({ kind: 'transient', message: 'Checkpoint operation unavailable.' });
  });
  it('bounds an uncooperative network request and an unending response stream', async () => {
    const network = new HttpGraphCheckpointAdapter(
      'http://localhost',
      () => new Promise<Response>(() => {}),
    );
    await expect(network.execute(request, grant, signal(), Date.now() + 10)).rejects.toMatchObject({
      kind: 'cancelled',
    });
    const cancelled = vi.fn();
    const body = new ReadableStream<Uint8Array>({ cancel: cancelled });
    await expect(
      new HttpGraphCheckpointAdapter(
        'http://localhost',
        async () => new Response(body, { headers: { 'content-type': 'application/json' } }),
      ).execute(request, grant, signal(), Date.now() + 10),
    ).rejects.toMatchObject({ kind: 'cancelled' });
    expect(cancelled).toHaveBeenCalled();
  });
});
describe('one-attempt checkpoint resilience', () => {
  it('bounds concurrent admission to three calls and six queued without fallback success', async () => {
    let release: () => void = () => {},
      active = 0,
      maximum = 0;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const execute = vi.fn().mockImplementation(async () => {
      active++;
      maximum = Math.max(maximum, active);
      try {
        await gate;
        return { operation: 'get', record: null };
      } finally {
        active--;
      }
    });
    const adapter = new ResilientGraphCheckpointAdapter({ execute });
    const pending = Array.from({ length: 10 }, () =>
      adapter.execute(request, grant, signal(), Date.now() + 2000).then(
        () => true,
        (error) => (error instanceof GraphCheckpointFailure ? false : Promise.reject(error)),
      ),
    );
    await vi.waitFor(() => expect(execute).toHaveBeenCalledTimes(3));
    release();
    const outcomes = await Promise.all(pending);
    expect(outcomes.filter(Boolean)).toHaveLength(9);
    expect(maximum).toBe(3);
    expect(execute).toHaveBeenCalledTimes(9);
  });
  it('opens the breaker after its twenty-call minimum without an extra adapter attempt', async () => {
    const execute = vi.fn().mockRejectedValue(new GraphCheckpointFailure('transient'));
    const adapter = new ResilientGraphCheckpointAdapter({ execute });
    for (let call = 0; call < 21; call++)
      await expect(
        adapter.execute(request, grant, signal(), Date.now() + 1000),
      ).rejects.toMatchObject({ kind: 'transient' });
    expect(execute).toHaveBeenCalledTimes(20);
  });
  it.each(['transient', 'rejected', 'cancelled'] as const)(
    'preserves %s refusal without a retry',
    async (kind) => {
      const execute = vi.fn().mockRejectedValue(new GraphCheckpointFailure(kind));
      await expect(
        new ResilientGraphCheckpointAdapter({ execute }).execute(
          request,
          grant,
          signal(),
          Date.now() + 1000,
        ),
      ).rejects.toMatchObject({ kind });
      expect(execute).toHaveBeenCalledOnce();
    },
  );
  it('returns slow real success while counting breaker health and blocks pre-cancelled admission', async () => {
    const execute = vi.fn().mockResolvedValue({ operation: 'get', record: null });
    let now = 0;
    const adapter = new ResilientGraphCheckpointAdapter({ execute }, () => (now += 3000));
    expect(await adapter.execute(request, grant, signal(), Date.now() + 1000)).toEqual({
      operation: 'get',
      record: null,
    });
    await expect(
      adapter.execute(request, grant, AbortSignal.abort(), Date.now() + 1000),
    ).rejects.toMatchObject({ kind: 'cancelled' });
    expect(execute).toHaveBeenCalledOnce();
  });
  it('sanitizes unknown policy/adapter failure', async () => {
    await expect(
      new ResilientGraphCheckpointAdapter({
        execute: async () => {
          throw new Error('secret');
        },
      }).execute(request, grant, signal(), Date.now() + 1000),
    ).rejects.toMatchObject({ message: 'Checkpoint operation unavailable.', kind: 'transient' });
  });
});
