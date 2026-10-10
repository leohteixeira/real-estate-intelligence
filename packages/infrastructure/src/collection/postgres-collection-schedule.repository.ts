import type {
  ClaimedCollectionSchedule,
  CollectionScheduleRepository,
  Transaction,
} from '@rei/application';

import type { DatabaseConnection } from '../shared/persistence/database-connection.js';
import { postgresClientFor } from '../shared/persistence/postgres-transaction.js';
import { redactConnectionError } from '../shared/persistence/redact.js';

interface ClaimedRow {
  readonly schedule_id: unknown;
  readonly source_id: unknown;
  readonly scheduled_for: unknown;
  readonly operation_key: unknown;
  readonly next_run_at: unknown;
}

function timestamp(value: unknown, field: string): string {
  if (!(value instanceof Date) || Number.isNaN(value.valueOf())) {
    throw new Error(`PostgreSQL returned malformed ${field}.`);
  }
  return value.toISOString();
}

export class PostgresCollectionScheduleRepository implements CollectionScheduleRepository {
  public constructor(private readonly connection: DatabaseConnection) {}

  public async claimDue(
    transaction: Transaction,
    now: string,
    limit: number,
  ): Promise<readonly ClaimedCollectionSchedule[]> {
    const client = postgresClientFor(transaction, this.connection);
    try {
      const rows = await client.query<ClaimedRow>(
        `WITH due AS (
           SELECT schedule.schedule_id,
                  schedule.source_id,
                  schedule.next_run_at AS scheduled_for,
                  schedule.interval_seconds
             FROM collection.collection_schedule AS schedule
            WHERE schedule.enabled
              AND schedule.in_flight_operation_key IS NULL
              AND schedule.next_run_at <= $1::timestamptz
            ORDER BY schedule.next_run_at, schedule.schedule_id
            LIMIT $2
            FOR UPDATE OF schedule SKIP LOCKED
         )
         UPDATE collection.collection_schedule AS schedule
            SET in_flight_operation_key =
                  'collection:' || due.source_id || ':' ||
                  to_char(due.scheduled_for AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
                in_flight_scheduled_for = due.scheduled_for,
                next_run_at = due.scheduled_for + (
                  floor(
                    GREATEST(0, extract(epoch FROM ($1::timestamptz - due.scheduled_for))) /
                    due.interval_seconds
                  ) + 1
                ) * due.interval_seconds * interval '1 second',
                updated_at = clock_timestamp()
           FROM due
          WHERE schedule.schedule_id = due.schedule_id
        RETURNING schedule.schedule_id,
                  schedule.source_id,
                  due.scheduled_for,
                  schedule.in_flight_operation_key AS operation_key,
                  schedule.next_run_at`,
        [now, limit],
      );
      return Object.freeze(
        rows.map((row) => {
          if (
            typeof row.schedule_id !== 'string' ||
            typeof row.source_id !== 'string' ||
            typeof row.operation_key !== 'string'
          ) {
            throw new Error('PostgreSQL returned a malformed collection schedule claim.');
          }
          return Object.freeze({
            scheduleId: row.schedule_id,
            sourceId: row.source_id,
            scheduledFor: timestamp(row.scheduled_for, 'scheduled schedule instant'),
            operationKey: row.operation_key,
            nextRunAt: timestamp(row.next_run_at, 'next schedule instant'),
          });
        }),
      );
    } catch (error) {
      throw redactConnectionError(error);
    }
  }

  public async completeMatching(
    transaction: Transaction,
    sourceId: string,
    operationKey: string,
  ): Promise<boolean> {
    const client = postgresClientFor(transaction, this.connection);
    try {
      const rows = await client.query<{ schedule_id: string }>(
        `UPDATE collection.collection_schedule
            SET in_flight_operation_key = NULL,
                in_flight_scheduled_for = NULL,
                updated_at = clock_timestamp()
          WHERE source_id = $1
            AND in_flight_operation_key = $2
        RETURNING schedule_id`,
        [sourceId, operationKey],
      );
      return rows.length === 1;
    } catch (error) {
      throw redactConnectionError(error);
    }
  }
}
