import { Inject, Module, type OnApplicationShutdown } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import {
  ReparseSnapshot,
  OUTBOX_APPEND_PORT,
  TRANSACTION_RUNNER,
  UUID_V7_GENERATOR,
  type OutboxAppendPort,
  type TransactionRunner,
  type UuidV7Generator,
} from '@rei/application';
import {
  CanonicalSnapshotSanitizer,
  PostgresSnapshotLifecycle,
  PostgresSnapshotReparseRepository,
  S3RawSnapshotStore,
  canonicalCorrectionParser,
  type DatabaseConnection,
} from '@rei/infrastructure';
import { readCollectionCommandConfig } from '../config';
import { DATABASE_CONNECTION, PersistenceModule } from '../persistence.module';
import { ResilientRawSnapshotStore } from './resilient-raw-snapshot-store';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }), PersistenceModule],
  providers: [
    {
      provide: S3RawSnapshotStore,
      inject: [DATABASE_CONNECTION],
      useFactory: (connection: DatabaseConnection) => {
        const config = readCollectionCommandConfig(process.env);
        return new S3RawSnapshotStore({
          endpoint: config.objectStoreEndpoint,
          region: config.objectStoreRegion,
          bucket: config.objectStoreBucket,
          accessKeyId: config.objectStoreAccessKeyId,
          secretAccessKey: config.objectStoreSecretAccessKey,
          lifecycle: new PostgresSnapshotLifecycle(connection),
          clock: { now: () => new Date().toISOString() },
          ...(config.snapshotEncryption ? { encryption: config.snapshotEncryption } : {}),
        });
      },
    },
    {
      provide: ReparseSnapshot,
      inject: [
        S3RawSnapshotStore,
        DATABASE_CONNECTION,
        TRANSACTION_RUNNER,
        UUID_V7_GENERATOR,
        OUTBOX_APPEND_PORT,
      ],
      useFactory: (
        store: S3RawSnapshotStore,
        connection: DatabaseConnection,
        transactions: TransactionRunner,
        identifiers: UuidV7Generator,
        outbox: OutboxAppendPort,
      ) => {
        const resilient = new ResilientRawSnapshotStore(store);
        // The service receives capabilities with no fetch/store/delete properties.
        return new ReparseSnapshot(
          canonicalCorrectionParser,
          { read: (key, signal, deadline) => resilient.read(key, signal, deadline) },
          new PostgresSnapshotReparseRepository(connection),
          transactions,
          identifiers,
          { now: () => new Date().toISOString() },
          outbox,
          new CanonicalSnapshotSanitizer(),
        );
      },
    },
  ],
  exports: [ReparseSnapshot],
})
export class SnapshotReparseCommandModule implements OnApplicationShutdown {
  public constructor(@Inject(S3RawSnapshotStore) private readonly snapshots: S3RawSnapshotStore) {}
  public onApplicationShutdown() {
    this.snapshots.destroy();
  }
}
