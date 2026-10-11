import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import type { ReductionCandidate } from '@rei/domain';
import { LargestReductionsService } from './largest-reductions.service.js';
const observed = '2026-10-01T12:00:00.000Z';
function candidate(id: string, asOf = observed): ReductionCandidate {
  return {
    propertyId: id,
    listingId: `listing-${id}`,
    asOf,
    place: { id: 'block', kind: 'street-block', name: { en: 'Block', ptBR: 'Block' } },
    priceChanges: [
      {
        type: 'price-changed',
        effectiveAt: observed,
        previousMinorUnits: 100,
        currentMinorUnits: 80,
        provenance: {
          sourceId: 'source',
          sourceListingId: id,
          sourceUrl: 'https://example.test',
          runId: 'run',
          snapshotId: 'snapshot',
          contentHash: 'sha256:hash',
          observedAt: observed,
        },
      },
    ],
  };
}
function fixture(
  rows: readonly ReductionCandidate[] = [candidate('c'), candidate('b'), candidate('a')],
) {
  const repository = { readCandidates: vi.fn(async () => rows) };
  const locations = {
    registeredScopeIds: vi.fn(async (id: string) => (id === 'unknown' ? null : ['place', 'block'])),
  };
  const clock = { now: vi.fn(() => '2026-10-11T12:00:00.000Z') };
  return {
    repository,
    locations,
    clock,
    service: new LargestReductionsService(repository, locations, clock),
  };
}
describe('persisted reduction query', () => {
  it('uses registered scope once, maximum authentic scoped date and detached metadata/facts', async () => {
    const initial = { ...candidate('initial', '2026-10-09T12:00:00.000Z'), priceChanges: [] };
    const f = fixture([candidate('a'), initial]);
    const response = (await f.service.execute('place', {}))!;
    expect(f.locations.registeredScopeIds).toHaveBeenCalledWith('place');
    expect(f.repository.readCandidates).toHaveBeenCalledExactlyOnceWith(['place', 'block']);
    expect(response.metadata).toEqual({
      dataMode: 'synthetic-stub',
      fixtureVersion: 'persisted-synthetic-reductions-v1',
      asOf: initial.asOf,
    });
    expect(f.clock.now).not.toHaveBeenCalled();
    expect(response.totalItems).toBe(1);
    Reflect.set(response.items[0]!.place.name, 'en', 'Changed');
    expect((await f.service.execute('place', {}))!.items[0]!.place.name.en).toBe('Block');
  });
  it('returns unknown as null, known empty using injected clock, and initial-only using observation date', async () => {
    const f = fixture([]);
    expect(await f.service.execute('unknown', {})).toBeNull();
    expect(f.repository.readCandidates).not.toHaveBeenCalled();
    expect(await f.service.execute('place', {})).toMatchObject({
      metadata: { asOf: f.clock.now() },
      items: [],
      totalItems: 0,
      nextCursor: null,
    });
    const initial = { ...candidate('initial'), priceChanges: [] };
    expect(await fixture([initial]).service.execute('place', {})).toMatchObject({
      metadata: { asOf: observed },
      totalItems: 0,
    });
  });
  it('pages default, 1 and 20, preserving total and terminal cursor', async () => {
    const f = fixture();
    for (const pageSize of [undefined, 20])
      expect((await f.service.execute('place', pageSize ? { pageSize } : {}))!.items).toHaveLength(
        3,
      );
    const ids = [];
    let cursor: string | null = null;
    do {
      const response = (await f.service.execute('place', {
        pageSize: 1,
        ...(cursor ? { cursor } : {}),
      }))!;
      ids.push(response.items[0]!.propertyId);
      expect(response.totalItems).toBe(3);
      cursor = response.nextCursor;
    } while (cursor);
    expect(ids).toEqual(['a', 'b', 'c']);
  });
  it('binds live cursors to endpoint, place and size and rejects vanished offsets', async () => {
    const f = fixture();
    const cursor = (await f.service.execute('place', { pageSize: 1 }))!.nextCursor!;
    for (const [place, query] of [
      ['other', { pageSize: 1, cursor }],
      ['place', { pageSize: 2, cursor }],
    ] as const)
      await expect(f.service.execute(place, query)).rejects.toThrow('Invalid read query');
    f.repository.readCandidates.mockResolvedValueOnce([candidate('a')]);
    await expect(f.service.execute('place', { pageSize: 1, cursor })).rejects.toThrow(
      'Invalid read query',
    );
    const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
    const scope = createHash('sha256')
      .update(JSON.stringify({ endpoint: 'persisted-reductions', placeId: 'place', pageSize: 1 }))
      .digest('hex');
    const wrongEndpoint = createHash('sha256')
      .update(JSON.stringify({ endpoint: 'reductions', placeId: 'place', pageSize: 1 }))
      .digest('hex');
    for (const malformed of [
      'bad',
      cursor + '=',
      cursor + '+',
      encode(null),
      encode([]),
      encode({ scope, offset: 0 }),
      encode({ scope, offset: -1 }),
      encode({ scope, offset: 3 }),
      encode({ scope, offset: 1.5 }),
      encode({ scope, offset: Number.MAX_SAFE_INTEGER + 1 }),
      encode({ scope, offset: 1, extra: true }),
      encode({ scope: wrongEndpoint, offset: 1 }),
    ])
      await expect(f.service.execute('place', { pageSize: 1, cursor: malformed })).rejects.toThrow(
        'Invalid read query',
      );
    const sizeTwoScope = createHash('sha256')
      .update(JSON.stringify({ endpoint: 'persisted-reductions', placeId: 'place', pageSize: 2 }))
      .digest('hex');
    await expect(
      f.service.execute('place', {
        pageSize: 2,
        cursor: encode({ scope: sizeTwoScope, offset: 1 }),
      }),
    ).rejects.toThrow('Invalid read query');
  });
  it('validates before I/O and propagates both read failures without fixture fallback', async () => {
    const f = fixture();
    for (const query of [
      { extra: 'secret' },
      { pageSize: 0 },
      { pageSize: 21 },
      { pageSize: 1.5 },
      { pageSize: Number.NaN },
      { cursor: '' },
      { cursor: [] },
    ])
      await expect(f.service.execute('place', query as never)).rejects.toThrow(
        'Invalid read query',
      );
    for (const id of ['BAD', '', 'a'.repeat(201)])
      await expect(f.service.execute(id, {})).rejects.toThrow('Invalid place');
    expect(f.locations.registeredScopeIds).not.toHaveBeenCalled();
    f.locations.registeredScopeIds.mockRejectedValueOnce(new Error('Locations unavailable'));
    await expect(f.service.execute('place', {})).rejects.toThrow('Locations unavailable');
    f.repository.readCandidates.mockRejectedValueOnce(new Error('Properties unavailable'));
    await expect(f.service.execute('place', {})).rejects.toThrow('Properties unavailable');
  });
});
