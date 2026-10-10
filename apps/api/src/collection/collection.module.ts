import { Module } from '@nestjs/common';
import { COLLECTION_FACADE, SOURCE_REGISTER_REPOSITORY } from '@rei/application';
import {
  PostgresCollectionFacade,
  PostgresSourceRegisterRepository,
  type DatabaseConnection,
} from '@rei/infrastructure';

import { DATABASE_CONNECTION } from '../persistence/persistence.module';
import { CollectionController } from './collection.controller';

@Module({
  controllers: [CollectionController],
  providers: [
    {
      provide: SOURCE_REGISTER_REPOSITORY,
      inject: [DATABASE_CONNECTION],
      useFactory: (connection: DatabaseConnection): PostgresSourceRegisterRepository =>
        new PostgresSourceRegisterRepository(connection),
    },
    {
      provide: COLLECTION_FACADE,
      inject: [DATABASE_CONNECTION, SOURCE_REGISTER_REPOSITORY],
      useFactory: (
        connection: DatabaseConnection,
        sources: PostgresSourceRegisterRepository,
      ): PostgresCollectionFacade => new PostgresCollectionFacade(connection, sources),
    },
  ],
  exports: [COLLECTION_FACADE],
})
export class CollectionModule {}
