import { DomainValidationError, type PlaceRef } from '@rei/domain';
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
  ) {}
  private async scope(id: string) {
    if (typeof id !== 'string' || id.length > 200 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id))
      throw new DomainValidationError('Invalid place identifier.', 'placeId');
    const place = await this.locations.getPlace(id);
    if (!place) return null;
    const ids = await this.locations.registeredScopeIds(id);
    if (!ids) throw new Error('Registered Market scope unavailable.');
    return { place: place.place, sample: await this.fixtures.read(ids) };
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
  public async getPlaceMarket(id: string) {
    const scope = await this.scope(id);
    if (!scope) return null;
    const parent = await this.parent(scope.place.parentId);
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
  public async neighbours(id: string) {
    const scope = await this.scope(id);
    if (!scope) return null;
    const items = [];
    for (const neighborId of scope.place.adjacentPlaceIds) {
      const neighbor = await this.scope(neighborId);
      if (!neighbor) throw new Error('Registered Market neighbour unavailable.');
      items.push({
        place: ref(neighbor.place),
        median: neighbor.sample.figures.medianAskingPricePerSquareMeter,
        movement: neighbor.sample.figures.askingPriceMovement,
      });
    }
    return structuredClone({ ...this.base(scope), items });
  }
  public async monthlySeries(id: string) {
    const scope = await this.scope(id);
    if (!scope) return null;
    const parent = await this.parent(scope.place.parentId);
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
