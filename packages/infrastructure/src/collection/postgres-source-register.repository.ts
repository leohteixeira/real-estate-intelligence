import {
  ExternalFailure,
  ListingSourceAccessRefusal,
  type SourceRegisterRepository,
  type Transaction,
} from '@rei/application';
import {
  createSourceRegistration,
  toEnabledSourceView,
  type EnabledSourceView,
  type SourceAccessMethod,
  type SourceCategory,
  type SourceLicence,
  type SourceRatePolicy,
  type SourceRegistration,
  type SourceReviewOutcome,
  type SourceHold,
  type SourceAccessRefusal,
} from '@rei/domain';

import type { DatabaseConnection } from '../shared/persistence/database-connection.js';
import { postgresClientFor } from '../shared/persistence/postgres-transaction.js';

interface SourceRow {
  readonly hold_reason: unknown;
  readonly held_at: unknown;
  readonly source_id: unknown;
  readonly source_label: unknown;
  readonly source_category: unknown;
  readonly enabled: unknown;
  readonly enabled_at: unknown;
  readonly collection_allowed: unknown;
  readonly image_fetching_allowed: unknown;
  readonly listing_text_display_allowed: unknown;
  readonly permission_evidence: unknown;
  readonly reviewed_at: unknown;
  readonly review_outcome: unknown;
  readonly access_method: unknown;
  readonly access_policy: unknown;
  readonly rate_status: unknown;
  readonly rate_limit: unknown;
  readonly rate_window_seconds: unknown;
  readonly licence_status: unknown;
  readonly licence_label: unknown;
  readonly licence_url: unknown;
}

const COLUMNS = `source_id, source_label, source_category, enabled, enabled_at,
  collection_allowed, image_fetching_allowed, listing_text_display_allowed,
  permission_evidence, reviewed_at, review_outcome, access_method, access_policy,
  rate_status, rate_limit, rate_window_seconds, licence_status, licence_label, licence_url,
  hold_reason, held_at`;

function instant(value: unknown, field: string): string | null {
  if (value === null) return null;
  if (value instanceof Date && !Number.isNaN(value.valueOf())) return value.toISOString();
  if (typeof value === 'string') return value;
  throw new Error(`PostgreSQL returned a malformed ${field}.`);
}

function text(value: unknown, field: string): string {
  if (typeof value !== 'string') throw new Error(`PostgreSQL returned a malformed ${field}.`);
  return value;
}

function nullableText(value: unknown, field: string): string | null {
  if (value === null) return null;
  return text(value, field);
}

function integer(value: unknown, field: string): number | null {
  if (value === null) return null;
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) {
    throw new Error(`PostgreSQL returned a malformed ${field}.`);
  }
  return value;
}

function boolean(value: unknown, field: string): boolean {
  if (typeof value !== 'boolean') throw new Error(`PostgreSQL returned a malformed ${field}.`);
  return value;
}

function mapRate(row: SourceRow): SourceRatePolicy {
  const status = text(row.rate_status, 'rate status');
  const limit = integer(row.rate_limit, 'rate limit');
  const windowSeconds = integer(row.rate_window_seconds, 'rate window');
  if (status === 'configured')
    return { status, limit: limit as number, windowSeconds: windowSeconds as number };
  if (status === 'not-applicable' || status === 'unconfigured') {
    return { status, limit: limit as null, windowSeconds: windowSeconds as null };
  }
  throw new Error('PostgreSQL returned a malformed rate status.');
}

function mapLicence(row: SourceRow): SourceLicence {
  const status = text(row.licence_status, 'licence status');
  const label = nullableText(row.licence_label, 'licence label');
  const url = nullableText(row.licence_url, 'licence URL');
  if (status === 'licensed') return { status, label: label as string, url: url as string };
  if (status === 'not-applicable') return { status, label: label as string, url: null };
  if (status === 'not-verified') return { status, label: null, url: null };
  throw new Error('PostgreSQL returned a malformed licence status.');
}

function mapSourceRegistration(row: SourceRow): SourceRegistration {
  if ((row.hold_reason === null) !== (row.held_at === null)) {
    throw new Error('PostgreSQL returned incoherent source hold metadata.');
  }
  return createSourceRegistration({
    sourceId: text(row.source_id, 'source ID'),
    displayLabel: text(row.source_label, 'source label'),
    category: text(row.source_category, 'source category') as SourceCategory,
    enabled: boolean(row.enabled, 'enabled flag'),
    enabledAt: instant(row.enabled_at, 'enablement timestamp'),
    hold:
      row.hold_reason === null
        ? null
        : {
            reason: text(row.hold_reason, 'hold reason') as SourceAccessRefusal,
            heldAt: instant(row.held_at, 'held at')!,
          },
    permissions: {
      collectionAllowed: boolean(row.collection_allowed, 'collection permission'),
      imageFetchingAllowed: boolean(row.image_fetching_allowed, 'image permission'),
      listingTextDisplayAllowed: boolean(row.listing_text_display_allowed, 'text permission'),
    },
    review: {
      outcome: text(row.review_outcome, 'review outcome') as SourceReviewOutcome,
      reviewedAt: instant(row.reviewed_at, 'review timestamp'),
      evidence: text(row.permission_evidence, 'review evidence'),
    },
    access: {
      method: text(row.access_method, 'access method') as SourceAccessMethod,
      detail: text(row.access_policy, 'access policy'),
    },
    rate: mapRate(row),
    licence: mapLicence(row),
  });
}

function persistenceFailure(): Error {
  return new Error('Source register persistence failed.');
}

export class PostgresSourceRegisterRepository implements SourceRegisterRepository {
  public constructor(private readonly connection: DatabaseConnection) {}

  public async holdAtomically(sourceId: string, hold: SourceHold, signal?: AbortSignal) {
    const statement = `UPDATE collection.source_register
      SET enabled = false, enabled_at = NULL,
          hold_reason = COALESCE(hold_reason, $2), held_at = COALESCE(held_at, $3::timestamptz)
      WHERE source_id = $1 RETURNING ${COLUMNS}`;
    try {
      const rows = signal
        ? await this.connection.queryAbortable<SourceRow>(
            statement,
            [sourceId, hold.reason, hold.heldAt],
            signal,
          )
        : await this.connection.query<SourceRow>(statement, [sourceId, hold.reason, hold.heldAt]);
      return rows[0] ? mapSourceRegistration(rows[0]) : null;
    } catch {
      if (signal?.aborted) throw signal.reason;
      throw persistenceFailure();
    }
  }

  public async clearHoldAfterReview(sourceId: string, reviewedAt: string, signal?: AbortSignal) {
    const statement = `UPDATE collection.source_register SET hold_reason = NULL, held_at = NULL
      WHERE source_id = $1 AND held_at <= $2::timestamptz RETURNING ${COLUMNS}`;
    try {
      const rows = signal
        ? await this.connection.queryAbortable<SourceRow>(statement, [sourceId, reviewedAt], signal)
        : await this.connection.query<SourceRow>(statement, [sourceId, reviewedAt]);
      return rows[0] ? mapSourceRegistration(rows[0]) : null;
    } catch {
      if (signal?.aborted) throw signal.reason;
      throw persistenceFailure();
    }
  }

  public async assertCollectible(transaction: Transaction, sourceId: string): Promise<void> {
    try {
      const rows = await postgresClientFor(transaction, this.connection).query<SourceRow>(
        `SELECT ${COLUMNS} FROM collection.source_register WHERE source_id = $1 FOR SHARE`,
        [sourceId],
      );
      const source = rows[0] ? mapSourceRegistration(rows[0]) : null;
      if (source?.hold) throw new ListingSourceAccessRefusal(source.hold.reason);
      if (!source?.enabled || !source.permissions.collectionAllowed)
        throw new ExternalFailure({ kind: 'forbidden', operation: 'collection.run.commit-page' });
    } catch (error) {
      if (error instanceof ExternalFailure) throw error;
      throw persistenceFailure();
    }
  }

  public async findById(
    sourceId: string,
    signal?: AbortSignal,
  ): Promise<SourceRegistration | null> {
    try {
      const statement = `SELECT ${COLUMNS} FROM collection.source_register WHERE source_id = $1`;
      const rows = signal
        ? await this.connection.queryAbortable<SourceRow>(statement, [sourceId], signal)
        : await this.connection.query<SourceRow>(statement, [sourceId]);
      if (rows.length > 1) throw new Error('Duplicate source registration.');
      return rows[0] ? mapSourceRegistration(rows[0]) : null;
    } catch {
      if (signal?.aborted) throw signal.reason;
      throw persistenceFailure();
    }
  }

  public async enableAtomically(
    sourceId: string,
    enabledAt: string,
    signal?: AbortSignal,
  ): Promise<SourceRegistration | null> {
    try {
      const statement = `
        UPDATE collection.source_register
           SET enabled = true,
               enabled_at = COALESCE(enabled_at, $2::timestamptz)
         WHERE source_id = $1
           AND hold_reason IS NULL
           AND (
             (source_id IN ('synthetic-data', 'synthetic-portal-aurora', 'synthetic-portal-brisa', 'synthetic-portal-cobalto')
               AND source_category = 'synthetic-listing'
               AND review_outcome = 'not-required'
               AND access_method = 'repository-fixture'
               AND collection_allowed
               AND licence_status = 'not-applicable'
               AND rate_status = 'not-applicable')
             OR
             (source_category <> 'synthetic-listing'
               AND review_outcome = 'allowed'
               AND reviewed_at IS NOT NULL
               AND access_method = 'remote-http'
               AND collection_allowed
               AND licence_status <> 'not-verified'
               AND rate_status = 'configured'
               AND rate_limit > 0
               AND rate_window_seconds > 0)
           )
        RETURNING ${COLUMNS}`;
      const rows = signal
        ? await this.connection.queryAbortable<SourceRow>(statement, [sourceId, enabledAt], signal)
        : await this.connection.query<SourceRow>(statement, [sourceId, enabledAt]);
      if (rows.length > 1) throw new Error('Duplicate source registration.');
      return rows[0] ? mapSourceRegistration(rows[0]) : null;
    } catch {
      if (signal?.aborted) throw signal.reason;
      throw persistenceFailure();
    }
  }

  public async listEnabled(signal?: AbortSignal): Promise<readonly EnabledSourceView[]> {
    try {
      const statement = `SELECT ${COLUMNS}
        FROM collection.source_register
        WHERE enabled = true AND hold_reason IS NULL
        ORDER BY source_id ASC`;
      const rows = signal
        ? await this.connection.queryAbortable<SourceRow>(statement, [], signal)
        : await this.connection.query<SourceRow>(statement);
      return Object.freeze(rows.map((row) => toEnabledSourceView(mapSourceRegistration(row))));
    } catch {
      if (signal?.aborted) throw signal.reason;
      throw persistenceFailure();
    }
  }
}
