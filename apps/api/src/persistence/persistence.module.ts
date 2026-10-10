import { Global, Inject, Logger, Module, type OnApplicationShutdown } from '@nestjs/common';
import {
  DATABASE_AVAILABILITY_PROBE,
  OUTBOX_APPEND_PORT,
  TRANSACTION_RUNNER,
  UUID_V7_GENERATOR,
} from '@rei/application';
import {
  DatabaseConnection,
  PostgresAvailabilityProbe,
  PostgresOutbox,
  PostgresTransactionRunner,
  PostgresUuidV7Generator,
} from '@rei/infrastructure';

import { readConfig } from '../config';

export const DATABASE_CONNECTION = Symbol.for('rei.DatabaseConnection');
const POSTGRES_OUTBOX = Symbol('PostgresOutbox');

@Global()
@Module({
  providers: [
    {
      provide: DATABASE_CONNECTION,
      useFactory: (): DatabaseConnection => {
        const logger = new Logger('DatabaseConnection');
        return new DatabaseConnection(readConfig(process.env).databaseUrl, (error) =>
          // Raised on an idle connection, typically when the server restarts.
          logger.warn(error.message),
        );
      },
    },
    {
      provide: TRANSACTION_RUNNER,
      inject: [DATABASE_CONNECTION],
      useFactory: (connection: DatabaseConnection): PostgresTransactionRunner =>
        new PostgresTransactionRunner(connection),
    },
    {
      provide: UUID_V7_GENERATOR,
      inject: [DATABASE_CONNECTION],
      useFactory: (connection: DatabaseConnection): PostgresUuidV7Generator =>
        new PostgresUuidV7Generator(connection),
    },
    {
      provide: POSTGRES_OUTBOX,
      inject: [DATABASE_CONNECTION],
      useFactory: (connection: DatabaseConnection): PostgresOutbox =>
        new PostgresOutbox(connection),
    },
    { provide: OUTBOX_APPEND_PORT, useExisting: POSTGRES_OUTBOX },
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
    OUTBOX_APPEND_PORT,
    TRANSACTION_RUNNER,
    UUID_V7_GENERATOR,
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
