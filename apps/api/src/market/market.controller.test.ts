import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  MARKET_FACADE,
  LOCATIONS_FACADE,
  MarketQueryService,
  type MarketFacade,
  type LocationsFacade,
} from '@rei/application';
import {
  parsePlaceMarketResponse,
  parsePlaceMarketNeighboursResponse,
  parsePlaceMarketSeriesResponse,
} from '@rei/contracts';
import { PropertiesEvent, parsePropertiesEvent } from '@rei/domain';
import {
  PostgresLocationsFacade,
  SYNTHETIC_READ_METADATA,
  syntheticPlaces,
  supplementaryPlaces,
  SyntheticMarketAdapter,
} from '@rei/infrastructure';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { configureApi } from '../configure-api';
import { DATABASE_CONNECTION } from '../persistence/persistence.module';
import { MarketModule } from './market.module';

const places = [...syntheticPlaces(), ...supplementaryPlaces()];
describe('actual MarketModule HTTP contracts', () => {
  let unavailable = false;
  let storedFacts: Array<{ property_id: string; selected_listing: unknown }> = [];
  const query = vi.fn(async (sql: string, parameters: readonly unknown[] = []) => {
    if (unavailable) throw new Error('password=private database unavailable');
    if (sql.includes('market.property_price_current'))
      return sql.includes(' AS representatives')
        ? [
            {
              representatives: storedFacts,
              current: storedFacts.map((fact) => fact.selected_listing),
              history: storedFacts.map((fact) => ({
                revision: '1',
                listing: fact.selected_listing,
              })),
              events: [],
            },
          ]
        : storedFacts;
    if (sql.includes('locations.reference_metadata')) return [SYNTHETIC_READ_METADATA];
    if (sql.includes('SELECT public_id AS id FROM scope'))
      return places
        .filter((place) => place.breadcrumbs.some((crumb) => crumb.id === parameters[0]))
        .map((place) => ({ id: place.id }));
    return places
      .filter((place) => place.id === parameters[0])
      .map((detail) => ({ detail: structuredClone(detail) }));
  });
  let app: INestApplication;
  let base: string;
  let market: MarketFacade;
  let prepared: MarketFacade;
  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [MarketModule] })
      .overrideProvider(DATABASE_CONNECTION)
      .useValue({ query, close: async () => undefined })
      .compile();
    expect(module.get(LOCATIONS_FACADE)).toBeInstanceOf(PostgresLocationsFacade);
    market = module.get<MarketFacade>(MARKET_FACADE);
    prepared = new MarketQueryService(
      new SyntheticMarketAdapter(),
      module.get<LocationsFacade>(LOCATIONS_FACADE),
    );
    expect(market).toBeInstanceOf(MarketQueryService);
    app = module.createNestApplication();
    configureApi(app);
    await app.listen(0, '127.0.0.1');
    const address = app.getHttpServer().address();
    if (!address || typeof address === 'string') throw new Error('Missing HTTP listener');
    base = `http://127.0.0.1:${address.port}`;
  });
  afterAll(async () => {
    await app.close();
  });
  async function success(id: string, suffix: string, parser: (value: unknown) => unknown) {
    const response = await fetch(`${base}/api/v1/places/${id}/market${suffix}`);
    expect(response.status).toBe(200);
    return parser(await response.json());
  }
  async function error(path: string, status: number) {
    const response = await fetch(`${base}${path}`, {
      headers: { 'x-request-id': 'client-controlled' },
    });
    expect(response.status).toBe(status);
    expect(response.headers.get('content-type')).toContain('application/json');
    const requestId = response.headers.get('x-request-id');
    expect(requestId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(await response.json()).toEqual({
      error: {
        code: status === 400 ? 'bad_request' : status === 404 ? 'not_found' : 'internal_error',
        message:
          status === 400
            ? 'The request could not be processed.'
            : status === 404
              ? 'The requested resource was not found.'
              : 'An unexpected error occurred.',
        requestId,
      },
    });
  }
  it('parses every route for twenty registered scopes with actual hierarchy and adjacency', async () => {
    for (const place of places) {
      const overview = parsePlaceMarketResponse(
        await success(place.id, '', parsePlaceMarketResponse),
      );
      expect(overview.basis).toBe('event-fed-place-figures');
      expect(overview).not.toHaveProperty('preparedSections');
      expect(overview.place.id).toBe(place.id);
      expect(overview.counts).toEqual({ properties: 0, activeListings: 0, sources: 0 });
      expect(overview.parentMedian?.place.id ?? null).toBe(place.parentId);
      const neighbors = parsePlaceMarketNeighboursResponse(
        await success(place.id, '/neighbours', parsePlaceMarketNeighboursResponse),
      );
      expect(neighbors.basis).toBe('event-fed-place-figures');
      expect(neighbors).not.toHaveProperty('preparedEvaluatedAt');
      expect(neighbors.items.map((item) => item.place.id)).toEqual(place.adjacentPlaceIds);
      for (const item of neighbors.items) {
        expect(item.median).toMatchObject({
          value: null,
          recordCount: 0,
          computedAt: neighbors.evaluatedAt,
          freshness: { status: 'untracked' },
        });
        expect(item.movement).toMatchObject({
          value: null,
          recordCount: 0,
          computedAt: neighbors.evaluatedAt,
          freshness: { status: 'untracked' },
        });
      }
      const series = parsePlaceMarketSeriesResponse(
        await success(place.id, '/monthly-series', parsePlaceMarketSeriesResponse),
      );
      expect(series.comparisonPlace?.id ?? null).toBe(place.parentId);
      expect(series.points).toHaveLength(12);
      if (!place.propertyCount)
        expect(series.points.every((point) => point.median.state === 'insufficient-data')).toBe(
          true,
        );
    }
    expect(
      query.mock.calls.every(([sql]) => sql.includes('locations.') || sql.includes('market.')),
    ).toBe(true);
  });
  it('rejects malformed IDs and every query before accessing the facade; unknown and unprefixed reads are canonical', async () => {
    for (const suffix of ['', '/neighbours', '/monthly-series']) {
      await error(`/api/v1/places/unknown-place/market${suffix}`, 404);
      const spy = vi.spyOn(
        market,
        suffix === ''
          ? 'getPlaceMarket'
          : suffix === '/neighbours'
            ? 'neighbours'
            : 'monthlySeries',
      );
      for (const query of [
        '?x=1',
        '?x=1&x=2',
        '?x[y]=1',
        '?__proto__[private]=1',
        '?placeId=private',
      ])
        await error(`/api/v1/places/brazil/market${suffix}${query}`, 400);
      for (const id of ['BRAZIL', 'with%20space', 'a'.repeat(201)])
        await error(`/api/v1/places/${id}/market${suffix}`, 400);
      expect(spy).not.toHaveBeenCalled();
      spy.mockRestore();
      await error(`/places/brazil/market${suffix}`, 404);
    }
  });
  it('sanitizes thrown persistence failures on every route', async () => {
    unavailable = true;
    try {
      for (const suffix of ['', '/neighbours', '/monthly-series'])
        await error(`/api/v1/places/brazil/market${suffix}`, 500);
    } finally {
      unavailable = false;
    }
  });
  it('returns canonical 500 for malformed stored facts and an accepted event with an unrepresentable median', async () => {
    const id = (n: number) => `0199c8f2-2394-7000-8000-${String(n).padStart(12, '0')}`;
    const observedAt = '2026-10-10T12:00:00.000Z';
    const accepted = new PropertiesEvent('properties.listing.created', {
      eventId: id(1),
      aggregateId: id(2),
      occurredAt: observedAt,
      payload: {
        revision: 1,
        effectiveAt: observedAt,
        listing: {
          listingId: id(2),
          propertyId: id(3),
          sourceId: 'synthetic-market',
          sourceListingId: 'listing-1',
          placeId: 'sao-paulo-pinheiros-fictional-block',
          propertyType: 'apartment',
          status: 'active',
          askingPriceMinorUnits: 1,
          currency: 'BRL',
          areaSquareMeters: 1_000_000,
          effectiveAt: observedAt,
          provenance: {
            sourceId: 'synthetic-market',
            sourceListingId: 'listing-1',
            sourceUrl: 'https://market.invalid/listing-1',
            runId: id(4),
            snapshotId: id(5),
            contentHash: `sha256:${'a'.repeat(64)}`,
            observedAt,
          },
        },
      },
    });
    expect(parsePropertiesEvent(accepted).payload).toEqual(accepted.payload);
    try {
      for (const selected_listing of [{ private: 'never expose' }, accepted.payload.listing]) {
        storedFacts = [{ property_id: id(3), selected_listing }];
        await error('/api/v1/places/brazil/market', 500);
        await error('/api/v1/places/BRAZIL/market', 400);
      }
    } finally {
      storedFacts = [];
    }
  });
  it('rejects malformed output and thrown facade failures without success fallback', async () => {
    for (const [method, suffix] of [
      ['getPlaceMarket', ''],
      ['neighbours', '/neighbours'],
      ['monthlySeries', '/monthly-series'],
    ] as const) {
      const spy = vi.spyOn(market, method);
      spy.mockResolvedValueOnce({ private: 'never expose' } as never);
      await error(`/api/v1/places/brazil/market${suffix}`, 500);
      spy.mockRejectedValueOnce(new Error('secret database connection string'));
      await error(`/api/v1/places/brazil/market${suffix}`, 500);
      spy.mockRestore();
    }
  });
  it('allows truthful stale prepared series and isolates caller changes', async () => {
    const original = (await prepared.monthlySeries('brazil'))!;
    const stale = structuredClone(original);
    Reflect.set(stale, 'evaluatedAt', '2026-10-01T12:00:02.000Z');
    for (const point of stale.points)
      Reflect.set(
        point.median.freshness,
        'ageSeconds',
        (Date.parse(stale.evaluatedAt) - Date.parse(point.median.computedAt)) / 1000,
      );
    const figure = stale.points.at(-1)!.median;
    Reflect.set(figure.sources[0]!, 'collectedAt', '2026-10-01T12:00:01.000Z');
    Reflect.set(figure.freshness, 'latestCollectionCompletedAt', '2026-10-01T12:00:01.000Z');
    Reflect.set(figure.freshness, 'status', 'stale');
    const spy = vi
      .spyOn(market, 'monthlySeries')
      .mockResolvedValueOnce(stale)
      .mockResolvedValueOnce(original);
    const parsed = parsePlaceMarketSeriesResponse(
      await success('brazil', '/monthly-series', parsePlaceMarketSeriesResponse),
    );
    expect(parsed.points.at(-1)!.median.freshness.status).toBe('stale');
    Reflect.set(parsed.points.at(-1)!.median, 'value', null);
    const fresh = parsePlaceMarketSeriesResponse(
      await success('brazil', '/monthly-series', parsePlaceMarketSeriesResponse),
    );
    expect(fresh.points.at(-1)!.median.value).toEqual(original.points.at(-1)!.median.value);
    spy.mockRestore();
    const overview = parsePlaceMarketResponse(
      await success('brazil', '', parsePlaceMarketResponse),
    );
    expect(overview.figures.medianAskingPricePerSquareMeter.value).toBeNull();
    expect(overview.figures.askingPriceMovement.freshness.status).toBe('untracked');
  });
});
