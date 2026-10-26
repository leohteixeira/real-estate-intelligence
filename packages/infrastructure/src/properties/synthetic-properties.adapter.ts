import {
  pageReadItems as page,
  validateReadQuery,
  normalizePropertySearchQuery,
  searchProperties,
  type PropertiesFacade,
} from '@rei/application';
export { validateReadQuery } from '@rei/application';
import {
  type ListingResponse,
  type PageQuery,
  type PropertyResponse,
  type ReductionsResponse,
  type SearchQuery,
  type SearchResponse,
} from '@rei/domain';
import {
  placeContains,
  registeredSyntheticPlace,
  syntheticPlaces,
  SYNTHETIC_READ_METADATA,
} from '../locations/index.js';
import {
  buildSupplementaryProperties,
  buildSyntheticProperties,
} from './synthetic-properties.projection.js';

export class SyntheticPropertiesAdapter implements PropertiesFacade {
  private readonly properties = buildSyntheticProperties();
  private readonly supplementary = buildSupplementaryProperties();
  public async search(query: SearchQuery): Promise<SearchResponse> {
    validateReadQuery(query);
    const normalized = normalizePropertySearchQuery(query);
    const { matching, items, ownMedian } = searchProperties(
      this.properties.map((property) => property.summary),
      query,
      (placeId) => placeContains(query.placeId ?? 'sao-paulo', placeId),
    );
    return structuredClone({
      metadata: SYNTHETIC_READ_METADATA,
      ...page(items, query, { endpoint: 'properties', query: normalized }),
      medianPricePerSquareMeter: ownMedian,
      placeCounts: syntheticPlaces().map((place) => ({
        placeId: place.id,
        totalItems: matching.filter((property) => placeContains(place.id, property.place.id))
          .length,
      })),
    });
  }
  public async getProperty(id: string): Promise<PropertyResponse | null> {
    const property = [...this.properties, ...this.supplementary].find(
      (property) => property.summary.id === id,
    );
    return property ? structuredClone({ metadata: SYNTHETIC_READ_METADATA, property }) : null;
  }
  public async getListing(id: string): Promise<ListingResponse | null> {
    const listing = [...this.properties, ...this.supplementary]
      .flatMap((property) => property.listings)
      .find((listing) => listing.id === id);
    return listing ? structuredClone({ metadata: SYNTHETIC_READ_METADATA, listing }) : null;
  }
  public async largestReductions(
    placeId: string,
    query: PageQuery,
  ): Promise<ReductionsResponse | null> {
    validateReadQuery(query, false);
    if (!registeredSyntheticPlace(placeId)) return null;
    const items = this.properties
      .filter((property) => placeContains(placeId, property.summary.place.id))
      .flatMap((property) => {
        const change = property.priceChanges
          .filter(
            (entry) =>
              entry.effectiveAt <= SYNTHETIC_READ_METADATA.asOf &&
              entry.currentMinorUnits < entry.previousMinorUnits,
          )
          .at(-1);
        const listing =
          change &&
          property.listings.find(
            (entry) =>
              entry.source.sourceId === change.provenance.sourceId &&
              entry.source.sourceListingId === change.provenance.sourceListingId,
          );
        return change && listing
          ? [
              {
                propertyId: property.summary.id,
                listingId: listing.id,
                place: property.summary.place,
                effectiveAt: change.effectiveAt,
                previousMinorUnits: change.previousMinorUnits,
                currentMinorUnits: change.currentMinorUnits,
                reductionPercent: -change.changePercent,
                provenance: change.provenance,
              },
            ]
          : [];
      })
      .sort(
        (a, b) =>
          b.reductionPercent - a.reductionPercent || a.propertyId.localeCompare(b.propertyId),
      );
    return structuredClone({
      metadata: SYNTHETIC_READ_METADATA,
      ...page(items, query, { endpoint: 'reductions', placeId, pageSize: query.pageSize ?? 20 }),
    });
  }
}
