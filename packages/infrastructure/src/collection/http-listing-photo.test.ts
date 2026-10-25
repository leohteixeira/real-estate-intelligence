import nock from 'nock';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HttpListingPhoto } from './http-listing-photo.js';
import { MAX_PHOTO_BYTES } from './sharp-image-fingerprint.js';

afterEach(() => {
  expect(nock.isDone()).toBe(true);
  nock.cleanAll();
});
const signal = () => AbortSignal.timeout(2_000);
const origin = 'https://photo-fixture.invalid';
const computed = 'dhash64-v1:0123456789abcdef';

describe('single-attempt photograph acquisition', () => {
  it('passes only bounded transient bytes to the computer', async () => {
    const compute = vi.fn(async () => computed);
    const client = new HttpListingPhoto([origin], { compute });
    nock(origin)
      .get('/first')
      .reply(200, Buffer.from([1, 2, 3]), { 'content-type': 'image/png' });
    expect(await client.fingerprintPhoto('fixture', origin + '/first', signal())).toBe(computed);
    expect(compute.mock.calls[0]?.[0]).toEqual(Buffer.from([1, 2, 3]));
    await expect(
      client.fingerprintPhoto('fixture', 'https://unapproved.invalid/first', signal()),
    ).rejects.toMatchObject({ kind: 'forbidden' });
    await expect(client.fingerprintPhoto('fixture', 'not-a-url', signal())).rejects.toMatchObject({
      kind: 'forbidden',
    });
    expect(() => new HttpListingPhoto([origin + '/path'], { compute })).toThrow();
  });
  it.each([301, 403, 429, 503, 404])('does not redirect or retry status %i', async (status) => {
    nock(origin)
      .get('/refused')
      .reply(status, '', { location: origin + '/other', 'retry-after': '2' });
    const client = new HttpListingPhoto([origin], { compute: vi.fn() });
    await expect(
      client.fingerprintPhoto('fixture', origin + '/refused', signal()),
    ).rejects.toMatchObject(
      status === 403
        ? { reason: 'access-denied' }
        : status === 429 || status === 503
          ? { kind: 'transient', retryAfterMs: 2000 }
          : { kind: 'rejected' },
    );
  });
  it('rejects unsupported, oversized declared and streamed bodies before computing', async () => {
    const compute = vi.fn();
    const client = new HttpListingPhoto([origin], { compute });
    nock(origin).get('/html').reply(200, '<html/>', { 'content-type': 'text/html' });
    nock(origin)
      .get('/large')
      .reply(200, 'small', {
        'content-type': 'image/png',
        'content-length': String(MAX_PHOTO_BYTES + 1),
      });
    nock(origin)
      .get('/chunked')
      .reply(200, Buffer.alloc(MAX_PHOTO_BYTES + 1), { 'content-type': 'image/png' });
    for (const path of ['/html', '/large', '/chunked'])
      await expect(
        client.fingerprintPhoto('fixture', origin + path, signal()),
      ).rejects.toMatchObject({ kind: 'rejected' });
    expect(compute).not.toHaveBeenCalled();
    const controller = new AbortController();
    controller.abort();
    await expect(
      client.fingerprintPhoto('fixture', origin, controller.signal),
    ).rejects.toMatchObject({ kind: 'cancelled' });
  });
});
