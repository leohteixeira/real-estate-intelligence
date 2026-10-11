import { Inject, Module, type OnModuleInit } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { COLLECTION_FACADE, PROPERTIES_FACADE, type CollectionFacade } from '@rei/application';
import {
  PersistedPropertiesFacade,
  PostgresPropertyRepository,
  PostgresListingHistoryRepository,
  SyntheticPropertiesAdapter,
  type DatabaseConnection,
} from '@rei/infrastructure';
import { CollectionModule } from '../collection/index';
import { PersistenceModule, DATABASE_CONNECTION } from '../persistence/persistence.module';
import { ListingsController, PropertiesController } from './properties.controller';
import { rejectUnprefixedReadPaths } from '../http/unprefixed-read-paths';

@Module({
  imports: [PersistenceModule, CollectionModule],
  controllers: [PropertiesController, ListingsController],
  providers: [
    {
      provide: PROPERTIES_FACADE,
      inject: [DATABASE_CONNECTION, COLLECTION_FACADE],
      useFactory: (connection: DatabaseConnection, collection: CollectionFacade) =>
        new PersistedPropertiesFacade(
          new PostgresPropertyRepository(connection),
          collection,
          new SyntheticPropertiesAdapter(),
          new PostgresListingHistoryRepository(connection),
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
