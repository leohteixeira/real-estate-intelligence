import { describe, expect, it, vi } from 'vitest';
import { PropertiesEvent, PropertiesEventV2, type ListingFact } from '@rei/domain';
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
    identity: { identical: boolean }[];
    states: { identical: boolean }[];
    assignments: { identical: boolean }[];
    current: { property_id: string }[];
    read: { property_id: string; selected_listing: unknown }[];
    figures: {
      representatives: { property_id: string; selected_listing: unknown }[];
      current: unknown[];
      history: { revision: string; listing: unknown }[];
      events: unknown[];
    }[];
  } = {
    conflicts: [],
    identity: [],
    states: [],
    assignments: [],
    current: [],
    read: [],
    figures: [],
  };
  const query = vi.fn(async (sql: string, parameters: readonly unknown[] = []) => {
    void parameters;
    return sql.includes('FROM market.price_event_evidence')
      ? rows.conflicts
      : sql.includes('FROM market.listing_price_identity')
        ? rows.identity
        : sql.includes('FROM market.listing_state_evidence')
          ? rows.states
          : sql.includes('FROM market.listing_assignment_evidence')
            ? rows.assignments
            : sql.includes('FROM market.listing_assignment_current')
              ? rows.current
              : [];
  });
  const lease = { query, release: vi.fn() };
  vi.spyOn(connection, 'leaseClient').mockResolvedValue(lease);
  vi.spyOn(connection, 'query').mockImplementation(async (sql) => {
    if (!sql.includes('market.property_price_current')) throw new Error('Unexpected read');
    return sql.includes(' AS representatives') ? rows.figures : rows.read;
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
  it('canonicalizes new causal state facts without rewriting the retained v1 envelope', async () => {
    const f = fixture();
    const uppercase = {
      ...fact,
      listingId: fact.listingId.toUpperCase(),
      propertyId: fact.propertyId.toUpperCase(),
      provenance: {
        ...fact.provenance,
        runId: fact.provenance.runId.toUpperCase(),
        snapshotId: fact.provenance.snapshotId.toUpperCase(),
      },
    };
    const legacy = new PropertiesEvent('properties.listing.created', {
      eventId: id(5),
      aggregateId: fact.listingId,
      occurredAt: date,
      payload: { revision: 1, effectiveAt: date, listing: uppercase },
    });
    await f.transactions.runInTransaction((tx) => f.repository.project(tx, legacy));
    const state = f.query.mock.calls.find(([sql]) =>
      sql.includes('INSERT INTO market.listing_state_evidence'),
    );
    expect(state?.[1]?.[2]).toBe(
      JSON.stringify(
        Object.fromEntries(Object.entries(fact).filter(([key]) => key !== 'propertyId')),
      ),
    );
    const envelope = f.query.mock.calls.find(([sql]) =>
      sql.includes('INSERT INTO market.listing_price_evidence'),
    );
    expect(envelope?.[1]?.[3]).toBe(
      JSON.stringify({
        eventId: legacy.eventId,
        type: legacy.type,
        version: 1,
        aggregateId: legacy.aggregateId,
        occurredAt: date,
        payload: legacy.payload,
      }),
    );
    expect(legacy.payload.listing).toEqual(uppercase);
    await f.connection.close();
  });
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
      9,
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
  it.each(['source_id', 'source_listing_id'] as const)(
    'fences immutable listing identity %s',
    async (field) => {
      const f = fixture();
      expect(field).toMatch(/^source/);
      f.rows.identity = [{ identical: false }];
      await expect(
        f.transactions.runInTransaction((tx) => f.repository.project(tx, event)),
      ).rejects.toThrow('rejected');
      expect(f.query.mock.calls.at(-1)![0]).toBe('ROLLBACK');
      await f.connection.close();
    },
  );
  it('hydrates a coherent detached current snapshot through the strict public parser', async () => {
    const f = fixture();
    f.rows.read = [{ property_id: fact.propertyId, selected_listing: fact }];
    const result = await f.repository.readCurrent();
    expect(result).toEqual([fact]);
    Reflect.set(result[0]!.provenance, 'sourceUrl', 'mutated');
    expect((await f.repository.readCurrent())[0]!.provenance.sourceUrl).toBe(
      fact.provenance.sourceUrl,
    );
    for (const value of [
      null,
      'invalid',
      { ...fact, private: true },
      { ...fact, status: 'removed' },
      { ...fact, propertyId: id(100) },
    ]) {
      f.rows.read = [{ property_id: fact.propertyId, selected_listing: value }];
      await expect(f.repository.readCurrent()).rejects.toThrow();
    }
    await f.connection.close();
  });
  it.each(['states', 'assignments'] as const)(
    'rejects contradictory immutable causal %s inside the projection transaction',
    async (key) => {
      const f = fixture();
      f.rows[key] = [{ identical: false }];
      await expect(
        f.transactions.runInTransaction((tx) => f.repository.project(tx, event)),
      ).rejects.toThrow('rejected');
      expect(f.query.mock.calls.at(-1)![0]).toBe('ROLLBACK');
      expect(
        f.query.mock.calls.some(([sql]) =>
          sql.includes('INSERT INTO market.property_price_current'),
        ),
      ).toBe(false);
      await f.connection.close();
    },
  );
  it('hydrates all figure inputs in one own-schema SQL snapshot with strict state and event parsing', async () => {
    const f = fixture();
    const change = new PropertiesEventV2('properties.listing.price-changed', {
      eventId: id(99),
      aggregateId: fact.listingId,
      occurredAt: date,
      payload: {
        revision: 2,
        assignmentRevision: 1,
        effectiveAt: date,
        listing: fact,
        previousMinorUnits: 20000,
      },
    });
    const business = {
      eventId: change.eventId,
      type: change.type,
      version: change.version,
      aggregateId: change.aggregateId,
      occurredAt: change.occurredAt,
      payload: change.payload,
    };
    const valid = {
      representatives: [{ property_id: fact.propertyId, selected_listing: fact }],
      current: [fact],
      history: [{ revision: '2', listing: fact }],
      events: [business],
    };
    f.rows.figures = [valid];
    const query = vi.mocked(f.connection.query);
    const result = await f.repository.readFigures();
    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0]![0]).not.toMatch(/FROM (properties|locations|collection)\./);
    expect(result).toEqual({
      representatives: [fact],
      current: [fact],
      history: [{ revision: 2, listing: fact }],
      priceChanges: [{ listing: fact, previousMinorUnits: 20000 }],
    });
    Reflect.set(result.current[0]!.provenance, 'sourceUrl', 'mutated');
    expect((await f.repository.readFigures()).current[0]!.provenance.sourceUrl).toBe(
      fact.provenance.sourceUrl,
    );
    for (const invalid of [
      { ...valid, representatives: [{ property_id: id(999), selected_listing: fact }] },
      {
        ...valid,
        representatives: [
          { property_id: fact.propertyId, selected_listing: { ...fact, status: 'removed' } },
        ],
      },
      { ...valid, current: [{ ...fact, private: true }] },
      { ...valid, history: [{ revision: '9007199254740992', listing: fact }] },
      { ...valid, events: [null] },
      {
        ...valid,
        events: [{ ...business, payload: { ...change.payload, previousMinorUnits: 0 } }],
      },
      { ...valid, events: [{ ...event, traceContext: undefined }] },
    ]) {
      f.rows.figures = [invalid];
      await expect(f.repository.readFigures()).rejects.toThrow();
    }
    f.rows.figures = [
      {
        ...valid,
        events: [
          {
            eventId: id(100),
            type: 'properties.listing.price-changed',
            version: 1,
            aggregateId: fact.listingId,
            occurredAt: date,
            payload: { revision: 2, effectiveAt: date, listing: fact, previousMinorUnits: 20000 },
          },
        ],
      },
    ];
    expect((await f.repository.readFigures()).priceChanges).toHaveLength(1);
    f.rows.figures = [];
    await expect(f.repository.readFigures()).rejects.toThrow();
    await f.connection.close();
  });
  it('projects a declared property-price snapshot without inventing a listing event', async () => {
    const f = fixture();
    const current = {
      propertyId: fact.propertyId,
      placeId: fact.placeId,
      areaSquareMeters: fact.areaSquareMeters,
      minimumMinorUnits: fact.askingPriceMinorUnits,
      currency: fact.currency,
      selectedListingId: fact.listingId,
      provenance: fact.provenance,
      activeListingIds: [fact.listingId],
    };
    const price = new PropertiesEventV2('properties.property.asking-price-changed', {
      eventId: id(10),
      aggregateId: fact.propertyId,
      occurredAt: date,
      payload: {
        revision: 7,
        effectiveAt: date,
        previous: { ...current, minimumMinorUnits: 20000 },
        current,
        listingStates: [{ listing: fact, revision: 3, assignmentRevision: 4 }],
      },
    });
    await f.transactions.runInTransaction((tx) => f.repository.project(tx, price));
    const sql = f.query.mock.calls.map(([statement]) => statement).join('\n');
    expect(sql).toContain('pg_advisory_xact_lock');
    expect(sql).toContain('WHERE market.listing_state_current.revision < EXCLUDED.revision');
    expect(sql).toContain('WHERE market.listing_assignment_current.revision < EXCLUDED.revision');
    expect(sql).not.toContain('INSERT INTO market.listing_price_evidence');
    expect(
      f.query.mock.calls.filter(([statement]) =>
        statement.includes('INSERT INTO market.property_price_current'),
      ),
    ).toHaveLength(1);
    await f.connection.close();
  });
  it('moves removed members and recomputes old, retained and resulting property tombstones', async () => {
    const f = fixture();
    const removed = { ...fact, status: 'removed' as const };
    const empty = (propertyId: string) => ({
      propertyId,
      placeId: fact.placeId,
      areaSquareMeters: null,
      minimumMinorUnits: null,
      currency: fact.currency,
      selectedListingId: null,
      provenance: null,
      activeListingIds: [],
    });
    const split = new PropertiesEventV2('properties.property.split', {
      eventId: id(11),
      aggregateId: fact.propertyId,
      occurredAt: date,
      payload: {
        revision: 8,
        effectiveAt: date,
        previous: [empty(fact.propertyId)],
        resulting: [empty(fact.propertyId), empty(id(12))],
        listingStates: [{ listing: removed, revision: 3, assignmentRevision: 4 }],
        assignments: [
          {
            listingId: fact.listingId,
            fromPropertyId: fact.propertyId,
            toPropertyId: id(12),
            fromAssignmentRevision: 4,
            assignmentRevision: 5,
          },
        ],
      },
    });
    f.rows.current = [{ property_id: id(13) }];
    await f.transactions.runInTransaction((tx) => f.repository.project(tx, split));
    expect(
      f.query.mock.calls.filter(([sql]) =>
        sql.includes('INSERT INTO market.listing_assignment_evidence'),
      ),
    ).toHaveLength(2);
    expect(
      f.query.mock.calls.filter(([sql]) =>
        sql.includes('INSERT INTO market.property_price_current'),
      ),
    ).toHaveLength(3);
    expect(f.query.mock.calls.at(-1)![0]).toBe('COMMIT');
    await f.connection.close();
  });
});
