import { Inject, Module, type OnModuleInit } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import {
  COLLECTION_FACADE,
  PROPERTIES_FACADE,
  LOCATIONS_FACADE,
  LargestReductionsService,
  SearchPropertiesService,
  PROPERTY_SEARCH,
  type LocationsFacade,
  type CollectionFacade,
} from '@rei/application';
import {
  PersistedPropertiesFacade,
  PostgresPropertyRepository,
  PostgresListingSuppression,
  PostgresPropertySearchRepository,
  PostgresListingHistoryRepository,
  PostgresPropertyReductionsRepository,
  SyntheticPropertiesAdapter,
  type DatabaseConnection,
} from '@rei/infrastructure';
import { CollectionModule } from '../collection/index';
import { LocationsReferenceModule } from '../locations-reference.module';
import { PersistenceModule, DATABASE_CONNECTION } from '../persistence/persistence.module';
import { ListingsController, PropertiesController } from './properties.controller';
import { rejectUnprefixedReadPaths } from '../http/unprefixed-read-paths';

@Module({
  imports: [PersistenceModule, CollectionModule, LocationsReferenceModule],
  controllers: [PropertiesController, ListingsController],
  providers: [
    {
      provide: PROPERTY_SEARCH,
      inject: [DATABASE_CONNECTION, LOCATIONS_FACADE],
      useFactory: (connection: DatabaseConnection, locations: LocationsFacade) =>
        new SearchPropertiesService(new PostgresPropertySearchRepository(connection), locations, {
          now: () => new Date().toISOString(),
        }),
    },
    {
      provide: PROPERTIES_FACADE,
      inject: [DATABASE_CONNECTION, COLLECTION_FACADE, LOCATIONS_FACADE, PROPERTY_SEARCH],
      useFactory: (
        connection: DatabaseConnection,
        collection: CollectionFacade,
        locations: LocationsFacade,
        search: Pick<SearchPropertiesService, 'execute'>,
      ) =>
        new PersistedPropertiesFacade(
          new PostgresPropertyRepository(connection),
          collection,
          new SyntheticPropertiesAdapter(),
          new PostgresListingHistoryRepository(connection),
          new LargestReductionsService(
            new PostgresPropertyReductionsRepository(connection),
            locations,
            { now: () => new Date().toISOString() },
          ),
          search,
          new PostgresListingSuppression(connection),
        ),
    },
  ],
  exports: [PROPERTIES_FACADE],
})
export class PropertiesModule implements OnModuleInit {
  public constructor(@Inject(HttpAdapterHost) private readonly adapter: HttpAdapterHost) {}
  public onModuleInit(): void {
    rejectUnprefixedReadPaths(this.adapter, ['properties', 'listings']);
  }
}
