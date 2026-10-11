import type {
  EventEnvelope,
  OutboxAppendPort,
  OutboxRelayPort,
  OutboxRetentionPort,
  OutboxRow,
  RetainedPublicationReader,
  Transaction,
} from '@rei/application';
import { DomainEvent, type DomainEventInput, type EventPayload, type UuidV7 } from '@rei/domain';

import type { DatabaseConnection } from './database-connection.js';
import { postgresClientFor } from './postgres-transaction.js';
import { redactConnectionError } from './redact.js';
import { runOutboxAppendSpan } from '../telemetry/index.js';

interface OutboxDatabaseRow {
  readonly event_id: unknown;
  readonly event_type: unknown;
  readonly event_version: unknown;
  readonly aggregate_id: unknown;
  readonly occurred_at: unknown;
  readonly trace_context: unknown;
  readonly payload: unknown;
  readonly published_at: unknown;
  readonly claim_id: unknown;
  readonly claim_expires_at: unknown;
}

class HydratedEvent extends DomainEvent<string, EventPayload> {
  public constructor(input: DomainEventInput<string, EventPayload>) {
    super(input);
  }
}

function timestamp(value: unknown, field: string): string {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
    throw new Error(`PostgreSQL returned an invalid ${field}.`);
  }
  return value.toISOString();
}

export function mapOutboxRow(row: OutboxDatabaseRow): OutboxRow {
  if (
    typeof row.event_id !== 'string' ||
    typeof row.event_type !== 'string' ||
    typeof row.event_version !== 'number' ||
    typeof row.aggregate_id !== 'string' ||
    typeof row.claim_id !== 'string' ||
    (row.trace_context !== null &&
      (typeof row.trace_context !== 'object' || Array.isArray(row.trace_context))) ||
    typeof row.payload !== 'object' ||
    row.payload === null ||
    Array.isArray(row.payload)
  ) {
    throw new Error('PostgreSQL returned a malformed outbox row.');
  }

  const event = new HydratedEvent({
    eventId: row.event_id,
    type: row.event_type,
    version: row.event_version,
    aggregateId: row.aggregate_id,
    occurredAt: timestamp(row.occurred_at, 'occurred_at'),
    traceContext: row.trace_context as DomainEventInput<string, EventPayload>['traceContext'],
    payload: row.payload as EventPayload,
  });

  return Object.freeze({
    ...event,
    eventId: event.eventId,
    type: event.type,
    version: event.version,
    aggregateId: event.aggregateId,
    occurredAt: event.occurredAt,
    traceContext: event.traceContext,
    payload: event.payload,
    publishedAt: row.published_at === null ? null : timestamp(row.published_at, 'published_at'),
    claimId: row.claim_id as UuidV7,
    claimExpiresAt: timestamp(row.claim_expires_at, 'claim_expires_at'),
  });
}

const CLAIMED_COLUMNS = `
  claimed.event_id, claimed.event_type, claimed.event_version, claimed.aggregate_id,
  claimed.occurred_at, claimed.trace_context, claimed.payload, claimed.published_at,
  claimed.claim_id, claimed.claim_expires_at
`;

export class PostgresOutbox
  implements OutboxAppendPort, OutboxRelayPort, OutboxRetentionPort, RetainedPublicationReader
{
  public constructor(private readonly connection: DatabaseConnection) {}

  public async find(
    transaction: Transaction,
    aggregateId: string,
    eventType: string,
  ): Promise<EventEnvelope | null> {
    const rows = await postgresClientFor(transaction, this.connection).query<{
      event_id: string;
      event_type: string;
      event_version: number;
      aggregate_id: string;
      occurred_at: Date;
      trace_context: DomainEventInput<string, EventPayload>['traceContext'];
      payload: EventPayload;
    }>(
      `SELECT event_id::text, event_type, event_version, aggregate_id::text, occurred_at, trace_context, payload
       FROM platform.outbox WHERE aggregate_id=$1 AND event_type=$2 ORDER BY event_id LIMIT 1`,
      [aggregateId, eventType],
    );
    const row = rows[0];
    return row
      ? new HydratedEvent({
          eventId: row.event_id,
          type: row.event_type,
          version: row.event_version,
          aggregateId: row.aggregate_id,
          occurredAt: timestamp(row.occurred_at, 'occurred_at'),
          traceContext: row.trace_context,
          payload: row.payload,
        })
      : null;
  }

  public async append(transaction: Transaction, events: readonly EventEnvelope[]): Promise<void> {
    return runOutboxAppendSpan(async () => {
      const client = postgresClientFor(transaction, this.connection);
      try {
        for (const event of events) {
          await client.query(
            `INSERT INTO platform.outbox
               (event_id, event_type, event_version, aggregate_id, occurred_at, trace_context, payload)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
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
        }
      } catch (error) {
        throw redactConnectionError(error);
      }
    });
  }

  public async claimPending(limit: number, leaseDurationMs: number): Promise<readonly OutboxRow[]> {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
      throw new Error('Outbox claim limit must be between 1 and 100.');
    }
    if (
      !Number.isSafeInteger(leaseDurationMs) ||
      leaseDurationMs < 100 ||
      leaseDurationMs > 86_400_000
    ) {
      throw new Error('Outbox claim lease must be between 100 and 86400000 milliseconds.');
    }

    try {
      const rows = await this.connection.query<OutboxDatabaseRow>(
        `WITH eligible AS (
           SELECT candidate.event_id
             FROM platform.outbox AS candidate
            WHERE candidate.published_at IS NULL
              AND (
                candidate.claim_id IS NULL
                OR candidate.claim_expires_at <= clock_timestamp()
              )
              AND NOT EXISTS (
                SELECT 1
                  FROM platform.outbox AS earlier
                 WHERE earlier.aggregate_id = candidate.aggregate_id
                   AND earlier.published_at IS NULL
                   AND earlier.event_id < candidate.event_id
              )
            ORDER BY candidate.event_id
            LIMIT $1
            FOR UPDATE OF candidate SKIP LOCKED
         )
         UPDATE platform.outbox AS claimed
            SET claim_id = uuidv7(),
                claim_expires_at = clock_timestamp() + ($2 * interval '1 millisecond')
           FROM eligible
          WHERE claimed.event_id = eligible.event_id
        RETURNING ${CLAIMED_COLUMNS}`,
        [limit, leaseDurationMs],
      );
      return rows.map(mapOutboxRow);
    } catch (error) {
      throw redactConnectionError(error);
    }
  }

  public async markPublished(eventId: UuidV7, claimId: UuidV7): Promise<void> {
    try {
      const rows = await this.connection.query<{ event_id: string }>(
        `UPDATE platform.outbox
            SET published_at = clock_timestamp(),
                claim_id = NULL,
                claim_expires_at = NULL
          WHERE event_id = $1
            AND claim_id = $2
            AND published_at IS NULL
        RETURNING event_id::text`,
        [eventId, claimId],
      );
      if (rows.length !== 1 || rows[0]?.event_id !== eventId) {
        throw new Error('Owned outbox claim was not marked as published.');
      }
    } catch (error) {
      throw redactConnectionError(error);
    }
  }

  public async releaseClaim(eventId: UuidV7, claimId: UuidV7): Promise<void> {
    try {
      const rows = await this.connection.query<{ event_id: string }>(
        `UPDATE platform.outbox
            SET claim_id = NULL,
                claim_expires_at = NULL
          WHERE event_id = $1
            AND claim_id = $2
            AND published_at IS NULL
        RETURNING event_id::text`,
        [eventId, claimId],
      );
      if (rows.length !== 1 || rows[0]?.event_id !== eventId) {
        throw new Error('Owned outbox claim was not released.');
      }
    } catch (error) {
      throw redactConnectionError(error);
    }
  }

  public async prunePublished(
    retentionMs: number,
    batchSize: number,
    signal: AbortSignal,
  ): Promise<number> {
    validateRetentionArguments(retentionMs, batchSize);
    try {
      const rows = await this.connection.queryAbortable<{ event_id: string }>(
        `WITH eligible AS (
           SELECT candidate.event_id
             FROM platform.outbox AS candidate
            WHERE candidate.published_at IS NOT NULL
              AND candidate.published_at < clock_timestamp() - ($1 * interval '1 millisecond')
            ORDER BY candidate.published_at, candidate.event_id
            LIMIT $2
            FOR UPDATE OF candidate SKIP LOCKED
         )
         DELETE FROM platform.outbox AS expired
          USING eligible
          WHERE expired.event_id = eligible.event_id
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

function validateRetentionArguments(retentionMs: number, batchSize: number): void {
  if (!Number.isSafeInteger(retentionMs) || retentionMs < 1) {
    throw new Error('Retention duration must be a positive integer.');
  }
  if (!Number.isSafeInteger(batchSize) || batchSize < 1 || batchSize > 10_000) {
    throw new Error('Retention batch size must be between 1 and 10000.');
  }
}
