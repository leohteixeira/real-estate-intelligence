import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHeadlessAskClient, followLiveAsk } from './ask-client.js';
import { LiveAskSession } from './ask-session.js';
import {
  accepted,
  input,
  capability,
  key,
  signal,
  runId,
  threadId,
  receiptId,
  edited,
  queued,
  running,
  paused,
  confirmed,
  resumed,
  completed,
  cancelled,
  failed,
  expired,
  wire,
  stream,
} from './ask-fixtures.test.js';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
const json = (value: unknown) => new Response(JSON.stringify(value));
const confirmation = { runId, decisionReceiptId: receiptId, inputs: edited };

describe('headless live HTTP and SSE client', () => {
  it.each(['', '/real-estate-intelligence/', 'http://localhost/real-estate-intelligence'])(
    'scopes every operation under base %s with caller-owned authority/key',
    async (base) => {
      const thread = { basis: queued.basis, id: threadId, principalId: null, runs: [queued] };
      const fetcher = vi
        .fn()
        .mockResolvedValueOnce(json(accepted))
        .mockResolvedValueOnce(json(accepted))
        .mockResolvedValueOnce(json(queued))
        .mockResolvedValueOnce(json(thread))
        .mockResolvedValueOnce(json(confirmed))
        .mockResolvedValueOnce(json(cancelled))
        .mockResolvedValueOnce(stream(wire(cancelled, 1)));
      vi.stubGlobal('fetch', fetcher);
      const client = createHeadlessAskClient(base);
      expect(await client.create(input, capability, key, signal())).toEqual(accepted);
      expect(await client.create(input, capability, key, signal())).toEqual(accepted);
      expect(await client.run(runId, capability, signal())).toEqual(queued);
      expect(await client.thread(threadId, capability, signal())).toEqual(thread);
      expect(await client.confirm(confirmation, capability, signal())).toEqual(confirmed);
      expect(await client.cancel(runId, capability, signal())).toEqual(cancelled);
      await client.events(runId, capability, undefined, signal(), vi.fn());
      const prefix = `${base.replace(/\/$/, '')}/api/v1`;
      expect(fetcher.mock.calls.map((call) => call[0])).toEqual(
        [
          '/runs',
          '/runs',
          `/runs/${runId}`,
          `/threads/${threadId}`,
          `/runs/${runId}/confirm`,
          `/runs/${runId}/cancel`,
          `/runs/${runId}/events`,
        ].map((path) => prefix + path),
      );
      const options = fetcher.mock.calls.map((call) => call[1] as RequestInit);
      for (const option of options) {
        expect(option.redirect).toBe('error');
        expect(option.headers).toMatchObject({ Authorization: `Bearer ${capability}` });
      }
      expect(options[0]).toMatchObject({
        method: 'POST',
        headers: { 'Idempotency-Key': key, 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      expect(options[4]?.body).toBe(JSON.stringify(confirmation));
      expect(options[5]?.body).toBe(JSON.stringify({ reason: 'visitor_cancelled' }));
    },
  );
  it('supports routed explanation admission with the strict matching accepted version', async () => {
    const explained = { ...input, mode: 'routed-text-explanation-v1' as const };
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(json({ ...accepted, mode: explained.mode }))
        .mockResolvedValueOnce(json(accepted)),
    );
    const client = createHeadlessAskClient('');
    expect((await client.create(explained, capability, key, signal())).mode).toBe(explained.mode);
    await expect(client.create(explained, capability, key, signal())).rejects.toMatchObject({
      status: 502,
    });
  });
  it.each([401, 403, 409, 422, 429, 503])(
    'preserves sanitized refusal status %s without retrying commands',
    async (status) => {
      const fetcher = vi.fn().mockResolvedValue(
        new Response('private capability query response', {
          status,
          headers: { 'x-request-id': threadId },
        }),
      );
      vi.stubGlobal('fetch', fetcher);
      await expect(
        createHeadlessAskClient('').create(input, capability, key, signal()),
      ).rejects.toMatchObject({
        status,
        requestId: threadId,
        message: 'The public contract could not be read.',
      });
      expect(fetcher).toHaveBeenCalledOnce();
    },
  );
  it('validates inputs, authority, key, path IDs and cursor before sending a request', async () => {
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    const client = createHeadlessAskClient('');
    await expect(client.create(input, capability, '', signal())).rejects.toMatchObject({
      status: 400,
    });
    await expect(
      client.create({ ...input, query: '' }, capability, key, signal()),
    ).rejects.toMatchObject({ status: 400 });
    await expect(client.create(input, 'weak', key, signal())).rejects.toMatchObject({
      status: 401,
    });
    await expect(
      client.confirm(
        { ...confirmation, inputs: { ...edited, areaSquareMeters: 0 } },
        capability,
        signal(),
      ),
    ).rejects.toMatchObject({ status: 400 });
    expect(() => client.run('../other', capability, signal())).toThrow();
    expect(() => client.events(runId, capability, 'foreign', signal(), vi.fn())).toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('rejects wrong response identities without replacing stream truth', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(json({ ...queued, id: threadId }))
      .mockResolvedValueOnce(json({ basis: queued.basis, id: runId, principalId: null, runs: [] }))
      .mockResolvedValueOnce(json(accepted));
    vi.stubGlobal('fetch', fetcher);
    const client = createHeadlessAskClient('');
    await expect(client.run(runId, capability, signal())).rejects.toMatchObject({ status: 502 });
    await expect(client.thread(threadId, capability, signal())).rejects.toMatchObject({
      status: 502,
    });
    await expect(
      client.create({ ...input, threadId: runId }, capability, key, signal()),
    ).rejects.toMatchObject({ status: 502 });
  });
  it('resumes ordered confirmation progress once using the exact last admitted cursor', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(stream(wire(queued, 1) + wire(running, 2) + wire(paused, 3)))
      .mockResolvedValueOnce(
        stream(wire(paused, 3) + wire(confirmed, 4) + wire(resumed, 5) + wire(completed, 6)),
      );
    vi.stubGlobal('fetch', fetcher);
    const session = new LiveAskSession(accepted),
      observed = vi.fn();
    await followLiveAsk(createHeadlessAskClient(''), session, capability, signal(), observed);
    expect(observed.mock.calls.map((call) => call[0].state)).toEqual([
      'queued',
      'running',
      'awaiting_confirmation',
      'queued',
      'running',
      'completed',
    ]);
    expect((fetcher.mock.calls[1]![1] as RequestInit).headers).toMatchObject({
      'Last-Event-ID': `${runId}:v1:3`,
    });
    expect(session.run).toEqual(completed);
    await followLiveAsk(createHeadlessAskClient(''), session, capability, signal(), observed);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it.each([completed, cancelled, failed, expired])(
    'finishes only on explicit $state terminal',
    async (terminal) => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(stream(wire(terminal, 1))));
      const session = new LiveAskSession(accepted);
      await followLiveAsk(createHeadlessAskClient(''), session, capability, signal(), vi.fn());
      expect(session.terminal).toBe(true);
      expect(session.run).toEqual(terminal);
    },
  );
  it('does not manufacture completion at early EOF and bounds automatic reconnects', async () => {
    const fetcher = vi.fn().mockResolvedValue(stream(''));
    vi.stubGlobal('fetch', fetcher);
    const session = new LiveAskSession(accepted);
    await expect(
      followLiveAsk(createHeadlessAskClient(''), session, capability, signal(), vi.fn()),
    ).rejects.toMatchObject({ status: 0 });
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(session.terminal).toBe(false);
  });
  it.each([
    'data: {\n\n',
    wire(running, 2),
    wire(queued, 1).replace('event: ask.progress', 'event: ask.failed'),
    'data: ' + 'x'.repeat(65536),
    wire(queued, 1).slice(0, -1),
  ])('rejects malformed, oversized, gapped or incomplete transport', async (text) => {
    const fetcher = vi.fn().mockResolvedValue(stream(text));
    vi.stubGlobal('fetch', fetcher);
    const session = new LiveAskSession(accepted);
    await expect(
      followLiveAsk(createHeadlessAskClient(''), session, capability, signal(), vi.fn()),
    ).rejects.toMatchObject({ status: 502 });
    expect(session.cursor).toBeUndefined();
    expect(fetcher).toHaveBeenCalledOnce();
  });
  it('accepts split UTF-8 and CRLF while preserving a valid prefix before corrupt bytes', async () => {
    const bytes = new TextEncoder().encode(
      (wire(queued, 1) + wire(running, 2)).replaceAll('\n', '\r\n'),
    );
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const byte of bytes) controller.enqueue(Uint8Array.of(byte));
        controller.enqueue(Uint8Array.of(255));
        controller.close();
      },
    });
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response(body, { headers: { 'content-type': 'text/event-stream' } }),
        ),
    );
    const session = new LiveAskSession(accepted);
    await expect(
      followLiveAsk(createHeadlessAskClient(''), session, capability, signal(), vi.fn()),
    ).rejects.toMatchObject({ status: 502 });
    expect(session.run).toEqual(running);
    expect(session.cursor).toBe(`${runId}:v1:2`);
    expect(body.locked).toBe(false);
  });
  it.each(['application/json', 'application/text/event-stream-invalid'])(
    'refuses wrong media type %s',
    async (type) => {
      vi.stubGlobal(
        'fetch',
        vi
          .fn()
          .mockResolvedValue(
            new Response(wire(completed, 1), { headers: { 'content-type': type } }),
          ),
      );
      await expect(
        followLiveAsk(
          createHeadlessAskClient(''),
          new LiveAskSession(accepted),
          capability,
          signal(),
          vi.fn(),
        ),
      ).rejects.toMatchObject({ status: 502 });
    },
  );
  it('aborts transport after an observed complete frame, retains cursor and never fabricates cancellation', async () => {
    const cancel = vi.fn(),
      owner = new AbortController();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(wire(paused, 1)));
      },
      cancel,
    });
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response(body, { headers: { 'content-type': 'text/event-stream' } }),
        ),
    );
    const session = new LiveAskSession(accepted),
      reason = new DOMException('Owner disconnected', 'AbortError');
    await expect(
      followLiveAsk(createHeadlessAskClient(''), session, capability, owner.signal, () =>
        owner.abort(reason),
      ),
    ).rejects.toBe(reason);
    expect(session.run?.state).toBe('awaiting_confirmation');
    expect(session.terminal).toBe(false);
    expect(cancel).toHaveBeenCalledOnce();
    expect(body.locked).toBe(false);
    expect(fetch).toHaveBeenCalledOnce();
  });
  it('does not start a second read when complete-frame abort errors the underlying stream', async () => {
    const owner = new AbortController();
    const reason = new DOMException('Complete frame disconnect', 'AbortError');
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(wire(paused, 1)));
        owner.signal.addEventListener('abort', () => controller.error(reason), { once: true });
      },
    });
    const read = vi.spyOn(ReadableStreamDefaultReader.prototype, 'read');
    try {
      vi.stubGlobal(
        'fetch',
        vi
          .fn()
          .mockResolvedValue(
            new Response(body, { headers: { 'content-type': 'text/event-stream' } }),
          ),
      );
      const session = new LiveAskSession(accepted);
      await expect(
        followLiveAsk(createHeadlessAskClient(''), session, capability, owner.signal, () =>
          owner.abort(reason),
        ),
      ).rejects.toBe(reason);
      expect(read).toHaveBeenCalledOnce();
      expect(session.run).toEqual(paused);
      expect(session.terminal).toBe(false);
      expect(body.locked).toBe(false);
    } finally {
      read.mockRestore();
    }
  });
  it('stops buffered-frame admission when the queued callback aborts', async () => {
    const owner = new AbortController();
    const reason = new DOMException('Queued frame disconnect', 'AbortError');
    const cancel = vi.fn();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(wire(queued, 1) + wire(completed, 2)));
      },
      cancel,
    });
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response(body, { headers: { 'content-type': 'text/event-stream' } }),
        ),
    );
    const session = new LiveAskSession(accepted);
    const observed = vi.fn(() => owner.abort(reason));
    await expect(
      followLiveAsk(createHeadlessAskClient(''), session, capability, owner.signal, observed),
    ).rejects.toBe(reason);
    expect(observed.mock.calls).toHaveLength(1);
    expect(observed).toHaveBeenCalledWith(queued);
    expect(session.run).toEqual(queued);
    expect(session.cursor).toBe(`${runId}:v1:1`);
    expect(session.terminal).toBe(false);
    expect(cancel).toHaveBeenCalledOnce();
    expect(body.locked).toBe(false);
    expect(fetch).toHaveBeenCalledOnce();
  });
  it.each(['json', 'stream', 'headers'])(
    'bounds stalled %s with deadlines and releases readers',
    async (mode) => {
      vi.useFakeTimers();
      const cancel = vi.fn();
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          if (mode === 'stream')
            controller.enqueue(new TextEncoder().encode(': comment\n\ndata: {'));
        },
        cancel,
      });
      vi.stubGlobal(
        'fetch',
        mode === 'headers'
          ? vi.fn(() => new Promise<Response>(() => undefined))
          : vi
              .fn()
              .mockResolvedValue(
                new Response(body, { headers: { 'content-type': 'text/event-stream' } }),
              ),
      );
      const client = createHeadlessAskClient('');
      const work =
        mode === 'json'
          ? client.create(input, capability, key, signal())
          : client.events(runId, capability, undefined, signal(), vi.fn());
      const failed = expect(work).rejects.toMatchObject({ status: 408 });
      await vi.advanceTimersByTimeAsync(10000);
      await failed;
      if (mode !== 'headers') expect(cancel).toHaveBeenCalledOnce();
      expect(body.locked).toBe(false);
      expect(vi.getTimerCount()).toBe(0);
    },
  );
  it('preserves pre-abort identity without starting a request', async () => {
    vi.stubGlobal('fetch', vi.fn());
    const owner = new AbortController();
    const reason = new DOMException('Stopped', 'AbortError');
    owner.abort(reason);
    await expect(
      createHeadlessAskClient('').create(input, capability, key, owner.signal),
    ).rejects.toBe(reason);
    expect(fetch).not.toHaveBeenCalled();
  });
  it.each(['{', 'x'.repeat(131073), JSON.stringify({ ...queued, secret: 'unexpected' })])(
    'rejects malformed or oversized JSON safely',
    async (text) => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(text)));
      await expect(
        createHeadlessAskClient('').run(runId, capability, signal()),
      ).rejects.toMatchObject({ status: 502, message: 'The public contract could not be read.' });
    },
  );
});

it.each([
  { code: 'quota_exceeded', scope: 'global', reopensAt: '2026-10-27T00:00:00.000Z' },
  { code: 'quota_exceeded', scope: 'visitor', reopensAt: '2026-10-27T00:00:00.000Z' },
])('retains only strict quota reset evidence %j', async (quota) => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(quota, { status: 429 })));
  await expect(
    createHeadlessAskClient('').create(input, capability, key, signal()),
  ).rejects.toMatchObject({ status: 429, quota });
});
it.each([
  'private rejection',
  JSON.stringify({ code: 'quota_exceeded', scope: 'global', reopensAt: 'tomorrow' }),
  JSON.stringify({
    code: 'quota_exceeded',
    scope: 'global',
    reopensAt: '2026-10-27T00:00:00.000Z',
    private: 'secret',
  }),
])('discards malformed quota bodies without leaking them %s', async (body) => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(body, { status: 429 })));
  await expect(
    createHeadlessAskClient('').create(input, capability, key, signal()),
  ).rejects.toMatchObject({
    status: 429,
    quota: undefined,
    message: 'The public contract could not be read.',
  });
});
