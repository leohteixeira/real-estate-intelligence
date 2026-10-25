import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApiClient, ApiReadError } from './client';

afterEach(() => vi.unstubAllGlobals());
describe('public GET transport', () => {
  it.each([503, 200])(
    'retains a valid public request UUID on status/parse failure %s',
    async (status) => {
      const requestId = 'd392f952-20fa-49b4-8cf6-4da26c8d7abc';
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(
          new Response('private payload', {
            status,
            headers: { 'x-request-id': requestId },
          }),
        ),
      );
      await expect(
        createApiClient().read('/places', new AbortController().signal, (value) => value),
      ).rejects.toMatchObject({ status: status === 200 ? 502 : status, requestId });
    },
  );
  it.each([undefined, 'private-token', 'd392f952-20fa-49b4-8cf6-4da26c8d7abc-extra'])(
    'omits absent/invalid public IDs %s',
    async (id) => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(
          new Response('private payload', {
            status: 503,
            ...(id ? { headers: { 'x-request-id': id } } : {}),
          }),
        ),
      );
      await expect(
        createApiClient().read('/places', new AbortController().signal, (value) => value),
      ).rejects.toMatchObject({
        requestId: undefined,
        message: 'The public contract could not be read.',
      });
    },
  );
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
  it('retains an abort raised while reading JSON without converting it to a parse error', async () => {
    const abort = new DOMException('Aborted body read', 'AbortError');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        headers: new Headers(),
        json: vi.fn().mockRejectedValue(abort),
      }),
    );
    await expect(
      createApiClient().read('/places', new AbortController().signal, (value) => value),
    ).rejects.toBe(abort);
  });
});

it('retains an explicit deployment prefix for versioned JSON reads', async () => {
  const request = vi.fn().mockResolvedValue(new Response('{}'));
  vi.stubGlobal('fetch', request);
  await createApiClient('/real-estate-intelligence/').read(
    '/places',
    new AbortController().signal,
    (value) => value,
  );
  expect(request.mock.calls[0]?.[0]).toBe('/real-estate-intelligence/api/v1/places');
});
