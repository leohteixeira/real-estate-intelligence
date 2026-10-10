import { Global, Inject, Logger, Module, type OnApplicationShutdown } from '@nestjs/common';
import {
  AUDIT_EVENT_LOG,
  DATABASE_AVAILABILITY_PROBE,
  INBOX,
  INBOX_RETENTION_PORT,
  OUTBOX_RELAY_PORT,
  OUTBOX_RETENTION_PORT,
  TRANSACTION_RUNNER,
} from '@rei/application';
import {
  DatabaseConnection,
  PostgresAuditEventLog,
  PostgresAvailabilityProbe,
  PostgresInbox,
  PostgresOutbox,
  PostgresTransactionRunner,
} from '@rei/infrastructure';

import { readConfig } from './config';

export const DATABASE_CONNECTION = Symbol.for('rei.DatabaseConnection');

@Global()
@Module({
  providers: [
    {
      provide: DATABASE_CONNECTION,
      useFactory: (): DatabaseConnection => {
        const logger = new Logger('DatabaseConnection');
        const config = readConfig(process.env);
        return new DatabaseConnection(
          config.databaseUrl,
          (error) =>
            // Raised on an idle connection, typically when the server restarts.
            logger.warn(error.message),
          config.operationTimeoutMs,
        );
      },
    },
    {
      provide: OUTBOX_RELAY_PORT,
      inject: [DATABASE_CONNECTION],
      useFactory: (connection: DatabaseConnection): PostgresOutbox =>
        new PostgresOutbox(connection),
    },
    { provide: OUTBOX_RETENTION_PORT, useExisting: OUTBOX_RELAY_PORT },
    {
      provide: TRANSACTION_RUNNER,
      inject: [DATABASE_CONNECTION],
      useFactory: (connection: DatabaseConnection): PostgresTransactionRunner =>
        new PostgresTransactionRunner(connection),
    },
    {
      provide: INBOX,
      inject: [DATABASE_CONNECTION],
      useFactory: (connection: DatabaseConnection): PostgresInbox => new PostgresInbox(connection),
    },
    { provide: INBOX_RETENTION_PORT, useExisting: INBOX },
    {
      provide: AUDIT_EVENT_LOG,
      inject: [DATABASE_CONNECTION],
      useFactory: (connection: DatabaseConnection): PostgresAuditEventLog =>
        new PostgresAuditEventLog(connection),
    },
    {
      provide: DATABASE_AVAILABILITY_PROBE,
      inject: [DATABASE_CONNECTION],
      useFactory: (connection: DatabaseConnection): PostgresAvailabilityProbe => {
        const logger = new Logger('PostgresAvailabilityProbe');
        // The message is safe to log because the adapter redacts credentials.
        return new PostgresAvailabilityProbe(connection, (error) => logger.warn(error.message));
      },
    },
  ],
  exports: [
    DATABASE_CONNECTION,
    DATABASE_AVAILABILITY_PROBE,
    TRANSACTION_RUNNER,
    OUTBOX_RELAY_PORT,
    OUTBOX_RETENTION_PORT,
    INBOX,
    INBOX_RETENTION_PORT,
    AUDIT_EVENT_LOG,
  ],
})
export class PersistenceModule implements OnApplicationShutdown {
  // The provider is registered under a symbol token, so the module class has
  // to ask for that token instead of relying on the class as the token.
  public constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly connection: DatabaseConnection,
  ) {}

  public async onApplicationShutdown(): Promise<void> {
    await this.connection.close();
  }
}
