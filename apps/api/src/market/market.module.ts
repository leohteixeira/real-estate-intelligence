import { Module } from '@nestjs/common';
import {
  LOCATIONS_FACADE,
  MARKET_FACADE,
  MarketQueryService,
  MARKET_CALCULATION_FACADE,
  PricePerSquareMeterService,
  type LocationsFacade,
} from '@rei/application';
import {
  SyntheticMarketAdapter,
  PostgresMarketPriceFacts,
  type DatabaseConnection,
} from '@rei/infrastructure';
import { DATABASE_CONNECTION } from '../persistence/persistence.module';
import { LocationsReferenceModule } from '../locations-reference.module';
import { MarketController } from './market.controller';

@Module({
  imports: [LocationsReferenceModule],
  controllers: [MarketController],
  providers: [
    { provide: MARKET_CALCULATION_FACADE, useFactory: () => new PricePerSquareMeterService() },
    {
      provide: MARKET_FACADE,
      inject: [LOCATIONS_FACADE, DATABASE_CONNECTION],
      useFactory: (locations: LocationsFacade, connection: DatabaseConnection) =>
        new MarketQueryService(new SyntheticMarketAdapter(), locations, {
          facts: new PostgresMarketPriceFacts(connection),
          clock: { now: () => new Date().toISOString() },
        }),
    },
  ],
  exports: [MARKET_FACADE, MARKET_CALCULATION_FACADE],
})
export class MarketModule {}
