import { Inject, Module, type OnModuleInit } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { LOCATIONS_FACADE } from '@rei/application';
import { PostgresLocationsFacade, type DatabaseConnection } from '@rei/infrastructure';
import { DATABASE_CONNECTION, PersistenceModule } from './persistence/persistence.module';
import { rejectUnprefixedReadPaths } from './http/unprefixed-read-paths';

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
export class LocationsReferenceModule implements OnModuleInit {
  public constructor(@Inject(HttpAdapterHost) private readonly adapter: HttpAdapterHost) {}
  public onModuleInit(): void {
    rejectUnprefixedReadPaths(this.adapter, ['places']);
  }
}
