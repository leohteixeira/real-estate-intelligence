import { afterEach, describe, expect, it, vi } from 'vitest';
import { propertyDetailFixture } from '../properties/property-fixtures.test';
import { createReadCache, listingPropertyQuery, propertyQuery } from './place-queries';
import { PlaceReadError } from './place-client';

const cache = createReadCache();
afterEach(() => {
  cache.clear();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function read(signal: AbortSignal) {
  const query = listingPropertyQuery(propertyDetailFixture().property.summary.id);
  return query.queryFn!({ client: cache, queryKey: query.queryKey, signal, meta: undefined });
}

describe('Listing-specific bounded Property context', () => {
  it('shares the key, function and no-retry policy without changing general Property reads', () => {
    const id = propertyDetailFixture().property.summary.id;
    const first = listingPropertyQuery(id),
      second = listingPropertyQuery(id);
    expect(first.queryKey).toEqual(['listing-property-context', id]);
    expect(first.queryKey).toEqual(second.queryKey);
    expect(first.queryFn).toBe(second.queryFn);
    expect(first.retry).toBe(false);
    expect(first.staleTime).toBe(30_000);
    expect(first.refetchOnWindowFocus).toBe(false);
    expect(first.refetchOnReconnect).toBe(false);
    expect(propertyQuery(id).queryKey).toEqual(['property', id]);
  });

  it.each(['response', 'body'] as const)(
    'bounds a stalled %s to ten seconds, aborts and cleans up before independent recovery',
    async (phase) => {
      vi.useFakeTimers();
      const controller = new AbortController();
      const remove = vi.spyOn(controller.signal, 'removeEventListener');
      const response = new Response('{}');
      const body = vi.spyOn(response, 'json').mockImplementation(() => new Promise(() => {}));
      let receivedSignal: AbortSignal | undefined;
      const request = vi.fn((_url: string, init: RequestInit) => {
        receivedSignal = init.signal ?? undefined;
        return phase === 'response' ? new Promise<Response>(() => {}) : Promise.resolve(response);
      });
      vi.stubGlobal('fetch', request);
      const pending = read(controller.signal);
      const rejected = expect(pending).rejects.toMatchObject({ status: 0, requestId: undefined });
      await vi.advanceTimersByTimeAsync(9_999);
      expect(receivedSignal?.aborted).toBe(false);
      expect(request).toHaveBeenCalledTimes(1);
      if (phase === 'body') expect(body).toHaveBeenCalledOnce();
      await vi.advanceTimersByTimeAsync(1);
      await rejected;
      expect(receivedSignal?.aborted).toBe(true);
      expect(remove).toHaveBeenCalledWith('abort', expect.any(Function));
      expect(vi.getTimerCount()).toBe(0);
      await vi.advanceTimersByTimeAsync(30_000);
      expect(request).toHaveBeenCalledTimes(1);
      const expected = propertyDetailFixture();
      request.mockImplementation(async () => new Response(JSON.stringify(expected)));
      await expect(read(new AbortController().signal)).resolves.toEqual(expected);
      expect(request).toHaveBeenCalledTimes(2);
      expect(vi.getTimerCount()).toBe(0);
    },
  );

  it('clears its deadline and listener on success without aborting the completed request', async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const remove = vi.spyOn(controller.signal, 'removeEventListener');
    let receivedSignal: AbortSignal | undefined;
    vi.stubGlobal('fetch', (_url: string, init: RequestInit) => {
      receivedSignal = init.signal ?? undefined;
      return Promise.resolve(new Response(JSON.stringify(propertyDetailFixture())));
    });
    await expect(read(controller.signal)).resolves.toEqual(propertyDetailFixture());
    expect(remove).toHaveBeenCalledWith('abort', expect.any(Function));
    expect(vi.getTimerCount()).toBe(0);
    controller.abort();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(receivedSignal?.aborted).toBe(false);
  });

  it('clears its deadline and listener on a public read failure', async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const remove = vi.spyOn(controller.signal, 'removeEventListener');
    vi.stubGlobal('fetch', async () => new Response('private context payload', { status: 503 }));
    await expect(read(controller.signal)).rejects.toEqual(new PlaceReadError(503));
    expect(remove).toHaveBeenCalledWith('abort', expect.any(Function));
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(['response', 'body'] as const)(
    'preserves navigation cancellation during a stalled %s and removes its deadline/listener',
    async (phase) => {
      vi.useFakeTimers();
      const controller = new AbortController();
      const remove = vi.spyOn(controller.signal, 'removeEventListener');
      const response = new Response('{}');
      vi.spyOn(response, 'json').mockImplementation(() => new Promise(() => {}));
      let receivedSignal: AbortSignal | undefined;
      vi.stubGlobal('fetch', (_url: string, init: RequestInit) => {
        receivedSignal = init.signal ?? undefined;
        return phase === 'body' ? Promise.resolve(response) : new Promise<Response>(() => {});
      });
      const pending = read(controller.signal);
      const cancellation = new DOMException('Navigation cancelled', 'AbortError');
      const rejected = expect(pending).rejects.toBe(cancellation);
      await vi.advanceTimersByTimeAsync(100);
      controller.abort(cancellation);
      await rejected;
      expect(receivedSignal?.aborted).toBe(true);
      expect(receivedSignal?.reason).toBe(cancellation);
      expect(remove).toHaveBeenCalledWith('abort', expect.any(Function));
      expect(vi.getTimerCount()).toBe(0);
    },
  );

  it('does not fetch or install a deadline for an already cancelled navigation', async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    controller.abort();
    const request = vi.fn();
    vi.stubGlobal('fetch', request);
    await expect(read(controller.signal)).rejects.toBe(controller.signal.reason);
    expect(request).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
});
