import { Inject, Module, type OnModuleInit } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { PROPERTIES_FACADE } from '@rei/application';
import { SyntheticPropertiesAdapter } from '@rei/infrastructure';
import { ListingsController, PropertiesController } from './properties.controller';
import { rejectUnprefixedReadPaths } from '../http/unprefixed-read-paths';

@Module({
  controllers: [PropertiesController, ListingsController],
  providers: [{ provide: PROPERTIES_FACADE, useFactory: () => new SyntheticPropertiesAdapter() }],
  exports: [PROPERTIES_FACADE],
})
export class PropertiesModule implements OnModuleInit {
  public constructor(@Inject(HttpAdapterHost) private readonly adapter: HttpAdapterHost) {}
  public onModuleInit(): void {
    rejectUnprefixedReadPaths(this.adapter, ['properties', 'listings']);
  }
}
