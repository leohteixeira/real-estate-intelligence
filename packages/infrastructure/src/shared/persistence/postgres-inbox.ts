import type { Inbox, InboxRetentionPort, Transaction } from '@rei/application';
import type { UuidV7 } from '@rei/domain';

import type { DatabaseConnection } from './database-connection.js';
import { postgresClientFor } from './postgres-transaction.js';
import { redactConnectionError } from './redact.js';

export class PostgresInbox implements Inbox, InboxRetentionPort {
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

  public async pruneConsumed(
    retentionMs: number,
    batchSize: number,
    signal: AbortSignal,
  ): Promise<number> {
    if (!Number.isSafeInteger(retentionMs) || retentionMs < 1) {
      throw new Error('Retention duration must be a positive integer.');
    }
    if (!Number.isSafeInteger(batchSize) || batchSize < 1 || batchSize > 10_000) {
      throw new Error('Retention batch size must be between 1 and 10000.');
    }
    try {
      const rows = await this.connection.queryAbortable<{ event_id: string }>(
        `WITH eligible AS (
           SELECT candidate.consumer_name, candidate.event_id
             FROM platform.inbox AS candidate
            WHERE candidate.received_at < clock_timestamp() - ($1 * interval '1 millisecond')
              AND NOT EXISTS (
                SELECT 1
                  FROM platform.outbox AS pending
                 WHERE pending.event_id = candidate.event_id
                   AND pending.published_at IS NULL
              )
            ORDER BY candidate.received_at, candidate.consumer_name, candidate.event_id
            LIMIT $2
            FOR UPDATE OF candidate SKIP LOCKED
         )
         DELETE FROM platform.inbox AS expired
          USING eligible
          WHERE expired.consumer_name = eligible.consumer_name
            AND expired.event_id = eligible.event_id
        RETURNING expired.event_id::text`,
        [retentionMs, batchSize],
        signal,
      );
      return rows.length;
    } catch (error) {
      if (signal.aborted) throw error;
      throw redactConnectionError(error);
    }
  }
}
