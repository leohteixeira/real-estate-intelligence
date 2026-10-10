import { Module } from '@nestjs/common';
import { LOCATIONS_FACADE } from '@rei/application';
import { SyntheticLocationsAdapter } from '@rei/infrastructure';

@Module({
  providers: [{ provide: LOCATIONS_FACADE, useClass: SyntheticLocationsAdapter }],
  exports: [LOCATIONS_FACADE],
})
export class LocationsModule {}
