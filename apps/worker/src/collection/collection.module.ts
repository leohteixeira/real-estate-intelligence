import { Inject, Module, type OnApplicationShutdown } from '@nestjs/common';
import {
  CLOCK,
  COLLECTION_RUN_REPOSITORY,
  COLLECTION_SCHEDULE_REPOSITORY,
  CollectSourceRun,
  ConsumeCollectionRunRequest,
  INBOX,
  LISTING_SOURCE,
  OUTBOX_APPEND_PORT,
  RAW_SNAPSHOT_STORE,
  RequestDueCollectionRuns,
  SOURCE_REGISTER_REPOSITORY,
  TRANSACTION_RUNNER,
  UUID_V7_GENERATOR,
  type Clock,
  type CollectionRunRepository,
  type CollectionScheduleRepository,
  type Inbox,
  type ListingSource,
  type OutboxAppendPort,
  type RawSnapshotStore,
  type SourceRegisterRepository,
  type TransactionRunner,
  type UuidV7Generator,
} from '@rei/application';
import {
  PostgresCollectionRunRepository,
  PostgresCollectionScheduleRepository,
  PostgresSourceRegisterRepository,
  S3RawSnapshotStore,
  SyntheticListingSource,
  SyntheticSaoPauloListingSource,
  type DatabaseConnection,
} from '@rei/infrastructure';

import { readScheduledCollectionConfig } from '../config';
import { DATABASE_CONNECTION } from '../persistence.module';
import { CollectionAuditConsumer } from './collection-audit.consumer';
import { CollectionRunLimiter } from './collection-run-limiter';
import { CollectionRunRequestConsumer } from './collection-run-request.consumer';
import { CollectionScheduleJob } from './collection-schedule.job';
import { FixtureListingSourceRouter } from './fixture-listing-source-router';

@Module({
  providers: [
    CollectionAuditConsumer,
    { provide: CLOCK, useValue: { now: (): string => new Date().toISOString() } satisfies Clock },
    {
      provide: LISTING_SOURCE,
      useFactory: (): ListingSource =>
        new FixtureListingSourceRouter(
          new SyntheticListingSource(),
          new SyntheticSaoPauloListingSource(
            readScheduledCollectionConfig(process.env).syntheticPageDelayMs,
          ),
        ),
    },
    {
      provide: S3RawSnapshotStore,
      useFactory: (): S3RawSnapshotStore => {
        const config = readScheduledCollectionConfig(process.env);
        return new S3RawSnapshotStore({
          endpoint: config.objectStoreEndpoint,
          region: config.objectStoreRegion,
          bucket: config.objectStoreBucket,
          accessKeyId: config.objectStoreAccessKeyId,
          secretAccessKey: config.objectStoreSecretAccessKey,
        });
      },
    },
    { provide: RAW_SNAPSHOT_STORE, useExisting: S3RawSnapshotStore },
    {
      provide: SOURCE_REGISTER_REPOSITORY,
      inject: [DATABASE_CONNECTION],
      useFactory: (connection: DatabaseConnection): SourceRegisterRepository =>
        new PostgresSourceRegisterRepository(connection),
    },
    {
      provide: COLLECTION_RUN_REPOSITORY,
      inject: [DATABASE_CONNECTION],
      useFactory: (connection: DatabaseConnection): CollectionRunRepository =>
        new PostgresCollectionRunRepository(connection),
    },
    {
      provide: COLLECTION_SCHEDULE_REPOSITORY,
      inject: [DATABASE_CONNECTION],
      useFactory: (connection: DatabaseConnection): CollectionScheduleRepository =>
        new PostgresCollectionScheduleRepository(connection),
    },
    {
      provide: CollectSourceRun,
      inject: [
        LISTING_SOURCE,
        RAW_SNAPSHOT_STORE,
        SOURCE_REGISTER_REPOSITORY,
        COLLECTION_RUN_REPOSITORY,
        TRANSACTION_RUNNER,
        UUID_V7_GENERATOR,
        CLOCK,
        OUTBOX_APPEND_PORT,
      ],
      useFactory: (
        source: ListingSource,
        snapshots: RawSnapshotStore,
        sources: SourceRegisterRepository,
        runs: CollectionRunRepository,
        transactions: TransactionRunner,
        identifiers: UuidV7Generator,
        clock: Clock,
        outbox: OutboxAppendPort,
      ): CollectSourceRun =>
        new CollectSourceRun(
          source,
          snapshots,
          sources,
          runs,
          transactions,
          identifiers,
          clock,
          outbox,
        ),
    },
    {
      provide: RequestDueCollectionRuns,
      inject: [
        COLLECTION_SCHEDULE_REPOSITORY,
        TRANSACTION_RUNNER,
        UUID_V7_GENERATOR,
        CLOCK,
        OUTBOX_APPEND_PORT,
      ],
      useFactory: (
        schedules: CollectionScheduleRepository,
        transactions: TransactionRunner,
        identifiers: UuidV7Generator,
        clock: Clock,
        outbox: OutboxAppendPort,
      ): RequestDueCollectionRuns =>
        new RequestDueCollectionRuns(schedules, transactions, identifiers, clock, outbox),
    },
    {
      provide: ConsumeCollectionRunRequest,
      inject: [CollectSourceRun, COLLECTION_SCHEDULE_REPOSITORY, TRANSACTION_RUNNER, INBOX],
      useFactory: (
        collector: CollectSourceRun,
        schedules: CollectionScheduleRepository,
        transactions: TransactionRunner,
        inbox: Inbox,
      ): ConsumeCollectionRunRequest =>
        new ConsumeCollectionRunRequest(collector, schedules, transactions, inbox),
    },
    {
      provide: CollectionRunLimiter,
      useFactory: (): CollectionRunLimiter =>
        new CollectionRunLimiter(readScheduledCollectionConfig(process.env).concurrency),
    },
    CollectionScheduleJob,
    CollectionRunRequestConsumer,
  ],
  exports: [CollectionAuditConsumer, CollectionScheduleJob, CollectionRunRequestConsumer],
})
export class CollectionModule implements OnApplicationShutdown {
  public constructor(@Inject(S3RawSnapshotStore) private readonly snapshots: S3RawSnapshotStore) {}

  public onApplicationShutdown(): void {
    this.snapshots.destroy();
  }
}
