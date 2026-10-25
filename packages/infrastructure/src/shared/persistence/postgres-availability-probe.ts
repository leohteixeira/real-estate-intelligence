import type { DatabaseAvailabilityProbe } from '@rei/application';

import type { DatabaseConnection } from './database-connection.js';

/** PostgreSQL adapter for {@link DatabaseAvailabilityProbe}. */
export class PostgresAvailabilityProbe implements DatabaseAvailabilityProbe {
  public constructor(
    private readonly connection: Pick<DatabaseConnection, 'queryAbortable'>,
    private readonly onError: (error: Error) => void = () => {},
  ) {}

  public async isAvailable(signal: AbortSignal): Promise<boolean> {
    if (signal.aborted) {
      return false;
    }

    try {
      await this.connection.queryAbortable('SELECT 1', [], signal);
      return !signal.aborted;
    } catch (error) {
      // The message is already redacted by DatabaseConnection.
      this.onError(error instanceof Error ? error : new Error(String(error)));
      return false;
    }
  }
}
