import { Global, Inject, Logger, Module, type OnApplicationShutdown } from '@nestjs/common';
import { DATABASE_AVAILABILITY_PROBE } from '@rei/application';
import { DatabaseConnection, PostgresAvailabilityProbe } from '@rei/infrastructure';

import { readConfig } from '../config';

export const DATABASE_CONNECTION = Symbol.for('rei.DatabaseConnection');

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
      provide: DATABASE_AVAILABILITY_PROBE,
      inject: [DATABASE_CONNECTION],
      useFactory: (connection: DatabaseConnection): PostgresAvailabilityProbe => {
        const logger = new Logger('PostgresAvailabilityProbe');
        // The message is safe to log because the adapter redacts credentials.
        return new PostgresAvailabilityProbe(connection, (error) => logger.warn(error.message));
      },
    },
  ],
  exports: [DATABASE_CONNECTION, DATABASE_AVAILABILITY_PROBE],
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
