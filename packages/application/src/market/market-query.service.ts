import {
  askingPriceMedian,
  monthlyAskingPriceSeries,
  remainingPlaceFigures,
  DomainValidationError,
  type PlaceRef,
  type PlaceMarketResponse,
  type PlaceMarketNeighboursResponse,
  type PlaceMarketSeriesResponse,
} from '@rei/domain';
import type { Clock } from '../shared/index.js';
import type { MarketPriceFactsReadPort } from './market-price-facts.port.js';
import type { LocationsFacade } from '../locations/index.js';
import type { MarketFacade } from './market.facade.js';
import type { MarketFixtureReadPort } from './market-fixture-read.port.js';

function ref(place: PlaceRef): PlaceRef {
  return { id: place.id, kind: place.kind, name: place.name };
}
export class MarketQueryService implements MarketFacade {
  public constructor(
    private readonly fixtures: MarketFixtureReadPort,
    private readonly locations: LocationsFacade,
    private readonly live?: { readonly facts: MarketPriceFactsReadPort; readonly clock: Clock },
  ) {}
  private async scope(id: string) {
    if (typeof id !== 'string' || id.length > 200 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id))
      throw new DomainValidationError('Invalid place identifier.', 'placeId');
    const place = await this.locations.getPlace(id);
    if (!place) return null;
    const ids = await this.locations.registeredScopeIds(id);
    if (!ids) throw new Error('Registered Market scope unavailable.');
    return { place: place.place, ids, sample: await this.fixtures.read(ids) };
  }
  private base(scope: NonNullable<Awaited<ReturnType<MarketQueryService['scope']>>>) {
    return {
      metadata: scope.sample.metadata,
      basis: scope.sample.basis,
      evaluatedAt: scope.sample.evaluatedAt,
      place: ref(scope.place),
    };
  }
  private async parent(id: string | null) {
    if (id === null) return null;
    const parent = await this.scope(id);
    if (!parent) throw new Error('Registered Market parent unavailable.');
    return parent;
  }
  public async getPlaceMarket(id: string): Promise<PlaceMarketResponse | null> {
    const scope = await this.scope(id);
    if (!scope) return null;
    const parent = await this.parent(scope.place.parentId);
    if (this.live) {
      try {
        const snapshot = await this.live.facts.readFigures();
        const facts = snapshot.representatives;
        const evaluatedAt = this.live.clock.now();
        const figures = remainingPlaceFigures(snapshot, scope.ids, evaluatedAt);
        return structuredClone({
          ...this.base(scope),
          basis: 'event-fed-place-figures' as const,
          evaluatedAt,
          counts: {
            properties: figures.listingsPerProperty.recordCount,
            activeListings: figures.priceReductions.recordCount,
            sources: figures.listingsPerProperty.sources.length,
          },
          figures: {
            ...figures,
            medianAskingPricePerSquareMeter: askingPriceMedian(facts, scope.ids, evaluatedAt),
          },
          parentMedian: parent
            ? {
                place: ref(parent.place),
                median: askingPriceMedian(facts, parent.ids, evaluatedAt),
              }
            : null,
        });
      } catch (error: unknown) {
        // Request validation already succeeded; these facts and calculations are server-owned.
        if (error instanceof DomainValidationError)
          throw new Error('Stored Market price facts could not be evaluated.', { cause: error });
        throw error;
      }
    }
    return structuredClone({
      ...this.base(scope),
      counts: scope.sample.counts,
      figures: scope.sample.figures,
      parentMedian: parent
        ? {
            place: ref(parent.place),
            median: parent.sample.figures.medianAskingPricePerSquareMeter,
          }
        : null,
    });
  }
  public async neighbours(id: string): Promise<PlaceMarketNeighboursResponse | null> {
    const scope = await this.scope(id);
    if (!scope) return null;
    const neighbors = [];
    for (const neighborId of scope.place.adjacentPlaceIds) {
      const neighbor = await this.scope(neighborId);
      if (!neighbor) throw new Error('Registered Market neighbour unavailable.');
      neighbors.push(neighbor);
    }
    if (this.live) {
      try {
        const snapshot = await this.live.facts.readFigures();
        const evaluatedAt = this.live.clock.now();
        return structuredClone({
          ...this.base(scope),
          basis: 'event-fed-place-figures' as const,
          evaluatedAt,
          items: neighbors.map((neighbor) => ({
            place: ref(neighbor.place),
            median: askingPriceMedian(snapshot.representatives, neighbor.ids, evaluatedAt),
            movement: remainingPlaceFigures(snapshot, neighbor.ids, evaluatedAt)
              .askingPriceMovement,
          })),
        });
      } catch (error: unknown) {
        if (error instanceof DomainValidationError)
          throw new Error('Stored Market price facts could not be evaluated.', { cause: error });
        throw error;
      }
    }
    return structuredClone({
      ...this.base(scope),
      items: neighbors.map((neighbor) => ({
        place: ref(neighbor.place),
        median: neighbor.sample.figures.medianAskingPricePerSquareMeter,
        movement: neighbor.sample.figures.askingPriceMovement,
      })),
    });
  }

  public async monthlySeries(id: string): Promise<PlaceMarketSeriesResponse | null> {
    const scope = await this.scope(id);
    if (!scope) return null;
    const parent = await this.parent(scope.place.parentId);
    if (this.live) {
      try {
        const snapshot = await this.live.facts.readFigures();
        const evaluatedAt = this.live.clock.now();
        return structuredClone({
          ...this.base(scope),
          basis: 'event-fed-place-figures' as const,
          evaluatedAt,
          comparisonPlace: parent ? ref(parent.place) : null,
          points: monthlyAskingPriceSeries(
            snapshot.history,
            scope.ids,
            parent?.ids ?? null,
            evaluatedAt,
          ),
        });
      } catch (error: unknown) {
        if (error instanceof DomainValidationError)
          throw new Error('Stored Market price facts could not be evaluated.', { cause: error });
        throw error;
      }
    }
    return structuredClone({
      ...this.base(scope),
      comparisonPlace: parent ? ref(parent.place) : null,
      points: scope.sample.points.map((point, index) => {
        const comparison = parent?.sample.points[index];
        if (parent && (!comparison || comparison.month !== point.month))
          throw new Error('Prepared Market series misaligned.');
        return { ...point, parentMedian: comparison?.median ?? null };
      }),
    });
  }
}
