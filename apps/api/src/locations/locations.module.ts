import { Module } from '@nestjs/common';
import { PropertiesModule } from '../properties/index';
import { LocationsController } from './locations.controller';
import { LocationsReferenceModule } from '../locations-reference.module';

@Module({
  imports: [PropertiesModule, LocationsReferenceModule],
  controllers: [LocationsController],
  exports: [LocationsReferenceModule],
})
export class LocationsModule {}
