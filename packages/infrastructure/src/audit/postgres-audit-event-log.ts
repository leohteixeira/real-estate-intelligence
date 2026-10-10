import type { AuditEventLog, EventEnvelope, Transaction } from '@rei/application';

import type { DatabaseConnection } from '../shared/persistence/database-connection.js';
import { postgresClientFor } from '../shared/persistence/postgres-transaction.js';
import { redactConnectionError } from '../shared/persistence/redact.js';

export class PostgresAuditEventLog implements AuditEventLog {
  public constructor(private readonly connection: DatabaseConnection) {}

  public async append(transaction: Transaction, event: EventEnvelope): Promise<void> {
    const client = postgresClientFor(transaction, this.connection);
    try {
      const rows = await client.query<{ event_id: string }>(
        `INSERT INTO audit.event_log
           (event_id, event_type, event_version, aggregate_id, occurred_at, trace_context, payload)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (event_id) DO NOTHING
         RETURNING event_id::text`,
        [
          event.eventId,
          event.type,
          event.version,
          event.aggregateId,
          event.occurredAt,
          event.traceContext,
          event.payload,
        ],
      );
      if (rows.length === 1 && rows[0]?.event_id === event.eventId) {
        return;
      }

      const matchingRows = await client.query<{ event_id: string }>(
        `SELECT event_id::text
           FROM audit.event_log
          WHERE event_id = $1
            AND event_type = $2
            AND event_version = $3
            AND aggregate_id = $4
            AND occurred_at = $5
            AND trace_context IS NOT DISTINCT FROM $6::jsonb
            AND payload = $7::jsonb`,
        [
          event.eventId,
          event.type,
          event.version,
          event.aggregateId,
          event.occurredAt,
          event.traceContext,
          event.payload,
        ],
      );
      if (matchingRows.length !== 1 || matchingRows[0]?.event_id !== event.eventId) {
        throw new Error('Audit event ID is already used by a different canonical event.');
      }
    } catch (error) {
      throw redactConnectionError(error);
    }
  }
}
