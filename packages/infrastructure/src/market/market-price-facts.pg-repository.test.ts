import { describe, expect, it, vi } from 'vitest';
import { PropertiesEvent, type ListingFact } from '@rei/domain';
import type { Transaction } from '@rei/application';
import { DatabaseConnection, PostgresTransactionRunner } from '../shared/index.js';
import { PostgresMarketPriceFacts } from './market-price-facts.pg-repository.js';

const id = (n: number) => `0199c8f2-2394-7000-8000-${String(n).padStart(12, '0')}`;
const date = '2026-10-10T12:00:00.000Z';
const fact: ListingFact = {
  listingId: id(1),
  propertyId: id(2),
  sourceId: 'synthetic-source',
  sourceListingId: 'listing-1',
  placeId: 'block',
  propertyType: 'apartment',
  areaSquareMeters: 10,
  status: 'active',
  askingPriceMinorUnits: 10000,
  currency: 'BRL',
  effectiveAt: date,
  provenance: {
    sourceId: 'synthetic-source',
    sourceListingId: 'listing-1',
    sourceUrl: 'https://source.invalid/1',
    runId: id(3),
    snapshotId: id(4),
    contentHash: `sha256:${'a'.repeat(64)}`,
    observedAt: date,
  },
};
const event = new PropertiesEvent('properties.listing.created', {
  eventId: id(5),
  aggregateId: id(1),
  occurredAt: date,
  payload: { revision: 1, effectiveAt: date, listing: fact },
});
function fixture() {
  const connection = new DatabaseConnection('postgres://controlled:controlled@127.0.0.1:1/fixture');
  const rows: {
    conflicts: { identical: boolean }[];
    identity: { property_id: string; source_id: string; source_listing_id: string }[];
    read: { business_event: unknown }[];
  } = { conflicts: [], identity: [], read: [] };
  const query = vi.fn(async (sql: string) =>
    sql.includes('AS identical')
      ? rows.conflicts
      : sql.includes('AS property_id')
        ? rows.identity
        : sql.includes('SELECT e.business_event')
          ? rows.read
          : [],
  );
  const lease = { query, release: vi.fn() };
  vi.spyOn(connection, 'leaseClient').mockResolvedValue(lease);
  vi.spyOn(connection, 'query').mockImplementation(async (sql) => {
    if (!sql.includes('market.listing_price_current')) throw new Error('Unexpected read');
    return rows.read;
  });
  return {
    connection,
    rows,
    query,
    repository: new PostgresMarketPriceFacts(connection),
    transactions: new PostgresTransactionRunner(connection),
  };
}
describe('PostgresMarketPriceFacts', () => {
  it('leases mutations in own schema, normalizes business identity and advances conditionally', async () => {
    const f = fixture();
    let scope: Transaction | undefined;
    await f.transactions.runInTransaction(async (tx) => {
      scope = tx;
      await f.repository.project(tx, event);
    });
    const sql = f.query.mock.calls.map(([statement]) => statement).join('\n');
    expect(sql).not.toMatch(/properties\.|collection\.|locations\./);
    expect(sql).toContain('WHERE market.listing_price_current.revision < EXCLUDED.revision');
    expect(f.query.mock.calls.filter(([statement]) => statement.startsWith('INSERT'))).toHaveLength(
      2,
    );
    expect(f.query.mock.calls.at(-1)![0]).toBe('COMMIT');
    await expect(f.repository.project(scope!, event)).rejects.toThrow('inactive');
    await f.connection.close();
  });
  it('validates permanent event and revision conflicts before duplicate early-exit', async () => {
    const f = fixture();
    f.rows.conflicts = [{ identical: true }];
    await f.transactions.runInTransaction((tx) => f.repository.project(tx, event));
    expect(f.query.mock.calls.some(([sql]) => sql.startsWith('INSERT'))).toBe(false);
    for (const conflicts of [[{ identical: false }], [{ identical: true }, { identical: true }]]) {
      f.rows.conflicts = conflicts;
      await expect(
        f.transactions.runInTransaction((tx) => f.repository.project(tx, event)),
      ).rejects.toThrow('rejected');
      expect(f.query.mock.calls.at(-1)![0]).toBe('ROLLBACK');
    }
    await f.connection.close();
  });
  it.each(['property_id', 'source_id', 'source_listing_id'] as const)(
    'fences immutable listing identity %s',
    async (field) => {
      const f = fixture();
      f.rows.identity = [
        {
          property_id: id(2),
          source_id: fact.sourceId,
          source_listing_id: fact.sourceListingId,
          [field]: 'changed',
        },
      ];
      await expect(
        f.transactions.runInTransaction((tx) => f.repository.project(tx, event)),
      ).rejects.toThrow('rejected');
      expect(f.query.mock.calls.some(([sql]) => sql.startsWith('INSERT'))).toBe(false);
      await f.connection.close();
    },
  );
  it('hydrates a coherent detached current snapshot through the strict public parser', async () => {
    const f = fixture();
    const business = {
      eventId: event.eventId,
      type: event.type,
      version: 1,
      aggregateId: event.aggregateId,
      occurredAt: event.occurredAt,
      payload: event.payload,
    };
    f.rows.read = [{ business_event: business }];
    const result = await f.repository.readCurrent();
    expect(result).toEqual([fact]);
    Reflect.set(result[0]!.provenance, 'sourceUrl', 'mutated');
    expect((await f.repository.readCurrent())[0]!.provenance.sourceUrl).toBe(
      fact.provenance.sourceUrl,
    );
    for (const value of [null, 'invalid', { ...business, private: true }]) {
      f.rows.read = [{ business_event: value }];
      await expect(f.repository.readCurrent()).rejects.toThrow();
    }
    await f.connection.close();
  });
});
