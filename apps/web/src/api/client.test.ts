import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApiClient, ApiReadError } from './client';

afterEach(() => vi.unstubAllGlobals());
describe('public GET transport', () => {
  it('sanitizes a network failure into a typed status without retry', async () => {
    const request = vi.fn().mockRejectedValue(new Error('private network information'));
    vi.stubGlobal('fetch', request);
    await expect(
      createApiClient().read('/places', new AbortController().signal, (value) => value),
    ).rejects.toMatchObject({ status: 0, message: 'The public contract could not be read.' });
    expect(request).toHaveBeenCalledTimes(1);
  });
  it('passes the exact signal and unknown JSON through the parser in one attempt', async () => {
    const request = vi.fn().mockResolvedValue(new Response('{"value":7}'));
    vi.stubGlobal('fetch', request);
    const parse = vi.fn((value: unknown) => value);
    const signal = new AbortController().signal;
    expect(await createApiClient().read('/places', signal, parse)).toEqual({ value: 7 });
    expect(parse).toHaveBeenCalledWith({ value: 7 });
    expect(request).toHaveBeenCalledExactlyOnceWith('/api/v1/places', {
      signal,
      headers: { Accept: 'application/json' },
    });
  });
  it.each([
    ['private server body', 503, 503],
    ['private invalid JSON', 200, 502],
  ])('sanitizes %s without retry', async (body, status, expected) => {
    const request = vi.fn().mockResolvedValue(new Response(body, { status }));
    vi.stubGlobal('fetch', request);
    await expect(
      createApiClient().read('/places', new AbortController().signal, (value) => value),
    ).rejects.toMatchObject({
      status: expected,
      message: 'The public contract could not be read.',
    });
    expect(request).toHaveBeenCalledTimes(1);
  });
  it('sanitizes parser errors and retains cancellation identity', async () => {
    const request = vi.fn().mockResolvedValue(new Response('{}'));
    vi.stubGlobal('fetch', request);
    await expect(
      createApiClient().read('/places', new AbortController().signal, () => {
        throw new Error('private field');
      }),
    ).rejects.toBeInstanceOf(ApiReadError);
    const abort = new DOMException('Aborted', 'AbortError');
    request.mockRejectedValue(abort);
    await expect(
      createApiClient().read('/places', new AbortController().signal, (value) => value),
    ).rejects.toBe(abort);
  });
});
