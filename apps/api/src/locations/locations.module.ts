import { Inject, Module, type OnModuleInit } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { LOCATIONS_FACADE } from '@rei/application';
import { SyntheticLocationsAdapter } from '@rei/infrastructure';
import { PropertiesModule } from '../properties/index';
import { LocationsController } from './locations.controller';
import { rejectUnprefixedReadPaths } from '../http/unprefixed-read-paths';

@Module({
  imports: [PropertiesModule],
  controllers: [LocationsController],
  providers: [{ provide: LOCATIONS_FACADE, useFactory: () => new SyntheticLocationsAdapter() }],
  exports: [LOCATIONS_FACADE],
})
export class LocationsModule implements OnModuleInit {
  public constructor(@Inject(HttpAdapterHost) private readonly adapter: HttpAdapterHost) {}
  public onModuleInit(): void {
    rejectUnprefixedReadPaths(this.adapter, ['places']);
  }
}
