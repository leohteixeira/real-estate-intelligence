import {
  askingPriceMedian,
  marketFreshness,
  type MarketEvidence,
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
  private async calculation() {
    if (!this.live) throw new Error('Live Market unavailable.');
    const snapshot = await this.live.facts.readFigures();
    const computedAt = this.live.clock.now();
    const sourceIds = [
      ...new Set(
        [
          ...snapshot.representatives,
          ...snapshot.current,
          ...snapshot.history.map(({ listing }) => listing),
          ...snapshot.priceChanges.map(({ listing }) => listing),
        ].map((listing) => listing.sourceId),
      ),
    ].sort();
    const completions = await this.live.facts.readCompletions(sourceIds);
    const evaluatedAt = this.live.clock.now();
    const proof = <T extends MarketEvidence>(figure: T): T =>
      marketFreshness(figure, completions, evaluatedAt, computedAt);
    return { snapshot, computedAt, evaluatedAt, proof };
  }
  public async getPlaceMarket(id: string): Promise<PlaceMarketResponse | null> {
    const scope = await this.scope(id);
    if (!scope) return null;
    const parent = await this.parent(scope.place.parentId);
    if (this.live) {
      try {
        const { snapshot, evaluatedAt, proof } = await this.calculation();
        const facts = snapshot.representatives;
        const calculated = remainingPlaceFigures(snapshot, scope.ids, evaluatedAt);
        const figures = {
          askingPriceMovement: proof(calculated.askingPriceMovement),
          medianTimeOnMarketDays: proof(calculated.medianTimeOnMarketDays),
          priceReductions: proof(calculated.priceReductions),
          listingsPerProperty: proof(calculated.listingsPerProperty),
          recordedSalePricePerSquareMeter: proof(calculated.recordedSalePricePerSquareMeter),
        };
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
            medianAskingPricePerSquareMeter: proof(
              askingPriceMedian(facts, scope.ids, evaluatedAt),
            ),
          },
          parentMedian: parent
            ? {
                place: ref(parent.place),
                median: proof(askingPriceMedian(facts, parent.ids, evaluatedAt)),
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
        const { snapshot, evaluatedAt, proof } = await this.calculation();
        return structuredClone({
          ...this.base(scope),
          basis: 'event-fed-place-figures' as const,
          evaluatedAt,
          items: neighbors.map((neighbor) => ({
            place: ref(neighbor.place),
            median: proof(askingPriceMedian(snapshot.representatives, neighbor.ids, evaluatedAt)),
            movement: proof(
              remainingPlaceFigures(snapshot, neighbor.ids, evaluatedAt).askingPriceMovement,
            ),
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
        const { snapshot, computedAt, evaluatedAt, proof } = await this.calculation();
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
            computedAt,
          ).map((point) => ({
            ...point,
            median: proof(point.median),
            parentMedian: point.parentMedian ? proof(point.parentMedian) : null,
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
