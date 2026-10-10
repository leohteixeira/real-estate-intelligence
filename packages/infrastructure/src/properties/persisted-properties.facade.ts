import type { CollectionFacade, PropertiesFacade } from '@rei/application';
import type {
  ListingResponse,
  PageQuery,
  PropertyResponse,
  ReductionsResponse,
  SearchQuery,
  SearchResponse,
} from '@rei/domain';
import { projectInitialProperty } from './persisted-property.projection.js';
import type { PostgresPropertyRepository } from './postgres-property.repository.js';

/** Detail is persisted-first; prepared search/counts/reductions remain explicit fixtures. */
export class PersistedPropertiesFacade implements PropertiesFacade {
  public constructor(
    private readonly repository: Pick<PostgresPropertyRepository, 'getProperty' | 'getListing'>,
    private readonly collection: Pick<CollectionFacade, 'getSourcePermissions'>,
    private readonly prepared: PropertiesFacade,
  ) {}
  public search(query: SearchQuery): Promise<SearchResponse> {
    return this.prepared.search(query);
  }
  public largestReductions(placeId: string, query: PageQuery): Promise<ReductionsResponse | null> {
    return this.prepared.largestReductions(placeId, query);
  }
  public async getProperty(id: string): Promise<PropertyResponse | null> {
    const property = await this.repository.getProperty(id);
    if (!property) return this.prepared.getProperty(id);
    const rights = await this.collection.getSourcePermissions(property.provenance.sourceId);
    return projectInitialProperty(property, rights.listingTextDisplayAllowed);
  }
  public async getListing(id: string): Promise<ListingResponse | null> {
    const property = await this.repository.getListing(id);
    if (!property) return this.prepared.getListing(id);
    const rights = await this.collection.getSourcePermissions(property.provenance.sourceId);
    const response = projectInitialProperty(property, rights.listingTextDisplayAllowed);
    return { metadata: response.metadata, listing: response.property.listings[0]! };
  }
}
