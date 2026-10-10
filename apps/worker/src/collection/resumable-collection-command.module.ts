import { Global, Inject, Module, type OnApplicationShutdown } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import {
  CLOCK,
  COLLECTION_RUN_REPOSITORY,
  CollectSourceRun,
  LISTING_SOURCE,
  OUTBOX_APPEND_PORT,
  RAW_SNAPSHOT_STORE,
  SNAPSHOT_SANITIZER,
  SOURCE_REGISTER_REPOSITORY,
  TRANSACTION_RUNNER,
  UUID_V7_GENERATOR,
  type Clock,
  type CollectionRunRepository,
  type ListingSource,
  type OutboxAppendPort,
  type RawSnapshotStore,
  type SourceRegisterRepository,
  type TransactionRunner,
  type UuidV7Generator,
  type SnapshotSanitizer,
} from '@rei/application';
import {
  PostgresCollectionRunRepository,
  PostgresSourceRegisterRepository,
  S3RawSnapshotStore,
  CanonicalSnapshotSanitizer,
  PostgresSnapshotLifecycle,
  SyntheticSaoPauloListingSource,
  type DatabaseConnection,
} from '@rei/infrastructure';

import { readCollectionCommandConfig } from '../config';
import { DATABASE_CONNECTION, PersistenceModule } from '../persistence.module';
import { ResilienceTelemetry } from '../shared/resilience/resilience-telemetry';
import { ResilientListingSource } from './resilient-listing-source';
import { ResilientRawSnapshotStore } from './resilient-raw-snapshot-store';

@Global()
@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }), PersistenceModule],
  providers: [
    { provide: SNAPSHOT_SANITIZER, useClass: CanonicalSnapshotSanitizer },
    ResilienceTelemetry,
    { provide: CLOCK, useValue: { now: (): string => new Date().toISOString() } satisfies Clock },
    {
      provide: SyntheticSaoPauloListingSource,
      useFactory: (): SyntheticSaoPauloListingSource =>
        new SyntheticSaoPauloListingSource(
          readCollectionCommandConfig(process.env).syntheticPageDelayMs,
        ),
    },
    {
      provide: LISTING_SOURCE,
      inject: [SyntheticSaoPauloListingSource, SOURCE_REGISTER_REPOSITORY],
      useFactory: (adapter: SyntheticSaoPauloListingSource, register: SourceRegisterRepository) =>
        new ResilientListingSource(adapter, register),
    },
    {
      provide: S3RawSnapshotStore,
      inject: [DATABASE_CONNECTION, CLOCK],
      useFactory: (connection: DatabaseConnection, clock: Clock): S3RawSnapshotStore => {
        const config = readCollectionCommandConfig(process.env);
        return new S3RawSnapshotStore({
          endpoint: config.objectStoreEndpoint,
          region: config.objectStoreRegion,
          bucket: config.objectStoreBucket,
          accessKeyId: config.objectStoreAccessKeyId,
          secretAccessKey: config.objectStoreSecretAccessKey,
          lifecycle: new PostgresSnapshotLifecycle(connection),
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
      useFactory: (connection: DatabaseConnection) =>
        new PostgresSourceRegisterRepository(connection),
    },
    {
      provide: COLLECTION_RUN_REPOSITORY,
      inject: [DATABASE_CONNECTION],
      useFactory: (connection: DatabaseConnection) =>
        new PostgresCollectionRunRepository(connection),
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
      ) =>
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
  ],
  exports: [CollectSourceRun],
})
export class ResumableCollectionCommandModule implements OnApplicationShutdown {
  public constructor(@Inject(S3RawSnapshotStore) private readonly snapshots: S3RawSnapshotStore) {}

  public onApplicationShutdown(): void {
    this.snapshots.destroy();
  }
}
