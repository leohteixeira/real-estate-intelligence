import { LocationsQueryService, type LocationsFacade, type Transaction } from '@rei/application';
import type { CollectedListingLocation, PublishedAddress } from '@rei/domain';
import type { DatabaseConnection } from '../shared/index.js';
import { PostgresPlaceRepository } from './postgres-place.repository.js';

export class PostgresLocationsFacade implements LocationsFacade {
  private readonly queries: LocationsQueryService;
  public constructor(database: DatabaseConnection) {
    this.queries = new LocationsQueryService(new PostgresPlaceRepository(database));
  }
  public resolveFixtureAddress(address: CollectedListingLocation, transaction?: Transaction) {
    return this.queries.resolvePublishedAddress(address, transaction);
  }
  public resolvePublishedAddress(address: PublishedAddress) {
    return this.queries.resolvePublishedAddress(address);
  }
  public roots() {
    return this.queries.roots();
  }
  public getPlace(id: string) {
    return this.queries.getPlace(id);
  }
  public children(id: string) {
    return this.queries.children(id);
  }
  public registeredScopeIds(id: string) {
    return this.queries.registeredScopeIds(id);
  }
}
