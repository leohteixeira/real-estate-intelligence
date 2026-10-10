import type { Inbox, Transaction } from '@rei/application';
import type { UuidV7 } from '@rei/domain';

import type { DatabaseConnection } from './database-connection.js';
import { postgresClientFor } from './postgres-transaction.js';
import { redactConnectionError } from './redact.js';

export class PostgresInbox implements Inbox {
  public constructor(private readonly connection: DatabaseConnection) {}

  public async record(
    transaction: Transaction,
    consumerName: string,
    eventId: UuidV7,
  ): Promise<boolean> {
    const client = postgresClientFor(transaction, this.connection);
    try {
      const rows = await client.query<{ event_id: string }>(
        `INSERT INTO platform.inbox (consumer_name, event_id)
         VALUES ($1, $2)
         ON CONFLICT (consumer_name, event_id) DO NOTHING
         RETURNING event_id::text`,
        [consumerName, eventId],
      );
      return rows.length === 1;
    } catch (error) {
      throw redactConnectionError(error);
    }
  }
}
