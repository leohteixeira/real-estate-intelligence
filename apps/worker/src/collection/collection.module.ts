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
  SNAPSHOT_SANITIZER,
  SNAPSHOT_LIFECYCLE,
  ExpireSnapshots,
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
  type SnapshotSanitizer,
  type SnapshotLifecycle,
  type SnapshotContentStore,
} from '@rei/application';
import {
  PostgresCollectionRunRepository,
  PostgresCollectionScheduleRepository,
  PostgresSourceRegisterRepository,
  S3RawSnapshotStore,
  CanonicalSnapshotSanitizer,
  PostgresSnapshotLifecycle,
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
import { ResilientListingSource } from './resilient-listing-source';
import { ResilientRawSnapshotStore } from './resilient-raw-snapshot-store';
import { SnapshotRetentionJob } from './snapshot-retention.job';

@Module({
  providers: [
    { provide: SNAPSHOT_SANITIZER, useClass: CanonicalSnapshotSanitizer },
    {
      provide: SNAPSHOT_LIFECYCLE,
      inject: [DATABASE_CONNECTION],
      useFactory: (connection: DatabaseConnection) => new PostgresSnapshotLifecycle(connection),
    },
    {
      provide: ExpireSnapshots,
      inject: [SNAPSHOT_LIFECYCLE, RAW_SNAPSHOT_STORE, CLOCK],
      useFactory: (lifecycle: SnapshotLifecycle, store: SnapshotContentStore, clock: Clock) =>
        new ExpireSnapshots(lifecycle, store, clock),
    },
    SnapshotRetentionJob,
    CollectionAuditConsumer,
    { provide: CLOCK, useValue: { now: (): string => new Date().toISOString() } satisfies Clock },
    {
      provide: LISTING_SOURCE,
      inject: [SOURCE_REGISTER_REPOSITORY],
      useFactory: (register: SourceRegisterRepository): ListingSource =>
        new ResilientListingSource(
          new FixtureListingSourceRouter(
            new SyntheticListingSource(),
            new SyntheticSaoPauloListingSource(
              readScheduledCollectionConfig(process.env).syntheticPageDelayMs,
            ),
          ),
          register,
        ),
    },
    {
      provide: S3RawSnapshotStore,
      inject: [SNAPSHOT_LIFECYCLE, CLOCK],
      useFactory: (lifecycle: SnapshotLifecycle, clock: Clock): S3RawSnapshotStore => {
        const config = readScheduledCollectionConfig(process.env);
        return new S3RawSnapshotStore({
          endpoint: config.objectStoreEndpoint,
          region: config.objectStoreRegion,
          bucket: config.objectStoreBucket,
          accessKeyId: config.objectStoreAccessKeyId,
          secretAccessKey: config.objectStoreSecretAccessKey,
          lifecycle,
          clock,
          reconciliationIntervalMs: config.snapshotRetentionIntervalMs,
          ...(config.snapshotEncryption ? { encryption: config.snapshotEncryption } : {}),
        });
      },
    },
    {
      provide: RAW_SNAPSHOT_STORE,
      inject: [S3RawSnapshotStore],
      useFactory: (adapter: S3RawSnapshotStore) => new ResilientRawSnapshotStore(adapter),
    },
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
        SNAPSHOT_SANITIZER,
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
        sanitizer: SnapshotSanitizer,
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
          sanitizer,
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
  exports: [
    CollectionAuditConsumer,
    CollectionScheduleJob,
    CollectionRunRequestConsumer,
    SnapshotRetentionJob,
  ],
})
export class CollectionModule implements OnApplicationShutdown {
  public constructor(@Inject(S3RawSnapshotStore) private readonly snapshots: S3RawSnapshotStore) {}

  public onApplicationShutdown(): void {
    this.snapshots.destroy();
  }
}
