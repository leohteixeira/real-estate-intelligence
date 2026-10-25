import type { Transaction } from '@rei/application';
import { describe, expect, it, vi } from 'vitest';

import type { DatabaseClient, DatabaseConnection } from './database-connection.js';
import { mapOutboxRow, PostgresOutbox } from './postgres-outbox.js';
import { PostgresAvailabilityProbe } from './postgres-availability-probe.js';
import { PostgresInbox } from './postgres-inbox.js';
import { PostgresTransactionRunner } from './postgres-transaction.js';
import { PostgresUuidV7Generator } from './postgres-uuid-v7-generator.js';
import { PostgresAuditEventLog } from '../../audit/postgres-audit-event-log.js';

function connectionDouble(client: DatabaseClient, identity = {}) {
  return {
    leaseClient: async () => client,
    transactionIdentity: () => identity,
  } as unknown as DatabaseConnection;
}

describe('PostgreSQL persistence adapters', () => {
  it('reads retained publications through the exact shared transaction and returns missing evidence as null', async () => {
    const envelope = {
      event_id: '0199c8f2-2394-7000-8000-000000000001',
      event_type: 'properties.listing.created',
      event_version: 1,
      aggregate_id: '0199c8f2-2394-7000-8000-000000000002',
      occurred_at: new Date('2026-10-10T12:00:00.000Z'),
      trace_context: null,
      payload: { genuine: true },
    };
    let available = true;
    const query = vi.fn(async (sql: string) =>
      sql.includes('FROM platform.outbox') && available ? [envelope] : [],
    );
    const connection = connectionDouble({ query, release: vi.fn() } as unknown as DatabaseClient);
    const outbox = new PostgresOutbox(connection);
    await new PostgresTransactionRunner(connection).runInTransaction(async (tx) => {
      expect(await outbox.find(tx, envelope.aggregate_id, envelope.event_type)).toEqual({
        eventId: envelope.event_id,
        type: envelope.event_type,
        version: 1,
        aggregateId: envelope.aggregate_id,
        occurredAt: envelope.occurred_at.toISOString(),
        traceContext: null,
        payload: envelope.payload,
      });
      available = false;
      expect(await outbox.find(tx, envelope.aggregate_id, envelope.event_type)).toBeNull();
    });
    expect(query.mock.calls[1]?.[0]).toContain('ORDER BY event_id LIMIT 1');
    expect(query.mock.calls.at(-1)?.[0]).toBe('COMMIT');
  });
  it('does not query PostgreSQL when the availability check is already aborted', async () => {
    const query = vi.fn();
    const controller = new AbortController();
    controller.abort();
    const probe = new PostgresAvailabilityProbe({ queryAbortable: query });

    await expect(probe.isAvailable(controller.signal)).resolves.toBe(false);
    expect(query).not.toHaveBeenCalled();
  });

  it('reports PostgreSQL availability after a successful probe', async () => {
    const query = vi.fn().mockResolvedValue([{ '?column?': 1 }]);
    const probe = new PostgresAvailabilityProbe({ queryAbortable: query });

    await expect(probe.isAvailable(new AbortController().signal)).resolves.toBe(true);
    expect(query).toHaveBeenCalledWith('SELECT 1', [], expect.any(AbortSignal));
  });

  it.each([new Error('database unavailable'), 'connection refused'])(
    'reports a redacted probe failure without throwing (%s)',
    async (failure) => {
      const onError = vi.fn();
      const query = vi.fn().mockRejectedValue(failure);
      const probe = new PostgresAvailabilityProbe({ queryAbortable: query }, onError);

      await expect(probe.isAvailable(new AbortController().signal)).resolves.toBe(false);
      expect(onError).toHaveBeenCalledWith(expect.any(Error));
    },
  );

  it('passes the readiness cancellation signal to the abortable query', async () => {
    const controller = new AbortController();
    const queryAbortable = vi.fn(
      (_sql: string, _params: readonly unknown[], signal: AbortSignal) =>
        new Promise<never>((_resolve, reject) =>
          signal.addEventListener('abort', () => reject(signal.reason), { once: true }),
        ),
    );
    const probe = new PostgresAvailabilityProbe({ queryAbortable });
    const pending = probe.isAvailable(controller.signal);
    controller.abort(new Error('readiness deadline'));
    await expect(pending).resolves.toBe(false);
    expect(queryAbortable).toHaveBeenCalledWith('SELECT 1', [], controller.signal);
  });

  it('begins, commits, and releases the exact leased client', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const release = vi.fn();
    const runner = new PostgresTransactionRunner(
      connectionDouble({ query, release } as unknown as DatabaseClient),
    );

    await expect(runner.runInTransaction(async () => 'committed')).resolves.toBe('committed');
    expect(query.mock.calls.map(([statement]) => statement)).toEqual(['BEGIN', 'COMMIT']);
    expect(release).toHaveBeenCalledOnce();
  });

  it('rolls back and releases when work fails', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const release = vi.fn();
    const runner = new PostgresTransactionRunner(
      connectionDouble({ query, release } as unknown as DatabaseClient),
    );

    await expect(
      runner.runInTransaction(async () => Promise.reject(new Error('forced failure'))),
    ).rejects.toThrow('forced failure');
    expect(query.mock.calls.map(([statement]) => statement)).toEqual(['BEGIN', 'ROLLBACK']);
    expect(release).toHaveBeenCalledOnce();
  });

  it('destroys the leased client and never commits when aborted during pending work', async () => {
    const query = vi.fn().mockResolvedValue([]);
    const release = vi.fn();
    const runner = new PostgresTransactionRunner(
      connectionDouble({ query, release } as unknown as DatabaseClient),
    );
    const controller = new AbortController();
    let workStarted!: () => void;
    const started = new Promise<void>((resolve) => {
      workStarted = resolve;
    });

    const operation = runner.runInTransaction(async () => {
      workStarted();
      return new Promise<string>(() => {});
    }, controller.signal);
    await started;
    controller.abort(new Error('collection deadline reached'));

    await expect(operation).rejects.toThrow('collection deadline reached');
    expect(query.mock.calls.map(([statement]) => statement)).toEqual(['BEGIN']);
    expect(release).toHaveBeenCalledWith(true);
  });

  it('checks cancellation after work and before issuing COMMIT', async () => {
    const query = vi.fn().mockResolvedValue([]);
    const release = vi.fn();
    const runner = new PostgresTransactionRunner(
      connectionDouble({ query, release } as unknown as DatabaseClient),
    );
    const controller = new AbortController();

    await expect(
      runner.runInTransaction(async () => {
        controller.abort(new Error('cancel before commit'));
        return 'not committed';
      }, controller.signal),
    ).rejects.toThrow('cancel before commit');
    expect(query.mock.calls.map(([statement]) => statement)).toEqual(['BEGIN']);
    expect(release).toHaveBeenCalledWith(true);
  });

  it('rejects a transaction scope owned by another connection', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const client = { query, release: vi.fn() } as unknown as DatabaseClient;
    const owner = connectionDouble(client);
    const other = connectionDouble(client);
    const runner = new PostgresTransactionRunner(owner);
    const identifiers = new PostgresUuidV7Generator(other);

    await expect(
      runner.runInTransaction(async (transaction: Transaction) =>
        identifiers.generate(transaction),
      ),
    ).rejects.toThrow('belongs to another pool');
    expect(query.mock.calls.map(([statement]) => statement)).toEqual(['BEGIN', 'ROLLBACK']);
  });

  it('appends through the transaction client and validates generated UUIDv7 values', async () => {
    const query = vi.fn(async (statement: string) =>
      statement.startsWith('SELECT uuidv7') ? [{ id: '0199c8f2-2394-7ba0-8f9e-286378779219' }] : [],
    );
    const client = { query, release: vi.fn() } as unknown as DatabaseClient;
    const connection = connectionDouble(client);
    const runner = new PostgresTransactionRunner(connection);
    const identifiers = new PostgresUuidV7Generator(connection);
    const outbox = new PostgresOutbox(connection);

    await runner.runInTransaction(async (transaction) => {
      const id = await identifiers.generate(transaction);
      await outbox.append(transaction, [
        {
          eventId: id,
          type: 'audit.trace.requested',
          version: 1,
          aggregateId: id,
          occurredAt: '2026-10-10T12:30:00.000Z',
          traceContext: null,
          payload: {},
        },
      ]);
    });

    expect(
      query.mock.calls.some(([statement]) => String(statement).includes('platform.outbox')),
    ).toBe(true);
  });

  it('strictly maps valid rows and rejects malformed rows', () => {
    const valid = {
      event_id: '0199c8f2-2394-7ba0-8f9e-286378779219',
      event_type: 'audit.trace.requested',
      event_version: 1,
      aggregate_id: '0199c8f2-2394-7ba0-9f9e-286378779220',
      occurred_at: new Date('2026-10-10T12:30:00.000Z'),
      trace_context: null,
      payload: {},
      published_at: null,
      claim_id: '0199c8f2-2394-7ba0-8f9e-286378779221',
      claim_expires_at: new Date('2026-10-10T12:32:00.000Z'),
    };

    expect(mapOutboxRow(valid)).toMatchObject({
      eventId: valid.event_id,
      publishedAt: null,
      claimId: valid.claim_id,
    });
    expect(() => mapOutboxRow({ ...valid, payload: [] })).toThrow('malformed outbox row');
    expect(() => mapOutboxRow({ ...valid, event_version: '1' })).toThrow('malformed outbox row');
  });

  it('leases only aggregate heads with database time and returns ownership', async () => {
    const row = {
      event_id: '0199c8f2-2394-7ba0-8f9e-286378779219',
      event_type: 'audit.trace.requested',
      event_version: 1,
      aggregate_id: '0199c8f2-2394-7ba0-9f9e-286378779220',
      occurred_at: new Date('2026-10-10T12:30:00.000Z'),
      trace_context: null,
      payload: {},
      published_at: null,
      claim_id: '0199c8f2-2394-7ba0-8f9e-286378779221',
      claim_expires_at: new Date('2026-10-10T12:32:00.000Z'),
    };
    const query = vi.fn().mockResolvedValue([row]);
    const outbox = new PostgresOutbox({ query } as unknown as DatabaseConnection);

    await expect(outbox.claimPending(10, 120_000)).resolves.toMatchObject([
      { eventId: row.event_id, claimId: row.claim_id },
    ]);

    const [statement, parameters] = query.mock.calls[0]!;
    expect(statement).toContain('FOR UPDATE OF candidate SKIP LOCKED');
    expect(statement).toContain('earlier.event_id < candidate.event_id');
    expect(statement).toContain('clock_timestamp()');
    expect(statement).toMatch(/RETURNING\s+claimed\.event_id/);
    expect(parameters).toEqual([10, 120_000]);
  });

  it('requires matching claim ownership to mark or release a row', async () => {
    const eventId = '0199c8f2-2394-7ba0-8f9e-286378779219' as never;
    const claimId = '0199c8f2-2394-7ba0-8f9e-286378779221' as never;
    const query = vi.fn().mockResolvedValue([{ event_id: eventId }]);
    const outbox = new PostgresOutbox({ query } as unknown as DatabaseConnection);

    await outbox.markPublished(eventId, claimId);
    await outbox.releaseClaim(eventId, claimId);

    expect(query.mock.calls[0]?.[0]).toContain('claim_id = $2');
    expect(query.mock.calls[0]?.[1]).toEqual([eventId, claimId]);
    expect(query.mock.calls[1]?.[0]).toContain('claim_id = $2');
  });

  it('rejects stale ownership when marking or releasing a claim', async () => {
    const eventId = '0199c8f2-2394-7ba0-8f9e-286378779219' as never;
    const staleClaimId = '0199c8f2-2394-7ba0-8f9e-286378779221' as never;
    const query = vi.fn().mockResolvedValue([]);
    const outbox = new PostgresOutbox({ query } as unknown as DatabaseConnection);

    await expect(outbox.markPublished(eventId, staleClaimId)).rejects.toThrow(
      'Owned outbox claim was not marked as published',
    );
    await expect(outbox.releaseClaim(eventId, staleClaimId)).rejects.toThrow(
      'Owned outbox claim was not released',
    );
  });

  it('prunes one deterministic published outbox batch with database time', async () => {
    const queryAbortable = vi.fn().mockResolvedValue([{ event_id: 'one' }, { event_id: 'two' }]);
    const outbox = new PostgresOutbox({ queryAbortable } as unknown as DatabaseConnection);
    const signal = new AbortController().signal;

    await expect(outbox.prunePublished(604_800_000, 2, signal)).resolves.toBe(2);
    const [statement, parameters, receivedSignal] = queryAbortable.mock.calls[0]!;
    expect(statement).toContain('published_at IS NOT NULL');
    expect(statement).toContain("clock_timestamp() - ($1 * interval '1 millisecond')");
    expect(statement).toContain('ORDER BY candidate.published_at, candidate.event_id');
    expect(statement).toContain('FOR UPDATE OF candidate SKIP LOCKED');
    expect(statement).toContain('DELETE FROM platform.outbox');
    expect(parameters).toEqual([604_800_000, 2]);
    expect(receivedSignal).toBe(signal);
  });

  it('prunes old inbox rows while protecting an unpublished matching outbox event', async () => {
    const queryAbortable = vi.fn().mockResolvedValue([{ event_id: 'one' }]);
    const inbox = new PostgresInbox({ queryAbortable } as unknown as DatabaseConnection);

    await expect(inbox.pruneConsumed(2_592_000_000, 1, new AbortController().signal)).resolves.toBe(
      1,
    );
    const statement = String(queryAbortable.mock.calls[0]?.[0]);
    expect(statement).toContain('pending.event_id = candidate.event_id');
    expect(statement).toContain('pending.published_at IS NULL');
    expect(statement).toContain(
      'ORDER BY candidate.received_at, candidate.consumer_name, candidate.event_id',
    );
    expect(statement).toContain('FOR UPDATE OF candidate SKIP LOCKED');
    expect(statement).toContain('DELETE FROM platform.inbox');
  });

  it('records the inbox key and audit effect through the exact transaction client', async () => {
    const eventId = '0199c8f2-2394-7ba0-8f9e-286378779219' as never;
    const query = vi.fn(async (statement: string) => {
      if (statement.includes('platform.inbox') || statement.includes('audit.event_log')) {
        return [{ event_id: eventId }];
      }
      return [];
    });
    const client = { query, release: vi.fn() } as unknown as DatabaseClient;
    const connection = connectionDouble(client);
    const runner = new PostgresTransactionRunner(connection);
    const inbox = new PostgresInbox(connection);
    const audit = new PostgresAuditEventLog(connection);

    await runner.runInTransaction(async (transaction) => {
      expect(await inbox.record(transaction, 'audit.event-log', eventId)).toBe(true);
      await audit.append(transaction, {
        eventId,
        type: 'audit.trace.requested',
        version: 1,
        aggregateId: eventId,
        occurredAt: '2026-10-10T12:30:00.000Z',
        traceContext: null,
        payload: {},
      });
    });

    expect(query.mock.calls.map(([statement]) => String(statement))).toEqual([
      'BEGIN',
      expect.stringContaining('platform.inbox'),
      expect.stringContaining('audit.event_log'),
      'COMMIT',
    ]);
  });

  it('accepts a canonical audit row committed before the inbox upgrade', async () => {
    const eventId = '0199c8f2-2394-7ba0-8f9e-286378779219' as never;
    const event = {
      eventId,
      type: 'audit.trace.requested',
      version: 1,
      aggregateId: eventId,
      occurredAt: '2026-10-10T12:30:00.000Z',
      traceContext: null,
      payload: {},
    } as const;
    const query = vi.fn(async (statement: string) => {
      if (statement.includes('INSERT INTO audit.event_log')) return [];
      if (statement.includes('FROM audit.event_log')) return [{ event_id: eventId }];
      return [];
    });
    const client = { query, release: vi.fn() } as unknown as DatabaseClient;
    const connection = connectionDouble(client);
    const runner = new PostgresTransactionRunner(connection);
    const audit = new PostgresAuditEventLog(connection);

    await expect(
      runner.runInTransaction((transaction) => audit.append(transaction, event)),
    ).resolves.toBeUndefined();

    expect(query.mock.calls.map(([statement]) => String(statement))).toEqual([
      'BEGIN',
      expect.stringContaining('ON CONFLICT (event_id) DO NOTHING'),
      expect.stringContaining('trace_context IS NOT DISTINCT FROM $6::jsonb'),
      'COMMIT',
    ]);
    expect(query.mock.calls[2]?.[1]).toEqual([
      event.eventId,
      event.type,
      event.version,
      event.aggregateId,
      event.occurredAt,
      event.traceContext,
      event.payload,
    ]);
  });

  it('rejects reuse of an audit event ID with different canonical fields', async () => {
    const eventId = '0199c8f2-2394-7ba0-8f9e-286378779219' as never;
    const query = vi.fn(async (statement: string) => {
      if (statement.includes('INSERT INTO audit.event_log')) return [];
      return [];
    });
    const client = { query, release: vi.fn() } as unknown as DatabaseClient;
    const connection = connectionDouble(client);
    const runner = new PostgresTransactionRunner(connection);
    const audit = new PostgresAuditEventLog(connection);

    await expect(
      runner.runInTransaction((transaction) =>
        audit.append(transaction, {
          eventId,
          type: 'audit.trace.requested',
          version: 1,
          aggregateId: eventId,
          occurredAt: '2026-10-10T12:30:00.000Z',
          traceContext: null,
          payload: {},
        }),
      ),
    ).rejects.toThrow('already used by a different canonical event');

    expect(query.mock.calls.map(([statement]) => String(statement))).toEqual([
      'BEGIN',
      expect.stringContaining('ON CONFLICT (event_id) DO NOTHING'),
      expect.stringContaining('FROM audit.event_log'),
      'ROLLBACK',
    ]);
  });
});
