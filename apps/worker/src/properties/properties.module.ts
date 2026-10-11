import { Module } from '@nestjs/common';
import { createHash } from 'node:crypto';
import {
  COLLECTION_FACADE,
  LOCATIONS_FACADE,
  PROPERTY_REPOSITORY,
  TRANSACTION_RUNNER,
  INBOX,
  OUTBOX_APPEND_PORT,
  RETAINED_PUBLICATION_READER,
  UUID_V7_GENERATOR,
  ConsumeParsedListing,
  ConsumeListingCompletion,
  ReconcileListingHistory,
  LISTING_HISTORY_REPOSITORY,
  type ListingHistoryRepository,
  type CollectionHistoryFacade,
  type CollectionFacade,
  type LocationsFacade,
  type PropertyRepository,
  type TransactionRunner,
  type Inbox,
  type OutboxAppendPort,
  type RetainedPublicationReader,
  type UuidV7Generator,
} from '@rei/application';
import {
  PostgresPropertyRepository,
  PostgresListingHistoryRepository,
  type DatabaseConnection,
} from '@rei/infrastructure';
import { DATABASE_CONNECTION } from '../persistence.module';
import { CollectionModule } from '../collection/index';
import { LocationsModule } from '../locations/index';
import { ParsedListingConsumer } from './parsed-listing.consumer';
import { ListingCompletionConsumer } from './listing-completion.consumer';
import { ListingHistoryJob } from './listing-history.job';

@Module({
  imports: [CollectionModule, LocationsModule],
  providers: [
    {
      provide: LISTING_HISTORY_REPOSITORY,
      inject: [DATABASE_CONNECTION],
      useFactory: (connection: DatabaseConnection) =>
        new PostgresListingHistoryRepository(connection),
    },
    {
      provide: ConsumeListingCompletion,
      inject: [COLLECTION_FACADE, LISTING_HISTORY_REPOSITORY, TRANSACTION_RUNNER, INBOX],
      useFactory: (
        collection: CollectionHistoryFacade,
        history: ListingHistoryRepository,
        transactions: TransactionRunner,
        inbox: Inbox,
      ) => new ConsumeListingCompletion(collection, history, transactions, inbox),
    },
    {
      provide: ReconcileListingHistory,
      inject: [
        COLLECTION_FACADE,
        LOCATIONS_FACADE,
        PROPERTY_REPOSITORY,
        LISTING_HISTORY_REPOSITORY,
        TRANSACTION_RUNNER,
        OUTBOX_APPEND_PORT,
        UUID_V7_GENERATOR,
        RETAINED_PUBLICATION_READER,
      ],
      useFactory: (
        collection: CollectionHistoryFacade,
        locations: LocationsFacade,
        repository: PropertyRepository,
        history: ListingHistoryRepository,
        transactions: TransactionRunner,
        outbox: OutboxAppendPort,
        identifiers: UuidV7Generator,
        publications: RetainedPublicationReader,
      ) =>
        new ReconcileListingHistory(
          collection,
          locations,
          repository,
          history,
          transactions,
          outbox,
          identifiers,
          (text) => `sha256:${createHash('sha256').update(text).digest('hex')}`,
          publications,
        ),
    },
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
        LISTING_HISTORY_REPOSITORY,
      ],
      useFactory: (
        collection: CollectionFacade,
        locations: LocationsFacade,
        repository: PropertyRepository,
        transactions: TransactionRunner,
        inbox: Inbox,
        history: ListingHistoryRepository,
      ) =>
        new ConsumeParsedListing(collection, locations, repository, transactions, inbox, history),
    },
    ParsedListingConsumer,
    ListingCompletionConsumer,
    ListingHistoryJob,
  ],
  exports: [ParsedListingConsumer, ListingCompletionConsumer, ListingHistoryJob],
})
export class PropertiesModule {}
