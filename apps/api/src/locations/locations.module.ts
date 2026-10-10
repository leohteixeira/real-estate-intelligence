import { Inject, Module, type OnModuleInit } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { LOCATIONS_FACADE } from '@rei/application';
import { PostgresLocationsFacade, type DatabaseConnection } from '@rei/infrastructure';
import { DATABASE_CONNECTION, PersistenceModule } from '../persistence/persistence.module';
import { PropertiesModule } from '../properties/index';
import { LocationsController } from './locations.controller';
import { rejectUnprefixedReadPaths } from '../http/unprefixed-read-paths';

@Module({
  imports: [PropertiesModule, PersistenceModule],
  controllers: [LocationsController],
  providers: [
    {
      provide: LOCATIONS_FACADE,
      inject: [DATABASE_CONNECTION],
      useFactory: (database: DatabaseConnection) => new PostgresLocationsFacade(database),
    },
  ],
  exports: [LOCATIONS_FACADE],
})
export class LocationsModule implements OnModuleInit {
  public constructor(@Inject(HttpAdapterHost) private readonly adapter: HttpAdapterHost) {}
  public onModuleInit(): void {
    rejectUnprefixedReadPaths(this.adapter, ['places']);
  }
}
