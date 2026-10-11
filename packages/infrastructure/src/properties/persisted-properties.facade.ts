import type {
  CollectionFacade,
  PropertiesFacade,
  LargestReductionsService,
} from '@rei/application';
import type {
  ListingResponse,
  ListingDetail,
  Property,
  PageQuery,
  PropertyResponse,
  ReductionsResponse,
  SearchQuery,
  SearchResponse,
} from '@rei/domain';
import { projectInitialProperty } from './persisted-property.projection.js';
import type { PostgresPropertyRepository } from './postgres-property.repository.js';
import type { PostgresListingHistoryRepository } from './postgres-listing-history.repository.js';

/** Detail is persisted-first; reductions are persisted-only; search/counts remain prepared. */
export class PersistedPropertiesFacade implements PropertiesFacade {
  public constructor(
    private readonly repository: Pick<PostgresPropertyRepository, 'getProperty' | 'getListing'>,
    private readonly collection: Pick<
      CollectionFacade,
      'getSourcePermissions' | 'getSnapshotMetadata'
    >,
    private readonly prepared: PropertiesFacade,
    private readonly history?: Pick<PostgresListingHistoryRepository, 'getState'>,
    private readonly reductions?: Pick<LargestReductionsService, 'execute'>,
  ) {}
  public search(query: SearchQuery): Promise<SearchResponse> {
    return this.prepared.search(query);
  }
  public largestReductions(placeId: string, query: PageQuery): Promise<ReductionsResponse | null> {
    if (!this.reductions) throw new Error('Persisted reductions query is unavailable.');
    return this.reductions.execute(placeId, query);
  }
  public async getProperty(id: string): Promise<PropertyResponse | null> {
    const property = await this.repository.getProperty(id);
    if (property) return this.projectPersisted(property);
    const response = await this.prepared.getProperty(id);
    if (!response) return null;
    return {
      ...response,
      property: {
        ...response.property,
        listings: await Promise.all(
          response.property.listings.map((listing) => this.applyRights(listing)),
        ),
      },
    };
  }
  public async getListing(id: string): Promise<ListingResponse | null> {
    const property = await this.repository.getListing(id);
    if (!property) {
      const response = await this.prepared.getListing(id);
      return response ? { ...response, listing: await this.applyRights(response.listing) } : null;
    }
    const response = await this.projectPersisted(property);
    return { metadata: response.metadata, listing: response.property.listings[0]! };
  }

  private async projectPersisted(property: Property): Promise<PropertyResponse> {
    const state = (await this.history?.getState(property.listingId)) ?? null;
    const projected = projectInitialProperty(property, true, state);
    const listing = projected.property.listings[0]!;
    const snapshot = await this.collection.getSnapshotMetadata(listing.provenance);
    return {
      ...projected,
      property: {
        ...projected.property,
        listings: [await this.applyRights({ ...listing, snapshot })],
      },
    };
  }

  private async applyRights(listing: ListingDetail): Promise<ListingDetail> {
    const rights = await this.collection.getSourcePermissions(listing.source.sourceId);
    if (rights.listingTextDisplayAllowed || listing.description.permission === 'denied')
      return structuredClone(listing);
    const changedAt = [
      ...new Set([
        ...listing.description.versions.slice(1).map((version) => version.effectiveAt),
        ...listing.history
          .filter((entry) => entry.type === 'description-changed')
          .map((entry) => entry.effectiveAt),
      ]),
    ].sort((a, b) => Date.parse(a) - Date.parse(b));
    return structuredClone({
      ...listing,
      description: { permission: 'denied', changedAt, sourceUrl: listing.description.sourceUrl },
    });
  }
}
