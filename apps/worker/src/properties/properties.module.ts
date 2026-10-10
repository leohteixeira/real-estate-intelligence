import { Module } from '@nestjs/common';
import {
  COLLECTION_FACADE,
  LOCATIONS_FACADE,
  PROPERTY_REPOSITORY,
  TRANSACTION_RUNNER,
  INBOX,
  OUTBOX_APPEND_PORT,
  UUID_V7_GENERATOR,
  ConsumeParsedListing,
  type CollectionFacade,
  type LocationsFacade,
  type PropertyRepository,
  type TransactionRunner,
  type Inbox,
  type OutboxAppendPort,
  type UuidV7Generator,
} from '@rei/application';
import { PostgresPropertyRepository, type DatabaseConnection } from '@rei/infrastructure';
import { DATABASE_CONNECTION } from '../persistence.module';
import { CollectionModule } from '../collection/index';
import { LocationsModule } from '../locations/index';
import { ParsedListingConsumer } from './parsed-listing.consumer';

@Module({
  imports: [CollectionModule, LocationsModule],
  providers: [
    {
      provide: PROPERTY_REPOSITORY,
      inject: [DATABASE_CONNECTION],
      useFactory: (connection: DatabaseConnection) => new PostgresPropertyRepository(connection),
    },
    {
      provide: ConsumeParsedListing,
      inject: [
        COLLECTION_FACADE,
        LOCATIONS_FACADE,
        PROPERTY_REPOSITORY,
        TRANSACTION_RUNNER,
        INBOX,
        OUTBOX_APPEND_PORT,
        UUID_V7_GENERATOR,
      ],
      useFactory: (
        collection: CollectionFacade,
        locations: LocationsFacade,
        repository: PropertyRepository,
        transactions: TransactionRunner,
        inbox: Inbox,
        outbox: OutboxAppendPort,
        identifiers: UuidV7Generator,
      ) =>
        new ConsumeParsedListing(
          collection,
          locations,
          repository,
          transactions,
          inbox,
          outbox,
          identifiers,
        ),
    },
    ParsedListingConsumer,
  ],
  exports: [ParsedListingConsumer],
})
export class PropertiesModule {}
