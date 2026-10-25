import { Inject, Module, type OnApplicationShutdown } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import {
  RemoveListing,
  OUTBOX_APPEND_PORT,
  TRANSACTION_RUNNER,
  UUID_V7_GENERATOR,
  type OutboxAppendPort,
  type TransactionRunner,
  type UuidV7Generator,
} from '@rei/application';
import {
  PostgresListingSuppression,
  PostgresSourceRegisterRepository,
  PostgresOutbox,
  PostgresAuditEventLog,
  PostgresSnapshotLifecycle,
  S3RawSnapshotStore,
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
      provide: RemoveListing,
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
        return new RemoveListing(
          new PostgresListingSuppression(connection),
          new PostgresSourceRegisterRepository(connection),
          { delete: (key, signal, deadline) => resilient.delete(key, signal, deadline) },
          [new PostgresOutbox(connection), new PostgresAuditEventLog(connection)],
          transactions,
          identifiers,
          { now: () => new Date().toISOString() },
          outbox,
        );
      },
    },
  ],
  exports: [RemoveListing],
})
export class ListingRemovalCommandModule implements OnApplicationShutdown {
  public constructor(@Inject(S3RawSnapshotStore) private readonly snapshots: S3RawSnapshotStore) {}
  public onApplicationShutdown() {
    this.snapshots.destroy();
  }
}
