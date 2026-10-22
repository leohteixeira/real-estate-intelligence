import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAskClient, followAsk } from './ask-client';
import { AskSession } from './ask-session';
import { completed, frames, queued, runId, wire } from './ask-fixtures.test';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
const response = (text: string) =>
  new Response(text, { headers: { 'content-type': 'text/event-stream' } });
describe('Ask authenticated JSON and finite SSE', () => {
  it('resumes once with unchanged authority and last admitted event ID, completing once', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(response(wire(0)))
      .mockResolvedValueOnce(response(wire(1) + wire(2)));
    vi.stubGlobal('fetch', fetcher);
    const session = new AskSession(queued);
    const received = vi.fn();
    await followAsk(
      createAskClient('http://localhost'),
      session,
      'fixture-capability-only',
      new AbortController().signal,
      received,
    );
    expect(fetcher).toHaveBeenCalledTimes(2);
    const options = fetcher.mock.calls[1]![1] as RequestInit;
    expect(options.headers).toEqual({
      Accept: 'text/event-stream',
      Authorization: 'Bearer fixture-capability-only',
      'Last-Event-ID': frames[0]!.id,
    });
    expect(options.redirect).toBe('error');
    expect(received).toHaveBeenCalledTimes(3);
    expect(session.run).toEqual(completed);
  });
  it('deduplicates replay, never reconnects a terminal and accepts no empty nonterminal replay', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(response(wire(0)))
      .mockResolvedValueOnce(response(wire(0) + wire(1) + wire(2)));
    vi.stubGlobal('fetch', fetcher);
    const received = vi.fn();
    await followAsk(
      createAskClient(),
      new AskSession(queued),
      'fixture-capability-only',
      new AbortController().signal,
      received,
    );
    expect(received).toHaveBeenCalledTimes(3);
    fetcher.mockClear();
    await followAsk(
      createAskClient(),
      new AskSession(completed),
      'fixture-capability-only',
      new AbortController().signal,
      received,
    );
    expect(fetcher).not.toHaveBeenCalled();
    fetcher.mockResolvedValue(response(''));
    await expect(
      followAsk(
        createAskClient(),
        new AskSession(queued),
        'fixture-capability-only',
        new AbortController().signal,
        received,
      ),
    ).rejects.toMatchObject({ status: 0 });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it.each([401, 403, 404, 503])(
    'sanitizes HTTP %s, validates request IDs and never repeats authority failures',
    async (status) => {
      const fetcher = vi.fn().mockImplementation(() =>
        Promise.resolve(
          new Response('private grant and body', {
            status,
            headers: { 'x-request-id': 'unsafe-private' },
          }),
        ),
      );
      vi.stubGlobal('fetch', fetcher);
      await expect(
        followAsk(
          createAskClient(),
          new AskSession(queued),
          'fixture-capability-only',
          new AbortController().signal,
          vi.fn(),
        ),
      ).rejects.toMatchObject({
        status,
        requestId: undefined,
        message: 'The public contract could not be read.',
      });
      expect(fetcher).toHaveBeenCalledTimes(1);
    },
  );
  it('retains evidence on malformed/foreign/gapped frames and does not retry corruption', async () => {
    const fetcher = vi.fn().mockResolvedValue(response(wire(0) + wire(2)));
    vi.stubGlobal('fetch', fetcher);
    const session = new AskSession(queued);
    await expect(
      followAsk(
        createAskClient(),
        session,
        'fixture-capability-only',
        new AbortController().signal,
        vi.fn(),
      ),
    ).rejects.toMatchObject({ status: 502 });
    expect(session.cursor).toBe(frames[0]!.id);
    expect(session.run).toEqual(queued);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('retains complete evidence before malformed bytes in the same network chunk', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        response(wire(0) + wire(1) + 'id: invalid\nevent: ask.completed\ndata: {\n\n'),
      );
    vi.stubGlobal('fetch', fetcher);
    const session = new AskSession(queued);
    await expect(
      followAsk(
        createAskClient(),
        session,
        'fixture-capability-only',
        new AbortController().signal,
        vi.fn(),
      ),
    ).rejects.toMatchObject({ status: 502 });
    expect(session.cursor).toBe(frames[1]!.id);
    expect(session.run).toEqual(frames[1]!.run);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('retains and announces the valid prefix before a fatal UTF-8 suffix without reconnecting', async () => {
    const cancel = vi.fn();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array([...new TextEncoder().encode(wire(0) + wire(1)), 255]));
      },
      cancel,
    });
    const fetcher = vi
      .fn()
      .mockResolvedValue(new Response(body, { headers: { 'content-type': 'text/event-stream' } }));
    vi.stubGlobal('fetch', fetcher);
    const session = new AskSession(queued),
      received = vi.fn();
    await expect(
      followAsk(
        createAskClient(),
        session,
        'fixture-capability-only',
        new AbortController().signal,
        received,
      ),
    ).rejects.toMatchObject({ status: 502 });
    expect(session.cursor).toBe(frames[1]!.id);
    expect(session.run).toEqual(frames[1]!.run);
    expect(received).toHaveBeenCalledTimes(2);
    expect(fetcher).toHaveBeenCalledOnce();
    expect(cancel).toHaveBeenCalledOnce();
    expect(body.locked).toBe(false);
  });
  it('rejects a lookalike stream media type without admitting evidence', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(wire(0), {
          headers: { 'content-type': 'application/text/event-stream-invalid' },
        }),
      ),
    );
    const session = new AskSession(queued);
    await expect(
      followAsk(
        createAskClient(),
        session,
        'fixture-capability-only',
        new AbortController().signal,
        vi.fn(),
      ),
    ).rejects.toMatchObject({ status: 502 });
    expect(session.cursor).toBeUndefined();
  });
  it('times out a stalled JSON body at ten seconds, aborts and releases its reader', async () => {
    vi.useFakeTimers();
    const cancel = vi.fn();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('{'));
      },
      cancel,
    });
    const fetcher = vi.fn().mockResolvedValue(new Response(body));
    vi.stubGlobal('fetch', fetcher);
    const work = createAskClient().run(
      runId,
      'fixture-capability-only',
      new AbortController().signal,
    );
    const failed = expect(work).rejects.toMatchObject({ status: 408 });
    await vi.advanceTimersByTimeAsync(10000);
    await failed;
    expect(cancel).toHaveBeenCalledOnce();
    expect(body.locked).toBe(false);
    expect((fetcher.mock.calls[0]![1] as RequestInit).signal?.aborted).toBe(true);
  });
  it('does not wait for an uncooperative underlying cancel to release a timed-out reader', async () => {
    vi.useFakeTimers();
    const body = new ReadableStream<Uint8Array>({
      cancel: () => new Promise<void>(() => undefined),
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(body)));
    const pending = createAskClient().catalogue(new AbortController().signal);
    const rejected = expect(pending).rejects.toMatchObject({ status: 408 });
    await vi.advanceTimersByTimeAsync(10000);
    await rejected;
    expect(body.locked).toBe(false);
  });
  it('does not let incomplete frames and comment trickle extend next-frame deadlines', async () => {
    vi.useFakeTimers();
    const cancel = vi.fn();
    let controller: ReadableStreamDefaultController<Uint8Array> | undefined;
    const body = new ReadableStream<Uint8Array>({
      start(value) {
        controller = value;
      },
      cancel,
    });
    const fetcher = vi
      .fn()
      .mockResolvedValue(new Response(body, { headers: { 'content-type': 'text/event-stream' } }));
    vi.stubGlobal('fetch', fetcher);
    const work = createAskClient().events(
      runId,
      'fixture-capability-only',
      undefined,
      new AbortController().signal,
      vi.fn(),
    );
    const failed = expect(work).rejects.toMatchObject({ status: 408 });
    await vi.advanceTimersByTimeAsync(4000);
    controller!.enqueue(new TextEncoder().encode(': still here\n\ndata: {'));
    await vi.advanceTimersByTimeAsync(4000);
    controller!.enqueue(new TextEncoder().encode(' '));
    await vi.advanceTimersByTimeAsync(2000);
    await failed;
    expect(cancel).toHaveBeenCalledOnce();
    expect(body.locked).toBe(false);
  });
  it('bounds stalled response headers and at most one automatic retry', async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise<Response>(() => {})),
    );
    const session = new AskSession(queued);
    const work = followAsk(
      createAskClient(),
      session,
      'fixture-capability-only',
      new AbortController().signal,
      vi.fn(),
    );
    const failed = expect(work).rejects.toMatchObject({ status: 408 });
    await vi.advanceTimersByTimeAsync(20000);
    await failed;
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });
  it('propagates cancellation identity, releases streaming work and never reconnects', async () => {
    const cancel = vi.fn();
    const body = new ReadableStream<Uint8Array>({ cancel });
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response(body, { headers: { 'content-type': 'text/event-stream' } }),
        ),
    );
    const owner = new AbortController();
    const reason = new DOMException('Superseded', 'AbortError');
    const work = followAsk(
      createAskClient(),
      new AskSession(queued),
      'fixture-capability-only',
      owner.signal,
      vi.fn(),
    );
    const failed = expect(work).rejects.toBe(reason);
    await vi.waitFor(() => expect(body.locked).toBe(true));
    owner.abort(reason);
    await failed;
    expect(cancel).toHaveBeenCalledOnce();
    expect(body.locked).toBe(false);
    expect(fetch).toHaveBeenCalledOnce();
  });
  it('parses JSON through strict public contracts, rejects invalid JSON and preserves valid request IDs', async () => {
    const requestId = '12345678-1234-4234-8234-123456789abc';
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(new Response(JSON.stringify(queued)))
        .mockResolvedValueOnce(new Response('{', { headers: { 'x-request-id': requestId } })),
    );
    const client = createAskClient();
    const signal = new AbortController().signal;
    expect(await client.run(runId, 'fixture-capability-only', signal)).toEqual(queued);
    await expect(client.run(runId, 'fixture-capability-only', signal)).rejects.toMatchObject({
      status: 502,
      requestId,
    });
  });
});
