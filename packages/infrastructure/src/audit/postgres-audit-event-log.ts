import type { AuditEventLog, EventEnvelope, Transaction } from '@rei/application';

import type { DatabaseConnection } from '../shared/persistence/database-connection.js';
import { postgresClientFor } from '../shared/persistence/postgres-transaction.js';
import { redactConnectionError } from '../shared/persistence/redact.js';

export class PostgresAuditEventLog implements AuditEventLog {
  public constructor(private readonly connection: DatabaseConnection) {}

  public async eraseListingCopies(
    transaction: Transaction,
    identity: import('@rei/application').ListingIdentity,
  ): Promise<void> {
    const client = postgresClientFor(transaction, this.connection);
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [
      JSON.stringify(['audit.collection-erasure', identity.sourceId, identity.sourceListingId]),
    ]);
    await client.query(
      'INSERT INTO audit.collection_erasure (source_id,source_listing_id) VALUES ($1,$2) ON CONFLICT DO NOTHING',
      [identity.sourceId, identity.sourceListingId],
    );
    await client.query("SELECT set_config('audit.collection_erasure_identity',$1,true)", [
      JSON.stringify(identity),
    ]);
    await client.query(
      `DELETE FROM audit.event_log WHERE event_type='collection.snapshot.parsed' AND payload->'source'->>'sourceId'=$1 AND payload->'source'->>'sourceListingId'=$2`,
      [identity.sourceId, identity.sourceListingId],
    );
    await client.query("SELECT set_config('audit.collection_erasure_identity','',true)");
  }

  public async append(transaction: Transaction, event: EventEnvelope): Promise<void> {
    const client = postgresClientFor(transaction, this.connection);
    try {
      if (event.type === 'collection.snapshot.parsed') {
        const source = event.payload.source;
        if (source && typeof source === 'object' && !Array.isArray(source)) {
          const sourceId = Reflect.get(source, 'sourceId');
          const sourceListingId = Reflect.get(source, 'sourceListingId');
          await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [
            JSON.stringify(['audit.collection-erasure', sourceId, sourceListingId]),
          ]);
          if (
            (
              await client.query(
                'SELECT 1 FROM audit.collection_erasure WHERE source_id=$1 AND source_listing_id=$2',
                [sourceId, sourceListingId],
              )
            ).length
          )
            return;
        }
      }
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
