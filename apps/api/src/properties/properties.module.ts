import { Inject, Module, type OnModuleInit } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import {
  COLLECTION_FACADE,
  PROPERTIES_FACADE,
  LOCATIONS_FACADE,
  LargestReductionsService,
  type LocationsFacade,
  type CollectionFacade,
} from '@rei/application';
import {
  PersistedPropertiesFacade,
  PostgresPropertyRepository,
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
      provide: PROPERTIES_FACADE,
      inject: [DATABASE_CONNECTION, COLLECTION_FACADE, LOCATIONS_FACADE],
      useFactory: (
        connection: DatabaseConnection,
        collection: CollectionFacade,
        locations: LocationsFacade,
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
