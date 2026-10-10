import type { ParsedCollectionEvent, ParsedEventEvidence, Transaction } from '@rei/application';
import { COLLECTION_SNAPSHOT_PARSED_TYPE, parseCollectionEvent } from '@rei/domain';
import type { DatabaseConnection } from '../shared/persistence/database-connection.js';
import { postgresClientFor } from '../shared/persistence/postgres-transaction.js';

export class PostgresParsedEventEvidence implements ParsedEventEvidence {
  public constructor(private readonly connection: DatabaseConnection) {}
  public async appendParsedEvidence(
    transaction: Transaction,
    events: readonly ParsedCollectionEvent[],
  ): Promise<void> {
    const client = postgresClientFor(transaction, this.connection);
    for (const untrusted of events) {
      const event = parseCollectionEvent({ ...untrusted });
      if (event.type !== COLLECTION_SNAPSHOT_PARSED_TYPE)
        throw new Error('Only strict parsed publication evidence is accepted.');
      await client.query(
        `INSERT INTO collection.parsed_event_evidence (event_id, snapshot_id, event_version, event)
        VALUES ($1, $2, $3, $4::jsonb)`,
        [event.eventId, event.payload.snapshot.snapshotId, event.version, JSON.stringify(event)],
      );
    }
  }
}
