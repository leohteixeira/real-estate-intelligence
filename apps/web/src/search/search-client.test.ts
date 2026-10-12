import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSearchClient } from './search-client';
import { diagnoseEmpty } from './search-diagnostics';
import { metadata, bela, placesFixture } from '../places/place-fixtures.test';

afterEach(() => vi.unstubAllGlobals());
describe('validated Search reads', () => {
  it('passes all effective inputs and AbortSignal; rejects malformed payloads', async () => {
    const fetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            metadata,
            items: [],
            totalItems: 0,
            nextCursor: null,
            medianPricePerSquareMeter: null,
            placeCounts: [],
          }),
        ),
    );
    vi.stubGlobal('fetch', fetch);
    const signal = new AbortController().signal;
    await createSearchClient('').search(
      { placeId: bela.id, priceReduced: false, minArea: 82.5 },
      signal,
    );
    expect(fetch.mock.calls[0]).toEqual([
      '/api/v1/properties?minArea=82.5&placeId=sao-paulo-bela-vista&priceReduced=false',
      { signal, headers: { Accept: 'application/json' } },
    ]);
    fetch.mockImplementation(async () => new Response('{}'));
    await expect(createSearchClient('').search({ placeId: bela.id }, signal)).rejects.toMatchObject(
      { status: 502 },
    );
  });
  it('walks the actual finite hierarchy including blocks and rejects cross-parent children', async () => {
    const fetch = vi.fn(
      async (input: string) =>
        new Response(JSON.stringify(placesFixture(input) ?? { metadata, items: [] })),
    );
    vi.stubGlobal('fetch', fetch);
    const client = createSearchClient('');
    expect(
      (await client.hierarchy(new AbortController().signal)).items.some(
        (item) => item.id === bela.id,
      ),
    ).toBe(true);
    fetch.mockImplementation(async () => new Response(JSON.stringify({ metadata, items: [bela] })));
    await expect(client.children('elsewhere', new AbortController().signal)).rejects.toMatchObject({
      status: 502,
    });
  });
  it('rejects invalid ids and inputs before network and preserves cancellation', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    await expect(
      createSearchClient('').children('BAD', new AbortController().signal),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      createSearchClient('').search(
        { placeId: bela.id, minArea: -1 },
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({ status: 400 });
    expect(fetch).not.toHaveBeenCalled();
    const controller = new AbortController();
    controller.abort();
    fetch.mockRejectedValue(new DOMException('Aborted', 'AbortError'));
    await expect(
      createSearchClient('').search({ placeId: bela.id }, controller.signal),
    ).rejects.toMatchObject({ name: 'AbortError' });
  });
});
describe('server count attribution', () => {
  it('stops at first positive-to-zero UX group and retains actual excluded count', async () => {
    const read = vi.fn(async (query) => ({
      totalItems: query.returnedToMarket ? 0 : query.priceReduced ? 3 : 5,
    }));
    expect(
      await diagnoseEmpty(
        { placeId: bela.id, priceReduced: true, returnedToMarket: true, multipleListings: true },
        read,
      ),
    ).toEqual({ kind: 'filter', group: 'returned', excluded: 3 });
    expect(read).toHaveBeenCalledTimes(3);
    expect(read.mock.calls[1]![0]).toEqual({ placeId: bela.id, priceReduced: true });
  });
  it('keeps existing-zero places neutral and propagates a failed diagnostic', async () => {
    expect(
      await diagnoseEmpty({ placeId: bela.id, priceReduced: true }, async () => ({
        totalItems: 0,
      })),
    ).toEqual({ kind: 'neutral' });
    await expect(
      diagnoseEmpty({ placeId: bela.id }, async () => {
        throw new Error('failed');
      }),
    ).rejects.toThrow('failed');
    expect(
      await diagnoseEmpty({ placeId: bela.id, priceReduced: false }, async () => ({
        totalItems: 5,
      })),
    ).toEqual({ kind: 'neutral' });
  });
});
