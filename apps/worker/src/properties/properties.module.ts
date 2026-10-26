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
  ConsumeListingSuppression,
  ConsumeListingCompletion,
  ReconcileListingHistory,
  ReconcilePropertyResolution,
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
  PostgresPropertySuppressionRepository,
  PostgresListingSuppression,
  PostgresOutbox,
  PostgresPropertyResolutionRepository,
  PostgresListingHistoryRepository,
  type DatabaseConnection,
} from '@rei/infrastructure';
import { DATABASE_CONNECTION } from '../persistence.module';
import { CollectionModule } from '../collection/index';
import { LocationsModule } from '../locations/index';
import { ListingSuppressionConsumer } from './listing-suppression.consumer';
import { ParsedListingConsumer } from './parsed-listing.consumer';
import { ListingCompletionConsumer } from './listing-completion.consumer';
import { ListingHistoryJob } from './listing-history.job';

@Module({
  imports: [CollectionModule, LocationsModule],
  providers: [
    {
      provide: ConsumeListingSuppression,
      inject: [
        DATABASE_CONNECTION,
        TRANSACTION_RUNNER,
        INBOX,
        OUTBOX_APPEND_PORT,
        UUID_V7_GENERATOR,
      ],
      useFactory: (
        connection: DatabaseConnection,
        transactions: TransactionRunner,
        inbox: Inbox,
        outbox: OutboxAppendPort,
        identifiers: UuidV7Generator,
      ) =>
        new ConsumeListingSuppression(
          new PostgresListingSuppression(connection),
          new PostgresPropertySuppressionRepository(connection, new PostgresOutbox(connection)),
          transactions,
          inbox,
          outbox,
          identifiers,
        ),
    },
    {
      provide: ReconcilePropertyResolution,
      inject: [DATABASE_CONNECTION, TRANSACTION_RUNNER, OUTBOX_APPEND_PORT, UUID_V7_GENERATOR],
      useFactory: (
        connection: DatabaseConnection,
        transactions: TransactionRunner,
        outbox: OutboxAppendPort,
        identifiers: UuidV7Generator,
      ) =>
        new ReconcilePropertyResolution(
          new PostgresPropertyResolutionRepository(connection, outbox, identifiers),
          transactions,
        ),
    },
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
        DATABASE_CONNECTION,
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
        connection: DatabaseConnection,
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
          new PostgresListingSuppression(connection),
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
        DATABASE_CONNECTION,
      ],
      useFactory: (
        collection: CollectionFacade,
        locations: LocationsFacade,
        repository: PropertyRepository,
        transactions: TransactionRunner,
        inbox: Inbox,
        history: ListingHistoryRepository,
        connection: DatabaseConnection,
      ) =>
        new ConsumeParsedListing(
          collection,
          locations,
          repository,
          transactions,
          inbox,
          history,
          new PostgresListingSuppression(connection),
        ),
    },
    ListingSuppressionConsumer,
    ParsedListingConsumer,
    ListingCompletionConsumer,
    ListingHistoryJob,
  ],
  exports: [
    ParsedListingConsumer,
    ListingSuppressionConsumer,
    ListingCompletionConsumer,
    ListingHistoryJob,
  ],
})
export class PropertiesModule {}
