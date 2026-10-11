import { Module } from '@nestjs/common';
import { LOCATIONS_FACADE } from '@rei/application';
import { PostgresLocationsFacade, type DatabaseConnection } from '@rei/infrastructure';
import { DATABASE_CONNECTION, PersistenceModule } from './persistence/persistence.module';

/** Reference provider shared by controllers and Properties without a module cycle. */
@Module({
  imports: [PersistenceModule],
  providers: [
    {
      provide: LOCATIONS_FACADE,
      inject: [DATABASE_CONNECTION],
      useFactory: (database: DatabaseConnection) => new PostgresLocationsFacade(database),
    },
  ],
  exports: [LOCATIONS_FACADE],
})
export class LocationsReferenceModule {}
