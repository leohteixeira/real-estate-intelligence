import { afterEach, describe, expect, it, vi } from 'vitest';
import { createPlaceClient, isPlaceId, PlaceReadError } from './place-client';
import { bela, marketFixture, metadata, pinheiros, placesFixture } from './place-fixtures.test';
import {
  neighboursFixture,
  seriesFixture,
  reductionsFixture,
  propertyFixture,
  propertyId,
} from './overview-fixtures.test';

afterEach(() => vi.unstubAllGlobals());
describe('public place reads', () => {
  it('validates all ancillary identities, unknown JSON and unchanged cancellation', async () => {
    const request = vi.fn();
    vi.stubGlobal('fetch', request);
    const client = createPlaceClient();
    const signal = new AbortController().signal;
    for (const [method, response, path] of [
      ['neighbours', neighboursFixture(), 'market/neighbours'],
      ['series', seriesFixture(), 'market/monthly-series'],
    ] as const) {
      request.mockResolvedValue(new Response(JSON.stringify(response)));
      expect(await client[method](bela.id, signal)).toEqual(response);
      expect(request).toHaveBeenLastCalledWith(`/api/v1/places/${bela.id}/${path}`, {
        signal,
        headers: { Accept: 'application/json' },
      });
      request.mockResolvedValue(new Response(JSON.stringify({ ...response, place: pinheiros })));
      await expect(client[method](bela.id, signal)).rejects.toMatchObject({ status: 502 });
      request.mockResolvedValue(new Response('{}'));
      await expect(client[method](bela.id, signal)).rejects.toMatchObject({ status: 502 });
      request.mockClear();
      await expect(client[method]('INVALID', signal)).rejects.toMatchObject({ status: 400 });
      expect(request).not.toHaveBeenCalled();
    }
    request.mockResolvedValue(new Response(JSON.stringify(reductionsFixture)));
    expect(await client.reductions(bela.id, signal)).toEqual(reductionsFixture);
    expect(request).toHaveBeenLastCalledWith(
      `/api/v1/places/${bela.id}/largest-reductions?pageSize=3`,
      { signal, headers: { Accept: 'application/json' } },
    );
    request.mockResolvedValue(new Response(JSON.stringify(propertyFixture)));
    expect(await client.property(propertyId, signal)).toEqual(propertyFixture);
    request.mockClear();
    await expect(client.property('../secret', signal)).rejects.toMatchObject({ status: 400 });
    expect(request).not.toHaveBeenCalled();
    request.mockResolvedValue(
      new Response(
        JSON.stringify({
          ...propertyFixture,
          property: {
            ...propertyFixture.property,
            summary: {
              ...propertyFixture.property.summary,
              id: '0199322b-2dc0-7000-8000-000000000003',
            },
          },
        }),
      ),
    );
    await expect(client.property(propertyId, signal)).rejects.toMatchObject({ status: 502 });
    const abort = new DOMException('Aborted', 'AbortError');
    request.mockRejectedValue(abort);
    await expect(client.series(bela.id, signal)).rejects.toBe(abort);
  });
  it('preserves public support evidence through wrappers and exact abort identity', async () => {
    const requestId = 'd392f952-20fa-49b4-8cf6-4da26c8d7abc';
    const request = vi.fn().mockResolvedValue(
      new Response('private payload', {
        status: 503,
        headers: { 'x-request-id': requestId },
      }),
    );
    vi.stubGlobal('fetch', request);
    await expect(
      createPlaceClient().place(bela.id, new AbortController().signal),
    ).rejects.toMatchObject({
      status: 503,
      requestId,
      message: 'The place contract could not be read.',
    });
    const abort = new DOMException('Aborted', 'AbortError');
    request.mockRejectedValue(abort);
    await expect(createPlaceClient().market(bela.id, new AbortController().signal)).rejects.toBe(
      abort,
    );
  });
  it.each([undefined, '', '../secret', 'Bela-Vista', 'bad_id', 'a'.repeat(201)])(
    'rejects invalid ID %s',
    (id) => {
      expect(isPlaceId(id)).toBe(false);
    },
  );
  it('validates IDs before any network request', async () => {
    const request = vi.fn();
    vi.stubGlobal('fetch', request);
    await expect(
      createPlaceClient().place('../secret', new AbortController().signal),
    ).rejects.toThrow(PlaceReadError);
    await expect(
      createPlaceClient().market('INVALID', new AbortController().signal),
    ).rejects.toThrow(PlaceReadError);
    expect(request).not.toHaveBeenCalled();
    expect(isPlaceId('sao-paulo-bela-vista')).toBe(true);
  });
  it('passes cancellation and accepts validated unknown contracts', async () => {
    const request = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ metadata, place: bela })));
    vi.stubGlobal('fetch', request);
    const signal = new AbortController().signal;
    expect(
      (await createPlaceClient('https://api.example.test/').place(bela.id, signal)).place,
    ).toEqual(bela);
    expect(request).toHaveBeenCalledWith(`https://api.example.test/api/v1/places/${bela.id}`, {
      signal,
      headers: { Accept: 'application/json' },
    });
    request.mockImplementation(
      async (input: string) => new Response(JSON.stringify(placesFixture(input))),
    );
    expect((await createPlaceClient().places(signal)).items).toEqual([bela, pinheiros]);
    request.mockReset();
    request.mockResolvedValue(new Response(JSON.stringify(marketFixture())));
    expect((await createPlaceClient().market(bela.id, signal)).basis).toBe(
      'event-fed-median-with-prepared-sections',
    );
  });
  it('rejects HTTP failures, malformed data, wrong identities and prepared medians', async () => {
    const request = vi.fn();
    vi.stubGlobal('fetch', request);
    const signal = new AbortController().signal;
    const client = createPlaceClient();
    request.mockResolvedValue(new Response('private payload', { status: 404 }));
    await expect(client.place(bela.id, signal)).rejects.toMatchObject({
      status: 404,
      message: 'The place contract could not be read.',
    });
    request.mockResolvedValue(new Response('{}'));
    await expect(client.place(bela.id, signal)).rejects.toThrow();
    request.mockResolvedValue(
      new Response(JSON.stringify({ metadata, place: { ...bela, id: 'other' } })),
    );
    await expect(client.place(bela.id, signal)).rejects.toMatchObject({ status: 502 });
    request.mockResolvedValue(
      new Response(
        JSON.stringify({
          ...marketFixture(),
          place: { id: 'other', kind: bela.kind, name: bela.name },
        }),
      ),
    );
    await expect(client.market(bela.id, signal)).rejects.toMatchObject({ status: 502 });
    request.mockResolvedValue(
      new Response(JSON.stringify({ ...marketFixture(), basis: 'prepared-market-example' })),
    );
    await expect(client.market(bela.id, signal)).rejects.toThrow();
  });
  it('discovers neighborhood navigation through the public roots and children contracts', async () => {
    const zone = {
      ...bela,
      id: 'sao-paulo-centro',
      kind: 'zone',
      parentId: 'sao-paulo',
      breadcrumbs: bela.breadcrumbs.slice(0, -1),
    };
    const request = vi.fn(
      async (input: string) =>
        new Response(
          JSON.stringify({
            metadata,
            items: input.endsWith('/children') ? [bela] : [zone],
          }),
        ),
    );
    vi.stubGlobal('fetch', request);
    const signal = new AbortController().signal;
    expect((await createPlaceClient().places(signal)).items).toEqual([bela]);
    expect(request.mock.calls.map(([input]) => input)).toEqual([
      '/api/v1/places',
      '/api/v1/places/sao-paulo-centro/children',
    ]);
    expect(request).toHaveBeenLastCalledWith('/api/v1/places/sao-paulo-centro/children', {
      signal,
      headers: { Accept: 'application/json' },
    });
  });
});
