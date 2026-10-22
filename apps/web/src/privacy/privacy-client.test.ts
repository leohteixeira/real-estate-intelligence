import { afterEach, describe, expect, it, vi } from 'vitest';
import { SYNTHETIC_ENABLED_SOURCE } from '@rei/contracts';
import { ApiReadError } from '../api/client';
import { createPrivacyClient, privacySourcesQuery } from './privacy-client';
import { readPolicy } from '../places/place-queries';

const client = createPrivacyClient();
const response = { sources: [SYNTHETIC_ENABLED_SOURCE] };
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
describe('privacy public reads', () => {
  it('uses the existing read policy and versioned GET with admitted JSON', async () => {
    const request = vi.fn(async () => new Response(JSON.stringify(response)));
    vi.stubGlobal('fetch', request);
    await expect(client.sources(new AbortController().signal)).resolves.toEqual(response);
    expect(request).toHaveBeenCalledWith(
      expect.stringMatching(/\/api\/v1\/collection\/sources$/),
      expect.objectContaining({ headers: { Accept: 'application/json' } }),
    );
    expect(privacySourcesQuery()).toMatchObject({
      ...readPolicy,
      queryKey: ['privacy', 'enabled-sources'],
    });
  });
  it.each(['refused', 'malformed', 'invalid'] as const)(
    'sanitizes %s reads and admits only a safe reference',
    async (kind) => {
      vi.stubGlobal(
        'fetch',
        async () =>
          new Response(kind === 'invalid' ? '{"sources":[{}]}' : 'private error body', {
            status: kind === 'refused' ? 503 : 200,
            headers: { 'x-request-id': 'f0af4c4c-11a3-4fcd-9382-fdb6c1258cc3' },
          }),
      );
      await expect(client.sources(new AbortController().signal)).rejects.toMatchObject({
        status: kind === 'refused' ? 503 : 502,
        requestId: 'f0af4c4c-11a3-4fcd-9382-fdb6c1258cc3',
        message: 'The public contract could not be read.',
      });
    },
  );
  it.each(['response', 'body'] as const)(
    'bounds a stalled %s including the complete read and recovers independently',
    async (phase) => {
      vi.useFakeTimers();
      let signal: AbortSignal | null | undefined;
      const stalled = new Response('{}');
      vi.spyOn(stalled, 'json').mockImplementation(() => new Promise(() => {}));
      const request = vi.fn((_url: string, init: RequestInit) => {
        signal = init.signal;
        return phase === 'response' ? new Promise<Response>(() => {}) : Promise.resolve(stalled);
      });
      vi.stubGlobal('fetch', request);
      const controller = new AbortController();
      const remove = vi.spyOn(controller.signal, 'removeEventListener');
      const rejected = expect(client.sources(controller.signal)).rejects.toEqual(
        new ApiReadError(0),
      );
      await vi.advanceTimersByTimeAsync(9999);
      expect(signal?.aborted).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      await rejected;
      expect(signal?.aborted).toBe(true);
      expect(remove).toHaveBeenCalledWith('abort', expect.any(Function));
      expect(vi.getTimerCount()).toBe(0);
      await vi.advanceTimersByTimeAsync(30000);
      expect(request).toHaveBeenCalledTimes(1);
      request.mockImplementation(async () => new Response(JSON.stringify(response)));
      await expect(client.sources(new AbortController().signal)).resolves.toEqual(response);
      expect(request).toHaveBeenCalledTimes(2);
    },
  );
  it.each(['response', 'body'] as const)(
    'cancels a stalled %s and removes listeners and deadline',
    async (phase) => {
      vi.useFakeTimers();
      const controller = new AbortController();
      const remove = vi.spyOn(controller.signal, 'removeEventListener');
      const stalled = new Response('{}');
      vi.spyOn(stalled, 'json').mockImplementation(() => new Promise(() => {}));
      let signal: AbortSignal | null | undefined;
      vi.stubGlobal('fetch', (_url: string, init: RequestInit) => {
        signal = init.signal;
        return phase === 'body' ? Promise.resolve(stalled) : new Promise<Response>(() => {});
      });
      const pending = client.sources(controller.signal);
      const reason = new DOMException('Navigation cancelled', 'AbortError');
      const rejected = expect(pending).rejects.toBe(reason);
      controller.abort(reason);
      await rejected;
      expect(signal?.aborted).toBe(true);
      expect(remove).toHaveBeenCalledWith('abort', expect.any(Function));
      expect(vi.getTimerCount()).toBe(0);
    },
  );
  it('does not start work when cancelled and removes the deadline after success/failure', async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    controller.abort();
    const request = vi.fn(async () => new Response('{}'));
    vi.stubGlobal('fetch', request);
    await expect(client.sources(controller.signal)).rejects.toBe(controller.signal.reason);
    expect(request).not.toHaveBeenCalled();
    await expect(client.sources(new AbortController().signal)).rejects.toMatchObject({
      status: 502,
    });
    expect(vi.getTimerCount()).toBe(0);
    request.mockImplementation(async () => new Response(JSON.stringify(response)));
    await client.sources(new AbortController().signal);
    expect(vi.getTimerCount()).toBe(0);
  });
});
