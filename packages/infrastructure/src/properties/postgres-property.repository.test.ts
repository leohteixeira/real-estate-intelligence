import type { Transaction } from '@rei/application';
import { describe, expect, it, vi } from 'vitest';
import type { DatabaseConnection } from '../shared/persistence/database-connection.js';
import { PostgresTransactionRunner } from '../shared/persistence/postgres-transaction.js';
import { PostgresPropertyRepository } from './postgres-property.repository.js';
import { fixtureId, initialEvent, initialProperty } from './property.test-fixture.js';
import {
  INITIAL_RESOLUTION_CONFIGURATION,
  compareResolutionInputs,
  NormalizedListing,
} from '@rei/domain';

describe('PostgresPropertyRepository', () => {
  it('hydrates current singleton configuration and authentic minimum facts without inventing null-price changes', async () => {
    const property = await initialProperty();
    const input = {
      listingId: property.listingId,
      originalPropertyId: property.propertyId,
      inputEventId: initialEvent.eventId,
      inputHash: `sha256:${'a'.repeat(64)}`,
      listing: new NormalizedListing(initialEvent),
    };
    const comparison = compareResolutionInputs(input, { ...input, listingId: fixtureId(112) });
    const fact = {
      propertyId: property.propertyId,
      placeId: property.resolved.place.id,
      areaSquareMeters: 82.5,
      minimumMinorUnits: 78500000,
      currency: 'BRL' as const,
      selectedListingId: property.listingId,
      provenance: property.provenance,
      activeListingIds: [property.listingId],
    };
    const currentConfiguration = {
      ...INITIAL_RESOLUTION_CONFIGURATION,
      id: 'owned-current',
      version: 1,
    };
    const snapshot = {
      members: [
        {
          property_id: property.propertyId,
          listing_id: property.listingId,
          original_property_id: property.propertyId,
          event: initialEvent,
          resolved_place: property.resolved,
          state: null,
        },
      ],
      pairs: [] as { evidence: typeof comparison; configuration: typeof currentConfiguration }[],
      configuration: currentConfiguration as typeof currentConfiguration | null,
      effects: [
        {
          effectiveAt: property.provenance.observedAt,
          previous: fact,
          current: { ...fact, minimumMinorUnits: 78000000 },
        },
        {
          effectiveAt: property.provenance.observedAt,
          previous: fact,
          current: { ...fact, minimumMinorUnits: null },
        },
      ],
    };
    const query = vi.fn(async (_sql: string, parameters?: readonly unknown[]) =>
      parameters?.[0] === fixtureId(999) ? [] : [snapshot],
    );
    const repository = new PostgresPropertyRepository({ query } as unknown as DatabaseConnection);
    expect(await repository.getCurrentGroup(fixtureId(999))).toBeNull();
    let group = (await repository.getCurrentGroup(property.listingId))!;
    expect(group.configuration).toEqual(currentConfiguration);
    expect(group.members[0]!.initial).toEqual(initialEvent);
    expect(group.states).toEqual([{ listingId: property.listingId, state: null }]);
    expect(group.priceChanges).toMatchObject([
      {
        previousMinorUnits: 78500000,
        currentMinorUnits: 78000000,
        provenance: property.provenance,
      },
    ]);
    expect(group.priceChanges).toHaveLength(1);
    snapshot.pairs.push(
      { evidence: comparison, configuration: currentConfiguration },
      { evidence: comparison, configuration: { ...currentConfiguration, id: 'owned-other' } },
    );
    group = (await repository.getCurrentGroup(property.listingId))!;
    expect(group.comparisons).toEqual([comparison]);
    snapshot.pairs.length = 0;
    snapshot.configuration = null;
    await expect(repository.getCurrentGroup(property.listingId)).rejects.toThrow(
      'configuration is unavailable',
    );
  });
  it('scopes every mutation to its own active pool transaction and own schema', async () => {
    const property = await initialProperty();
    const query = vi.fn(async (sql: string, params?: readonly unknown[]) => {
      void params;
      return sql.includes('SELECT property_id')
        ? [{ property_id: property.propertyId }]
        : sql.includes('SELECT event_id')
          ? [{ event_id: initialEvent.eventId }]
          : [];
    });
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
    const listingWrite = query.mock.calls.find(([sql]) =>
      sql.startsWith('INSERT INTO properties.listing'),
    )!;
    expect(listingWrite[1]!.slice(4)).toEqual([
      property.normalized.askingPriceMinorUnits.value,
      property.normalized.currency.value,
      property.normalized.areaSquareMeters.value,
    ]);
    const factWrite = query.mock.calls.find(([sql]) =>
      sql.startsWith('INSERT INTO properties.incoming_fact'),
    )!;
    expect(factWrite[1]![5]).toBe(JSON.stringify(initialEvent));
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
    expect((await repository.getProperty(property.propertyId))!.normalized).toEqual(
      property.normalized,
    );
    expect(await repository.getProperty(fixtureId(999))).toBeNull();
    await expect(repository.getListing('bad')).rejects.toThrow();
    query.mockResolvedValue([{ ...row, event: { ...initialEvent, extra: true } }]);
    await expect(repository.getProperty(property.propertyId)).rejects.toThrow();
  });
});
