import { Global, Inject, Module, type OnApplicationShutdown } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import {
  CLOCK,
  COLLECTION_RUN_REPOSITORY,
  CollectSourceOnce,
  LISTING_SOURCE,
  OUTBOX_APPEND_PORT,
  RAW_SNAPSHOT_STORE,
  TRANSACTION_RUNNER,
  UUID_V7_GENERATOR,
  type Clock,
  type CollectionRunRepository,
  type ListingSource,
  type OutboxAppendPort,
  type RawSnapshotStore,
  type TransactionRunner,
  type UuidV7Generator,
} from '@rei/application';
import {
  PostgresCollectionRunRepository,
  S3RawSnapshotStore,
  SyntheticListingSource,
  type DatabaseConnection,
} from '@rei/infrastructure';

import { readCollectionCommandConfig } from '../config';
import { DATABASE_CONNECTION, PersistenceModule } from '../persistence.module';

@Global()
@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }), PersistenceModule],
  providers: [
    {
      provide: CLOCK,
      useValue: { now: (): string => new Date().toISOString() } satisfies Clock,
    },
    SyntheticListingSource,
    { provide: LISTING_SOURCE, useExisting: SyntheticListingSource },
    {
      provide: S3RawSnapshotStore,
      useFactory: (): S3RawSnapshotStore => {
        const config = readCollectionCommandConfig(process.env);
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
      provide: COLLECTION_RUN_REPOSITORY,
      inject: [DATABASE_CONNECTION],
      useFactory: (connection: DatabaseConnection): PostgresCollectionRunRepository =>
        new PostgresCollectionRunRepository(connection),
    },
    {
      provide: CollectSourceOnce,
      inject: [
        LISTING_SOURCE,
        RAW_SNAPSHOT_STORE,
        COLLECTION_RUN_REPOSITORY,
        TRANSACTION_RUNNER,
        UUID_V7_GENERATOR,
        CLOCK,
        OUTBOX_APPEND_PORT,
      ],
      useFactory: (
        source: ListingSource,
        snapshots: RawSnapshotStore,
        runs: CollectionRunRepository,
        transactions: TransactionRunner,
        identifiers: UuidV7Generator,
        clock: Clock,
        outbox: OutboxAppendPort,
      ): CollectSourceOnce =>
        new CollectSourceOnce(source, snapshots, runs, transactions, identifiers, clock, outbox),
    },
  ],
  exports: [CollectSourceOnce],
})
export class CollectionCommandModule implements OnApplicationShutdown {
  public constructor(@Inject(S3RawSnapshotStore) private readonly snapshots: S3RawSnapshotStore) {}

  public onApplicationShutdown(): void {
    this.snapshots.destroy();
  }
}
