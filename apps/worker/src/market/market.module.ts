import { Module } from '@nestjs/common';
import {
  ConsumeMarketListing,
  INBOX,
  MARKET_PRICE_FACTS,
  TRANSACTION_RUNNER,
  type Inbox,
  type TransactionRunner,
  type MarketPriceFactsProjectionPort,
} from '@rei/application';
import { PostgresMarketPriceFacts, type DatabaseConnection } from '@rei/infrastructure';
import { DATABASE_CONNECTION } from '../persistence.module';
import { MarketListingConsumer } from './market-listing.consumer';

@Module({
  providers: [
    {
      provide: MARKET_PRICE_FACTS,
      inject: [DATABASE_CONNECTION],
      useFactory: (connection: DatabaseConnection) => new PostgresMarketPriceFacts(connection),
    },
    {
      provide: ConsumeMarketListing,
      inject: [MARKET_PRICE_FACTS, TRANSACTION_RUNNER, INBOX],
      useFactory: (
        facts: MarketPriceFactsProjectionPort,
        transactions: TransactionRunner,
        inbox: Inbox,
      ) => new ConsumeMarketListing(facts, transactions, inbox),
    },
    MarketListingConsumer,
  ],
  exports: [MarketListingConsumer],
})
export class MarketModule {}
