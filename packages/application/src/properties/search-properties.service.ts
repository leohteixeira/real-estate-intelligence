import type { SearchQuery, SearchResponse, PlaceDetail } from '@rei/domain';
import type { LocationsFacade } from '../locations/index.js';
import type { Clock } from '../shared/index.js';
import type { PropertySearchRepository } from './property-search.repository.js';
import { normalizePropertySearchQuery, searchProperties } from './property-search.js';
import { pageReadItems, validateReadQuery } from './read-pagination.js';

export class SearchPropertiesService {
  public constructor(
    private readonly repository: PropertySearchRepository,
    private readonly locations: Pick<LocationsFacade, 'registeredScopeIds' | 'roots' | 'children'>,
    private readonly clock: Clock,
  ) {}
  public async execute(query: SearchQuery): Promise<SearchResponse> {
    validateReadQuery(query);
    const scope = await this.locations.registeredScopeIds(query.placeId ?? 'sao-paulo');
    const candidates = scope === null ? [] : await this.repository.readCurrent();
    const within = new Set(scope ?? []);
    const { matching, items, ownMedian } = searchProperties(
      candidates.map((candidate) => candidate.summary),
      query,
      (id) => within.has(id),
    );
    const places: PlaceDetail[] = [];
    const pending = [...(await this.locations.roots()).items];
    while (pending.length) {
      const place = pending.shift()!;
      places.push(place);
      pending.push(...((await this.locations.children(place.id))?.items ?? []));
    }
    const asOf =
      candidates.length === 0
        ? this.clock.now()
        : candidates.reduce(
            (latest, candidate) =>
              Date.parse(candidate.asOf) > Date.parse(latest) ? candidate.asOf : latest,
            candidates[0]!.asOf,
          );
    return structuredClone({
      metadata: {
        dataMode: 'synthetic-stub',
        fixtureVersion: 'persisted-synthetic-search-v1',
        asOf,
      },
      ...pageReadItems(items, query, {
        endpoint: 'persisted-properties',
        query: normalizePropertySearchQuery(query),
      }),
      medianPricePerSquareMeter: ownMedian,
      placeCounts: places.map((place) => ({
        placeId: place.id,
        totalItems: matching.filter((property) =>
          property.breadcrumbs.some((crumb) => crumb.id === place.id),
        ).length,
      })),
    });
  }
}
