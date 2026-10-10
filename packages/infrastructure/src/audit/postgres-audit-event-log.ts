import type { AuditEventLog, EventEnvelope } from '@rei/application';

import type { DatabaseConnection } from '../shared/persistence/database-connection.js';
import { redactConnectionError } from '../shared/persistence/redact.js';

export class PostgresAuditEventLog implements AuditEventLog {
  public constructor(private readonly connection: DatabaseConnection) {}

  public async append(event: EventEnvelope): Promise<void> {
    try {
      const rows = await this.connection.query<{ event_id: string }>(
        `INSERT INTO audit.event_log
           (event_id, event_type, event_version, aggregate_id, occurred_at, trace_context, payload)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
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
      if (rows.length !== 1 || rows[0]?.event_id !== event.eventId) {
        throw new Error('Audit event append did not commit the expected event.');
      }
    } catch (error) {
      throw redactConnectionError(error);
    }
  }
}
