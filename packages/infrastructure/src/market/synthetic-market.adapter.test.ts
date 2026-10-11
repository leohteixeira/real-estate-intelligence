import { MarketQueryService } from '@rei/application';
import { describe, expect, it } from 'vitest';
import { SYNTHETIC_SAO_PAULO_DATASET } from '../collection/index.js';
import {
  SYNTHETIC_READ_METADATA,
  supplementaryPlaces,
  syntheticPlaces,
} from '../locations/index.js';
import { SyntheticMarketAdapter } from './synthetic-market.adapter.js';

const places = [...syntheticPlaces(), ...supplementaryPlaces()];
const locations = {
  getPlace: async (id: string) => {
    const place = places.find((place) => place.id === id);
    return place ? { metadata: SYNTHETIC_READ_METADATA, place } : null;
  },
  registeredScopeIds: async (id: string) =>
    places
      .filter((place) => place.breadcrumbs.some((crumb) => crumb.id === id))
      .map((place) => place.id),
  roots: async () => ({ metadata: SYNTHETIC_READ_METADATA, items: [] }),
  children: async () => null,
  resolveFixtureAddress: async () => null,
  resolvePublishedAddress: async () => null,
};
describe('prepared Market samples from the unchanged catalog', () => {
  const adapter = new SyntheticMarketAdapter();
  const facade = new MarketQueryService(adapter, locations);
  it('serves all twenty registered scopes, actual parents and explicit unavailable values', async () => {
    expect(places).toHaveLength(20);
    for (const place of places) {
      const response = (await facade.getPlaceMarket(place.id))!;
      expect(response.counts.properties).toBe(place.propertyCount);
      expect(response.parentMedian?.place.id ?? null).toBe(place.parentId);
      expect(response.figures.recordedSalePricePerSquareMeter).toMatchObject({
        state: 'not-recorded',
        value: null,
        recordCount: 0,
        sources: [],
      });
      const series = (await facade.monthlySeries(place.id))!;
      expect(series.comparisonPlace?.id ?? null).toBe(place.parentId);
      expect(series.points.map((point) => point.month)).toEqual(
        SYNTHETIC_SAO_PAULO_DATASET.runs.slice(1).map((run) => run.runKey),
      );
      if (!place.propertyCount) {
        expect(response.counts).toEqual({ properties: 0, activeListings: 0, sources: 0 });
        expect(Object.values(response.figures).every((figure) => figure.value === null)).toBe(true);
        expect(
          series.points.every(
            (point) => point.median.value === null && point.parentMedian?.value !== null,
          ),
        ).toBe(true);
      }
    }
  });
  it('uses prepared group identity, lowest active price, complete source selection and numeric zeros', async () => {
    const city = (await facade.getPlaceMarket('sao-paulo'))!;
    expect(city.counts).toEqual({ properties: 5, activeListings: 9, sources: 3 });
    expect(city.figures.medianAskingPricePerSquareMeter.value).toEqual({
      minorUnits: 951220,
      currency: 'BRL',
    });
    const bela = (await facade.getPlaceMarket('sao-paulo-bela-vista'))!;
    expect(bela.counts).toEqual({ properties: 1, activeListings: 3, sources: 3 });
    expect(bela.figures.medianAskingPricePerSquareMeter.value?.minorUnits).toBe(
      Math.round(78000000 / 82),
    );
    expect(bela.figures.medianAskingPricePerSquareMeter.sources.map((source) => source.id)).toEqual(
      SYNTHETIC_SAO_PAULO_DATASET.sources.map((source) => source.sourceId),
    );
    const pinheiros = (await facade.getPlaceMarket('sao-paulo-pinheiros'))!;
    expect(pinheiros.parentMedian?.place.id).toBe('sao-paulo-oeste');
    expect(pinheiros.figures.askingPriceMovement).toMatchObject({ state: 'available', value: 0 });
    expect(pinheiros.figures.priceReductions).toMatchObject({
      state: 'available',
      value: { count: 0, percentage: 0 },
    });
    expect(
      pinheiros.figures.medianAskingPricePerSquareMeter.sources.map((source) => source.id),
    ).toEqual(['synthetic-portal-aurora']);
    const vila = (await facade.monthlySeries('sao-paulo-vila-mariana'))!;
    expect(vila.points.find((point) => point.month === '2026-04')!.median.value?.minorUnits).toBe(
      Math.round(126000000 / 135),
    );
    expect(
      vila.points
        .find((point) => point.month === '2026-04')!
        .median.sources.map((source) => source.id),
    ).toEqual(['synthetic-portal-brisa']);
  });
  it('includes only registered adjacency and distinguishes unknown places', async () => {
    for (const place of places)
      expect((await facade.neighbours(place.id))!.items.map((item) => item.place.id)).toEqual(
        place.adjacentPlaceIds,
      );
    expect((await facade.neighbours('sao-paulo-bela-vista'))!.items[0]!.place.id).toBe(
      'sao-paulo-vila-mariana',
    );
    expect((await facade.neighbours('sao-paulo-pinheiros'))!.items).toEqual([]);
    expect(await facade.getPlaceMarket('unknown-place')).toBeNull();
  });
  it('isolates nested figures, sources, metadata and series from caller mutations', async () => {
    const ids = await locations.registeredScopeIds('sao-paulo');
    const first = await adapter.read(ids);
    const expected = structuredClone(first);
    Reflect.set(first.figures.medianAskingPricePerSquareMeter.sources[0]!, 'label', 'mutated');
    Reflect.set(first.figures.medianAskingPricePerSquareMeter.value!, 'minorUnits', 1);
    Reflect.set(first.points[0]!.median.freshness, 'status', 'stale');
    Reflect.set(first.metadata, 'fixtureVersion', 'mutated');
    expect(await adapter.read(ids)).toEqual(expected);
    const dataset = SYNTHETIC_SAO_PAULO_DATASET;
    expect([
      dataset.properties.length,
      dataset.listings.length,
      dataset.sources.length,
      dataset.runs.length,
    ]).toEqual([5, 9, 3, 13]);
    expect(Object.isFrozen(dataset)).toBe(true);
    expect(Object.isFrozen(dataset.runs[12]!.observations)).toBe(true);
  });
});
