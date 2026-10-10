import type { Transaction } from '@rei/application';
import { describe, expect, it, vi } from 'vitest';
import type { DatabaseConnection } from '../shared/persistence/database-connection.js';
import { PostgresTransactionRunner } from '../shared/persistence/postgres-transaction.js';
import { PostgresPropertyRepository } from './postgres-property.repository.js';
import { fixtureId, initialEvent, initialProperty } from './property.test-fixture.js';

describe('PostgresPropertyRepository', () => {
  it('scopes every mutation to its own active pool transaction and own schema', async () => {
    const property = await initialProperty();
    const query = vi.fn(async (sql: string) =>
      sql.includes('SELECT property_id')
        ? [{ property_id: property.propertyId }]
        : sql.includes('SELECT event_id')
          ? [{ event_id: initialEvent.eventId }]
          : [],
    );
    const identity = {};
    const connection = {
      transactionIdentity: () => identity,
      leaseClient: async () => ({ query, release: vi.fn() }),
    } as unknown as DatabaseConnection;
    const repository = new PostgresPropertyRepository(connection);
    let scope: Transaction | undefined;
    await new PostgresTransactionRunner(connection).runInTransaction(async (tx) => {
      scope = tx;
      await repository.lockSourceIdentity(tx, 'synthetic-data', 'SYN-SP-0001');
      expect(await repository.hasFact(tx, initialEvent.eventId)).toBe(true);
      expect(await repository.findSourceIdentity(tx, 'synthetic-data', 'SYN-SP-0001')).toBe(
        property.propertyId,
      );
      await repository.appendFact(tx, initialEvent, 'initial');
      await repository.create(tx, property);
    });
    expect(query.mock.calls.map(([sql]) => sql).join('\n')).not.toMatch(/collection\.|locations\./);
    expect(query.mock.calls.at(-1)![0]).toBe('COMMIT');
    await expect(repository.hasFact(scope!, initialEvent.eventId)).rejects.toThrow('inactive');
    await expect(repository.hasFact({} as Transaction, initialEvent.eventId)).rejects.toThrow(
      'own PostgreSQL',
    );
  });
  it('hydrates strict immutable initial state by either ID and rejects malformed persisted data', async () => {
    const property = await initialProperty();
    const row = {
      property_id: property.propertyId,
      listing_id: property.listingId,
      event: { ...initialEvent },
      resolved_place: property.resolved,
    };
    const query = vi.fn(async (_sql: string, params?: readonly unknown[]) =>
      params?.[0] === fixtureId(999) ? [] : [row],
    );
    const repository = new PostgresPropertyRepository({ query } as unknown as DatabaseConnection);
    expect((await repository.getProperty(property.propertyId))!.initial).toEqual(initialEvent);
    expect((await repository.getListing(property.listingId))!.propertyId).toBe(property.propertyId);
    expect(await repository.getProperty(fixtureId(999))).toBeNull();
    await expect(repository.getListing('bad')).rejects.toThrow();
    query.mockResolvedValue([{ ...row, event: { ...initialEvent, extra: true } }]);
    await expect(repository.getProperty(property.propertyId)).rejects.toThrow();
  });
});
