import { Module } from '@nestjs/common';
import {
  LOCATIONS_FACADE,
  MARKET_FACADE,
  MarketQueryService,
  type LocationsFacade,
} from '@rei/application';
import { SyntheticMarketAdapter } from '@rei/infrastructure';
import { LocationsReferenceModule } from '../locations-reference.module';
import { MarketController } from './market.controller';

@Module({
  imports: [LocationsReferenceModule],
  controllers: [MarketController],
  providers: [
    {
      provide: MARKET_FACADE,
      inject: [LOCATIONS_FACADE],
      useFactory: (locations: LocationsFacade) =>
        new MarketQueryService(new SyntheticMarketAdapter(), locations),
    },
  ],
  exports: [MARKET_FACADE],
})
export class MarketModule {}
