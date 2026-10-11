import { Inject, Module, type OnModuleInit } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { PropertiesModule } from '../properties/index';
import { LocationsController } from './locations.controller';
import { rejectUnprefixedReadPaths } from '../http/unprefixed-read-paths';
import { LocationsReferenceModule } from '../locations-reference.module';

@Module({
  imports: [PropertiesModule, LocationsReferenceModule],
  controllers: [LocationsController],
  exports: [LocationsReferenceModule],
})
export class LocationsModule implements OnModuleInit {
  public constructor(@Inject(HttpAdapterHost) private readonly adapter: HttpAdapterHost) {}
  public onModuleInit(): void {
    rejectUnprefixedReadPaths(this.adapter, ['places']);
  }
}
