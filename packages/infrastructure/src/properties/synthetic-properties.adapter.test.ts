import { describe, expect, it } from 'vitest';
import { PROPERTY_SORTS, type SearchQuery } from '@rei/domain';
import { SyntheticPropertiesAdapter, validateReadQuery } from './synthetic-properties.adapter.js';
import { supplementaryPlaces } from '../locations/index.js';
import {
  SUPPLEMENTARY_LISTING_IDS,
  SUPPLEMENTARY_PROPERTY_IDS,
  featureAgreement,
  syntheticReadId,
} from './synthetic-properties.projection.js';

describe('synthetic properties read facade', () => {
  const adapter = new SyntheticPropertiesAdapter();
  it('recognizes supplementary geography without assigning prepared properties or weakening cursor validation', async () => {
    for (const block of supplementaryPlaces()) {
      const reductions = await adapter.largestReductions(block.id, {});
      expect(reductions!.items).toEqual([]);
      expect(reductions!.totalItems).toBe(0);
      expect((await adapter.search({ placeId: block.id })).items).toEqual([]);
      await expect(adapter.largestReductions(block.id, { cursor: 'bad' })).rejects.toThrow();
    }
    expect((await adapter.search({})).placeCounts).toHaveLength(18);
  });
  it('projects authoritative stable identities, lowest active asking price and provenance', async () => {
    const page = await adapter.search({});
    expect(page.totalItems).toBe(5);
    expect(page.metadata.asOf).toBe('2026-10-01T12:00:00.000Z');
    expect(page.medianPricePerSquareMeter).toBe(951220);
    expect(page.placeCounts.find((place) => place.placeId === 'sao-paulo')!.totalItems).toBe(5);
    const property = (await adapter.getProperty(syntheticReadId(1)))!.property;
    expect(property.summary.askingPrice?.minorUnits).toBe(78000000);
    expect(property.summary.askingPrice?.provenance.sourceListingId).toBe('AUR-BV-001');
    expect(property.sale.status).toBe('not-recorded');
    expect(property.listings).toHaveLength(3);
    expect(
      property.priceChanges.map((change) => [change.previousMinorUnits, change.currentMinorUnits]),
    ).toEqual([
      [82000000, 80000000],
      [80000000, 78000000],
    ]);
    expect(
      property.sourceAgreement.find((agreement) => agreement.field === 'neighborhood')!.agrees,
    ).toBe(false);
    expect(property.preparedEvidence.productionMatchScore).toBeNull();
    expect(property.preparedEvidence.illustrativeProbability).toBe(0.95);
    expect(property.preparedEvidence.probabilityBasis).toBe('prepared-not-calibrated');
    expect(property.sourceAgreement.find((entry) => entry.field === 'propertyType')!.agrees).toBe(
      true,
    );
    expect(
      property.preparedEvidence.reasons.some(
        (entry) => entry.type === 'published-neighborhood-disagreement',
      ),
    ).toBe(true);
    expect(property.priceChanges[0]!.changePercent).toBeCloseTo((-2000000 / 82000000) * 100);
    expect(property.priceChanges[1]!.changePercent).toBe(-2.5);
    expect(property.summary.place.kind).toBe('street-block');
    expect(property.summary.breadcrumbs).toHaveLength(6);
  });
  it('counts feature reporters and memberships without treating missing reports as absence', async () => {
    const property = (await adapter.getProperty(syntheticReadId(1)))!.property;
    const listings = property.listings.map((listing, index) => ({
      ...listing,
      features: index === 0 ? ['balcony'] : [],
    }));
    expect(featureAgreement(listings)).toEqual([
      {
        feature: 'balcony',
        reportingCount: 1,
        reportingPercent: (1 / 3) * 100,
        listingIds: [listings[0]!.id],
        sourceIds: [listings[0]!.source.sourceId],
      },
    ]);
    expect(featureAgreement([])).toEqual([]);
    expect(
      property.featureAgreement.every(
        (entry) => entry.reportingCount === 3 && entry.reportingPercent === 100,
      ),
    ).toBe(true);
    expect(JSON.stringify(featureAgreement(listings))).not.toMatch(/absent|false|disagrees/);
  });
  it.each<[SearchQuery, number]>([
    [{ propertyType: 'house' }, 1],
    [{ placeId: 'sao-paulo-centro' }, 1],
    [{ placeId: 'sao-paulo-bela-vista' }, 1],
    [{ minAskingPrice: 78000000, maxAskingPrice: 78000000 }, 1],
    [{ minPricePerSquareMeter: 951220, maxPricePerSquareMeter: 951220 }, 1],
    [{ minArea: 82, maxArea: 82 }, 2],
    [{ minBedrooms: 3 }, 3],
    [{ minBathrooms: 3 }, 1],
    [{ minParkingSpaces: 2 }, 2],
    [{ priceReduced: true }, 3],
    [{ priceReduced: false }, 2],
    [{ returnedToMarket: true }, 1],
    [{ returnedToMarket: false }, 4],
    [{ multipleListings: true }, 3],
    [{ multipleListings: false }, 2],
    [{ timeOnMarket: 'up-to-30' }, 0],
    [{ timeOnMarket: '31-to-90' }, 0],
    [{ timeOnMarket: 'over-90' }, 5],
    [{ timeOnMarket: 'over-180' }, 5],
    [{ returnedToMarket: true, multipleListings: true, priceReduced: false }, 1],
    [{ returnedToMarket: true, priceReduced: true }, 0],
    [{ minArea: 999999 }, 0],
  ])('applies inclusive filters %j', async (query, count) => {
    const page = await adapter.search(query);
    expect(page.totalItems).toBe(count);
    expect(page.items).toHaveLength(count);
    if (count === 0) expect(page.medianPricePerSquareMeter).toBeNull();
  });
  it.each(PROPERTY_SORTS)(
    'pages %s deterministically without omissions and uses whole matching median',
    async (sort) => {
      const expected = await adapter.search({ sort });
      const collected = [];
      let cursor: string | undefined;
      do {
        const result = await adapter.search({ sort, pageSize: 1, ...(cursor ? { cursor } : {}) });
        expect(result.totalItems).toBe(5);
        expect(result.medianPricePerSquareMeter).toBe(expected.medianPricePerSquareMeter);
        expect(result.items[0]!.belowMedianPercent).toBe(
          expected.items.find((item) => item.id === result.items[0]!.id)!.belowMedianPercent,
        );
        collected.push(...result.items.map((item) => item.id));
        cursor = result.nextCursor ?? undefined;
      } while (cursor);
      expect(collected).toEqual(expected.items.map((item) => item.id));
      expect(new Set(collected).size).toBe(5);
      if (sort === 'most-recent') expect(collected).toEqual([1, 2, 3, 4, 5].map(syntheticReadId));
      if (sort === 'longest-on-market') expect(collected[0]).toBe(syntheticReadId(4));
    },
  );
  it('binds cursors to endpoint, normalized scope, filters, size and sort', async () => {
    const page = await adapter.search({ pageSize: 1 });
    const cursor = page.nextCursor!;
    await expect(
      adapter.search({ pageSize: 1, cursor, placeId: 'sao-paulo', sort: 'furthest-below-median' }),
    ).resolves.toBeDefined();
    for (const query of [
      { pageSize: 1, cursor, placeId: 'sao-paulo-centro' },
      { pageSize: 1, cursor, sort: 'most-recent' },
      { pageSize: 2, cursor },
      { pageSize: 1, cursor, minBedrooms: 3 },
      { cursor: 'garbage' },
      { cursor: '%%%%' },
      { cursor: Buffer.from('null').toString('base64url') },
      { cursor: Buffer.from('{}').toString('base64url') },
    ])
      await expect(adapter.search(query as SearchQuery)).rejects.toThrow();
    await expect(adapter.largestReductions('sao-paulo', { pageSize: 1, cursor })).rejects.toThrow();
  });
  it('preserves description dates, hash-only generic history and monthly lifeline gap', async () => {
    const bv = (await adapter.getProperty(syntheticReadId(1)))!.property;
    const brisa = bv.listings.find((listing) => listing.source.sourceListingId === 'BRI-BV-001')!;
    expect(brisa.description.permission).toBe('allowed');
    if (brisa.description.permission === 'allowed') {
      expect(brisa.description.versions).toHaveLength(2);
      expect(brisa.description.versions[1]!.effectiveAt).toBe('2026-03-01T12:00:00.000Z');
      expect(brisa.description.versions[0]!.text).toContain('balcony');
    }
    expect(JSON.stringify(brisa.history)).not.toContain('quiet bedrooms');
    const vm = (await adapter.getProperty(syntheticReadId(4)))!.property;
    const cobalto = vm.listings.find((listing) => listing.source.sourceListingId === 'COB-VM-001')!;
    expect(cobalto.collectionCount).toBe(11);
    expect(cobalto.lifeline).toEqual([
      { from: '2025-10-01T12:00:00.000Z', to: '2026-04-01T12:00:00.000Z' },
      { from: '2026-06-01T12:00:00.000Z', to: null },
    ]);
    expect(cobalto.history.map((item) => item.type)).toEqual([
      'created',
      'removed',
      'reappeared',
      'description-changed',
    ]);
  });
  it('fails closed on denied text and preserves expired hash/run provenance without retrieval', async () => {
    const denied = (await adapter.getListing(SUPPLEMENTARY_LISTING_IDS.deniedText))!;
    expect(denied.listing.description).toEqual({
      permission: 'denied',
      changedAt: ['2026-03-01T12:00:00.000Z'],
      sourceUrl: denied.listing.source.url,
    });
    expect(
      JSON.stringify(await adapter.getProperty(SUPPLEMENTARY_PROPERTY_IDS.deniedText)),
    ).not.toMatch(/quiet bedrooms|renovated living room|"text"|"current"|"versions"/);
    const expired = (await adapter.getListing(SUPPLEMENTARY_LISTING_IDS.expiredSnapshot))!.listing;
    expect(expired.snapshot.availability).toBe('expired');
    expect(expired.provenance.observedAt).toBe(expired.snapshot.collectedAt);
    expect(expired.lastCollectedAt).toBe(expired.snapshot.collectedAt);
    expect(expired.collectionCount).toBe(1);
    expect(expired.history).toHaveLength(1);
    expect(expired.fieldEffectiveAt.description).toBe(expired.snapshot.collectedAt);
    if (expired.description.permission === 'allowed') {
      expect(expired.description.versions).toHaveLength(1);
      expect(expired.description.current).toBe(expired.description.versions[0]!.text);
    }
    expect(expired.provenance.contentHash).toMatch(/^sha256:/);
    expect(expired.provenance.runId).toMatch(/-7/);
    const inactive = (await adapter.getProperty(SUPPLEMENTARY_PROPERTY_IDS.noActiveListings))!
      .property;
    expect(inactive.summary.askingPrice).toBeNull();
    expect(inactive.summary.pricePerSquareMeter).toBeNull();
    expect(inactive.summary.bedrooms).toBeNull();
    expect(inactive.sale.status).toBe('not-recorded');
    expect(inactive.listings[0]!.status).toBe('removed');
    for (const propertyId of Object.values(SUPPLEMENTARY_PROPERTY_IDS)) {
      const property = (await adapter.getProperty(propertyId))!.property;
      expect(property.priceChanges).toEqual([]);
      expect(property.summary.priceReduced).toBe(false);
    }
  });
  it('ranks latest recorded drops, paginates reductions and returns empty/unknown reads', async () => {
    const reductions = (await adapter.largestReductions('sao-paulo', {}))!;
    expect(reductions.totalItems).toBe(4);
    expect(reductions.items.map((item) => item.provenance.sourceListingId)).toEqual([
      'COB-TT-001',
      'AUR-BV-001',
      'BRI-SN-001',
      'COB-VM-001',
    ]);
    const first = (await adapter.largestReductions('sao-paulo', { pageSize: 1 }))!;
    const next = (await adapter.largestReductions('sao-paulo', {
      pageSize: 1,
      cursor: first.nextCursor!,
    }))!;
    expect(next.items[0]!.listingId).toBe(reductions.items[1]!.listingId);
    expect(first.totalItems).toBe(4);
    expect(new Set(reductions.items.map((row) => row.propertyId)).size).toBe(reductions.totalItems);
    const santana = reductions.items.find((row) => row.propertyId === syntheticReadId(3))!;
    expect(santana.previousMinorUnits).toBe(67000000);
    expect(santana.currentMinorUnits).toBe(65500000);
    expect(santana.reductionPercent).toBeCloseTo((1500000 / 67000000) * 100);
    const listing = (await adapter.getListing(santana.listingId))!.listing;
    const listingChange = listing.history.find((row) => row.type === 'price-changed')!;
    expect(listingChange.type === 'price-changed' && listingChange.previousMinorUnits).toBe(
      68000000,
    );
    expect((await adapter.largestReductions('sao-paulo-oeste', {}))!.items).toEqual([]);
    expect(await adapter.largestReductions('unknown', {})).toBeNull();
    expect(await adapter.getProperty(syntheticReadId(999))).toBeNull();
    expect(await adapter.getListing(syntheticReadId(999))).toBeNull();
  });
  it('returns fresh nested values that cannot mutate subsequent reads', async () => {
    const first = (await adapter.getProperty(syntheticReadId(1)))!;
    Reflect.set(first.property.listings[0]!.description, 'current', 'MUTATED');
    Reflect.set(first.property.summary.place.name, 'en', 'MUTATED');
    expect(JSON.stringify(await adapter.getProperty(syntheticReadId(1)))).not.toContain('MUTATED');
    const page = await adapter.search({});
    Reflect.set(page.items[0]!, 'bedrooms', 99);
    expect((await adapter.search({})).items[0]!.bedrooms).not.toBe(99);
  });
  it('breaks reduction percentage ties by property ID and ignores future changes', async () => {
    const isolated = new SyntheticPropertiesAdapter();
    const properties = await Promise.all(
      [5, 4].map(async (number) => (await isolated.getProperty(syntheticReadId(number)))!.property),
    );
    const tied = properties.map((property) => ({
      ...property,
      priceChanges: [
        {
          ...property.priceChanges.at(-1)!,
          previousMinorUnits: 80000000,
          currentMinorUnits: 78000000,
          changePercent: -2.5,
        },
        {
          ...property.priceChanges.at(-1)!,
          effectiveAt: '2026-11-01T12:00:00.000Z',
          previousMinorUnits: 78000000,
          currentMinorUnits: 70000000,
          changePercent: (-8000000 / 78000000) * 100,
        },
      ],
    }));
    Reflect.set(isolated, 'properties', tied);
    const result = (await isolated.largestReductions('sao-paulo', {}))!;
    expect(result.items.map((row) => row.propertyId)).toEqual([4, 5].map(syntheticReadId));
    expect(result.items.every((row) => row.reductionPercent === 2.5)).toBe(true);
    expect(result.items.map((row) => row.listingId)).toEqual([109, 108].map(syntheticReadId));
  });
  it.each([
    { pageSize: 0 },
    { pageSize: 21 },
    { pageSize: 1.5 },
    { minArea: 0 },
    { maxArea: Infinity },
    { minBedrooms: -1 },
    { minBedrooms: 101 },
    { minBathrooms: 1.5 },
    { minAskingPrice: Number.MAX_SAFE_INTEGER + 1 },
    { priceReduced: 'true' },
    { sort: 'invalid' },
    { propertyType: 'boat' },
    { timeOnMarket: 'invalid' },
    { placeId: 'BAD' },
    { cursor: '' },
    { minArea: 90, maxArea: 80 },
    { minAskingPrice: 2, maxAskingPrice: 1 },
    { minPricePerSquareMeter: 2, maxPricePerSquareMeter: 1 },
    { extra: true },
  ])('rejects invalid typed query %j', (query) => {
    expect(() => validateReadQuery(query as SearchQuery)).toThrow();
  });
});
