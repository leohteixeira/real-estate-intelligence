import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  MARKET_FACADE,
  LOCATIONS_FACADE,
  MarketQueryService,
  type MarketFacade,
} from '@rei/application';
import {
  parsePlaceMarketResponse,
  parsePlaceMarketNeighboursResponse,
  parsePlaceMarketSeriesResponse,
} from '@rei/contracts';
import {
  PostgresLocationsFacade,
  SYNTHETIC_READ_METADATA,
  syntheticPlaces,
  supplementaryPlaces,
} from '@rei/infrastructure';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { configureApi } from '../configure-api';
import { DATABASE_CONNECTION } from '../persistence/persistence.module';
import { MarketModule } from './market.module';

const places = [...syntheticPlaces(), ...supplementaryPlaces()];
describe('actual MarketModule HTTP contracts', () => {
  let unavailable = false;
  const query = vi.fn(async (sql: string, parameters: readonly unknown[] = []) => {
    if (unavailable) throw new Error('password=private database unavailable');
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
  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [MarketModule] })
      .overrideProvider(DATABASE_CONNECTION)
      .useValue({ query, close: async () => undefined })
      .compile();
    expect(module.get(LOCATIONS_FACADE)).toBeInstanceOf(PostgresLocationsFacade);
    market = module.get<MarketFacade>(MARKET_FACADE);
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
      expect(overview.place.id).toBe(place.id);
      expect(overview.counts.properties).toBe(place.propertyCount);
      expect(overview.parentMedian?.place.id ?? null).toBe(place.parentId);
      const neighbors = parsePlaceMarketNeighboursResponse(
        await success(place.id, '/neighbours', parsePlaceMarketNeighboursResponse),
      );
      expect(neighbors.items.map((item) => item.place.id)).toEqual(place.adjacentPlaceIds);
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
    expect(query.mock.calls.every(([sql]) => sql.includes('locations.'))).toBe(true);
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
  it('allows truthful stale examples and isolates caller changes', async () => {
    const original = (await market.getPlaceMarket('brazil'))!;
    const stale = structuredClone(original);
    Reflect.set(stale, 'evaluatedAt', '2026-10-01T12:00:02.000Z');
    for (const item of Object.values(stale.figures)) Reflect.set(item.freshness, 'ageSeconds', 2);
    Reflect.set(stale.parentMedian?.median.freshness ?? {}, 'ageSeconds', 2);
    const figure = stale.figures.askingPriceMovement;
    Reflect.set(figure.sources[0]!, 'collectedAt', '2026-10-01T12:00:01.000Z');
    Reflect.set(figure.freshness, 'latestCollectionCompletedAt', '2026-10-01T12:00:01.000Z');
    Reflect.set(figure.freshness, 'status', 'stale');
    const spy = vi.spyOn(market, 'getPlaceMarket').mockResolvedValueOnce(stale);
    const parsed = parsePlaceMarketResponse(await success('brazil', '', parsePlaceMarketResponse));
    expect(parsed.figures.askingPriceMovement.freshness.status).toBe('stale');
    spy.mockRestore();
    Reflect.set(parsed.figures.medianAskingPricePerSquareMeter.value!, 'minorUnits', 1);
    expect(await success('brazil', '', parsePlaceMarketResponse)).toEqual(original);
  });
});
