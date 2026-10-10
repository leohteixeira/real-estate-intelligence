import type {
  ListingResponse,
  PageQuery,
  PropertyResponse,
  ReductionsResponse,
  SearchQuery,
  SearchResponse,
} from '@rei/domain';
export const PROPERTIES_FACADE = Symbol.for('rei.PropertiesFacade');
/** Read-only public boundary; adapters do not ingest or publish events. */
export interface PropertiesFacade {
  search(query: SearchQuery): Promise<SearchResponse>;
  getProperty(id: string): Promise<PropertyResponse | null>;
  getListing(id: string): Promise<ListingResponse | null>;
  largestReductions(placeId: string, query: PageQuery): Promise<ReductionsResponse | null>;
}
