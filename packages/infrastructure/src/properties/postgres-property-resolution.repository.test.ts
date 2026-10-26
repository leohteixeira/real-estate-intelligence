import { describe, expect, it, vi } from 'vitest';
import type { EventEnvelope } from '@rei/application';
import {
  CollectionSnapshotCorrected,
  CollectionSnapshotParsed,
  INITIAL_RESOLUTION_CONFIGURATION,
  ListingChronology,
  NormalizedListing,
  PropertiesEvent,
  Property,
  compareResolutionInputs,
  parsePropertiesEventV2,
  parsePropertyMatchQueuedForReview,
  resolvePropertyGroups,
  type ListingFact,
  type ResolutionConfiguration,
  type ResolutionInput,
} from '@rei/domain';
import type { DatabaseConnection } from '../shared/persistence/database-connection.js';
import { PostgresTransactionRunner } from '../shared/persistence/postgres-transaction.js';
import { fixtureId, initialEvent, initialProperty } from './property.test-fixture.js';
import {
  matchingHash,
  PostgresPropertyResolutionRepository,
} from './postgres-property-resolution.repository.js';

const configuration = INITIAL_RESOLUTION_CONFIGURATION;
type Creation = PropertiesEvent<'properties.listing.created'>;
type Assignment = {
  listing_id: string;
  property_id: string;
  assignment_revision: number;
  processed_revision: number;
  market_fact: ListingFact;
  input_event_id: string;
  input_hash: string;
};

async function member(
  n: number,
  changes: Partial<CollectionSnapshotParsed['payload']['listing']> = {},
) {
  const original = await initialProperty();
  const event = new CollectionSnapshotParsed({
    ...initialEvent,
    eventId: fixtureId(n + 3),
    aggregateId: fixtureId(n + 2),
    payload: {
      ...initialEvent.payload,
      run: { runId: fixtureId(n + 1) },
      snapshot: { ...initialEvent.payload.snapshot, snapshotId: fixtureId(n + 2) },
      source: { ...initialEvent.payload.source, sourceListingId: `OWNED-${n}` },
      listing: { ...initialEvent.payload.listing, ...changes },
    },
  });
  const property = new Property(fixtureId(n + 10), fixtureId(n + 11), event, original.resolved);
  const input: ResolutionInput = {
    listingId: property.listingId,
    originalPropertyId: property.propertyId,
    inputEventId: event.eventId,
    inputHash: `sha256:${String(n).padStart(64, '0')}`,
    listing: new NormalizedListing(event),
  };
  return { property, event, input, creation: property.creationEvent(fixtureId(n + 12)) };
}

function assignment(creation: Creation, input: ResolutionInput): Assignment {
  return {
    listing_id: creation.aggregateId,
    property_id: input.originalPropertyId,
    assignment_revision: 0,
    processed_revision: 1,
    market_fact: creation.payload.listing,
    input_event_id: input.inputEventId,
    input_hash: input.inputHash,
  };
}

function database() {
  const retained: { event: unknown }[] = [];
  const assigned: Assignment[] = [];
  const loaded: object[] = [];
  let storedConfiguration: ResolutionConfiguration = configuration;
  let insertedComparison = true;
  let revision = 0;
  let nextId = 9000;
  const query = vi.fn(async (sql: string, parameters?: readonly unknown[]) => {
    void parameters;
    if (sql.startsWith('SELECT listing.listing_id')) return loaded;
    if (sql.startsWith('SELECT configuration FROM'))
      return [{ configuration: storedConfiguration }];
    if (sql.startsWith('SELECT listing_id::text,property_id::text')) return assigned;
    if (sql.startsWith('SELECT event FROM properties.listing_event')) return retained;
    if (sql.startsWith('INSERT INTO properties.resolution_property_state'))
      return [{ revision: ++revision }];
    if (sql.startsWith('INSERT INTO properties.match_comparison'))
      return insertedComparison ? [{ left_listing_id: fixtureId(11) }] : [];
    return [];
  });
  const identity = {};
  const connection = {
    transactionIdentity: () => identity,
    leaseClient: async () => ({ query, release: vi.fn() }),
  } as unknown as DatabaseConnection;
  const append = vi.fn(async (transaction: unknown, events: readonly EventEnvelope[]) => {
    void transaction;
    void events;
  });
  const repository = new PostgresPropertyResolutionRepository(
    connection,
    { append },
    {
      generate: async () => fixtureId(nextId++),
    },
  );
  const transactions = new PostgresTransactionRunner(connection);
  return {
    retained,
    assigned,
    loaded,
    query,
    append,
    repository,
    transactions,
    setConfiguration(value: ResolutionConfiguration) {
      storedConfiguration = value;
    },
    deduplicate() {
      insertedComparison = false;
    },
    save(inputs: readonly ResolutionInput[], signal = new AbortController().signal) {
      const comparisons = inputs.flatMap((left, index) =>
        inputs.slice(index + 1).map((right) => compareResolutionInputs(left, right, configuration)),
      );
      return transactions.runInTransaction((tx) =>
        repository.save(
          tx,
          {
            inputs,
            comparisons,
            groups: resolvePropertyGroups(inputs, comparisons),
            configuration,
          },
          signal,
        ),
      );
    },
  };
}

describe('Postgres entity-resolution decisions', () => {
  it('retains the erasure-time survivor set through price changes and releases it for later substantive evidence', async () => {
    const first = await member(0),
      second = await member(100);
    const db = database();
    const row = (
      item: typeof first,
      askingPriceMinorUnits = 78500000,
      areaSquareMeters = 82.5,
    ) => ({
      listing_id: item.property.listingId,
      property_id: item.property.propertyId,
      event: {
        ...item.event,
        payload: {
          ...item.event.payload,
          listing: { ...item.event.payload.listing, askingPriceMinorUnits, areaSquareMeters },
        },
      },
      state: null,
      continuity_group_id: first.property.propertyId,
      stored_input_hash: matchingHash(item.input.listing),
    });
    db.loaded.push(row(first), row(second));
    const load = () => db.transactions.runInTransaction((tx) => db.repository.load(tx, 2));
    expect((await load()).map((input) => input.continuityGroupId)).toEqual([
      first.property.propertyId,
      first.property.propertyId,
    ]);
    db.loaded[0] = row(first, 70000000);
    expect((await load()).every((input) => input.continuityGroupId)).toBe(true);
    db.loaded[0] = row(first, 70000000, 90);
    expect((await load()).map((input) => input.continuityGroupId)).toEqual([undefined, undefined]);
  });
  it('loads corrected matching inputs, keeps original identity and normalizes hash-equivalent evidence', async () => {
    const first = await member(0);
    const chronology = new ListingChronology(first.property, null, (text) => text);
    const corrected = new CollectionSnapshotCorrected({
      ...first.event,
      eventId: fixtureId(80),
      payload: {
        ...first.event.payload,
        listing: { ...first.event.payload.listing, areaSquareMeters: 90 },
        correction: {
          kind: 'parser-correction',
          originalParsedEventId: first.event.eventId,
          order: 1,
          operationKey: 'owned',
          parserRevision: 'owned',
        },
      },
    });
    chronology.correct(corrected, first.property.resolved);
    const db = database();
    db.loaded.push({
      listing_id: first.property.listingId,
      property_id: first.property.propertyId,
      event: first.event,
      state: JSON.parse(JSON.stringify(chronology.state)),
    });
    const load = () => db.transactions.runInTransaction((tx) => db.repository.load(tx, 2));
    const result = (await load())[0]!;
    expect(result.originalPropertyId).toBe(first.property.propertyId);
    expect(result.inputEventId).toBe(corrected.eventId);
    expect(result.listing.areaSquareMeters.value).toBe(90);
    db.loaded[0] = {
      listing_id: first.property.listingId,
      property_id: first.property.propertyId,
      event: { ...corrected },
      state: null,
    };
    expect((await load())[0]!.inputHash).toBe(result.inputHash);
    expect(db.query.mock.calls[1]![0]).toContain('pg_advisory_xact_lock');
    await expect(
      db.transactions.runInTransaction((tx) => db.repository.load(tx, 0)),
    ).rejects.toThrow('listing bound');
    expect(db.query.mock.calls.at(-1)![0]).toBe('ROLLBACK');
  });

  it('baselines original minimum history and publishes only the actual merge', async () => {
    const first = await member(0);
    const second = await member(100, { askingPriceMinorUnits: 80000000 });
    const at = '2026-10-11T12:00:00.000Z';
    const drop = new PropertiesEvent('properties.listing.price-changed', {
      eventId: fixtureId(200),
      aggregateId: second.property.listingId,
      occurredAt: at,
      payload: {
        revision: 2,
        effectiveAt: at,
        previousMinorUnits: 80000000,
        listing: {
          ...second.creation.payload.listing,
          effectiveAt: at,
          askingPriceMinorUnits: 77000000,
          provenance: { ...second.property.provenance, observedAt: at },
        },
      },
    });
    const db = database();
    db.retained.push({ event: drop }, { event: second.creation }, { event: first.creation });
    expect(await db.save([first.input, second.input])).toBe(1);
    const publications = db.append.mock.calls[0]![1];
    expect(publications.map((event) => event.type)).toEqual(['properties.property.merged']);
    const merged = parsePropertiesEventV2(publications[0]);
    expect(merged.type).toBe('properties.property.merged');
    if (merged.type !== 'properties.property.merged') throw new Error('Expected merge');
    expect(merged.payload.resulting).toMatchObject([
      {
        propertyId: first.property.propertyId,
        minimumMinorUnits: 77000000,
        selectedListingId: second.property.listingId,
      },
    ]);
    const historyWrites = db.query.mock.calls.filter(([sql]) =>
      sql.startsWith('INSERT INTO properties.property_minimum_effect'),
    );
    expect(historyWrites).toHaveLength(1);
    expect(historyWrites[0]![1]!.slice(0, 2)).toEqual([drop.eventId, first.property.propertyId]);
    expect(JSON.parse(String(historyWrites[0]![1]![2]))).toMatchObject({
      effectiveAt: at,
      previous: { minimumMinorUnits: 78500000 },
      current: { minimumMinorUnits: 77000000, provenance: drop.payload.listing.provenance },
    });
    const writes = db.query.mock.calls.filter(([sql]) =>
      sql.startsWith('INSERT INTO properties.listing_assignment'),
    );
    expect(writes.map(([, params]) => params!.slice(0, 4))).toEqual([
      [first.property.listingId, first.property.propertyId, 1, 1],
      [second.property.listingId, first.property.propertyId, 1, 2],
    ]);
  });

  it('processes inverted revisions before removal/return, retaining original dates under valid v2 envelopes', async () => {
    const first = await member(0);
    const created = first.creation;
    const earlier = '2026-10-09T12:00:00.000Z';
    const later = '2026-10-12T12:00:00.000Z';
    const fact = {
      ...created.payload.listing,
      askingPriceMinorUnits: 77000000,
      effectiveAt: earlier,
      provenance: { ...first.property.provenance, observedAt: earlier },
    };
    const drop = new PropertiesEvent('properties.listing.price-changed', {
      eventId: fixtureId(200),
      aggregateId: first.property.listingId,
      occurredAt: earlier,
      payload: { revision: 2, effectiveAt: earlier, listing: fact, previousMinorUnits: 78500000 },
    });
    const removed = new PropertiesEvent('properties.listing.removed', {
      eventId: fixtureId(201),
      aggregateId: first.property.listingId,
      occurredAt: later,
      payload: {
        revision: 3,
        effectiveAt: later,
        listing: { ...fact, status: 'removed', effectiveAt: later },
      },
    });
    const returned = new PropertiesEvent('properties.listing.reappeared', {
      eventId: fixtureId(202),
      aggregateId: first.property.listingId,
      occurredAt: later,
      payload: {
        revision: 4,
        effectiveAt: later,
        listing: {
          ...fact,
          effectiveAt: later,
          provenance: { ...fact.provenance, observedAt: later },
        },
      },
    });
    const db = database();
    db.assigned.push(assignment(created, first.input));
    db.retained.push(...[returned, drop, removed, created].map((event) => ({ event })));
    expect(await db.save([first.input])).toBe(3);
    const publications = db.append.mock.calls[0]![1].map(parsePropertiesEventV2);
    expect(publications.map((event) => event.type)).toEqual(
      Array(3).fill('properties.property.asking-price-changed'),
    );
    expect(publications[0]!.payload.effectiveAt).toBe(created.payload.effectiveAt);
    const writes = db.query.mock.calls.filter(([sql]) =>
      sql.startsWith('INSERT INTO properties.property_minimum_effect'),
    );
    expect(writes.map(([, params]) => params![0])).toEqual([
      drop.eventId,
      removed.eventId,
      returned.eventId,
    ]);
    expect(JSON.parse(String(writes[0]![1]![2]))).toMatchObject({
      effectiveAt: earlier,
      previous: { minimumMinorUnits: 78500000 },
      current: { minimumMinorUnits: 77000000, provenance: fact.provenance },
    });
    expect(
      db.query.mock.calls.find(([sql]) =>
        sql.startsWith('INSERT INTO properties.listing_assignment'),
      )![1]![3],
    ).toBe(4);
  });

  it('splits an incompatible existing group without repricing or replacing immutable lineage', async () => {
    const first = await member(0);
    const second = await member(100, { propertyType: 'house' });
    const db = database();
    db.assigned.push(assignment(first.creation, first.input), {
      ...assignment(second.creation, second.input),
      property_id: first.property.propertyId,
      assignment_revision: 1,
    });
    db.retained.push({ event: first.creation }, { event: second.creation });
    expect(await db.save([first.input, second.input])).toBe(1);
    const split = parsePropertiesEventV2(db.append.mock.calls[0]![1][0]);
    expect(split.type).toBe('properties.property.split');
    if (split.type !== 'properties.property.split') throw new Error('Expected split');
    expect(split.payload.assignments).toMatchObject([
      {
        listingId: first.property.listingId,
        toPropertyId: first.property.propertyId,
        assignmentRevision: 1,
      },
      {
        listingId: second.property.listingId,
        toPropertyId: second.property.propertyId,
        assignmentRevision: 2,
      },
    ]);
    expect(
      db.query.mock.calls.some(([sql]) =>
        sql.startsWith('INSERT INTO properties.property_minimum_effect'),
      ),
    ).toBe(false);
    expect(
      db.query.mock.calls.some(([sql]) => /UPDATE properties\.(listing|property) SET/.test(sql)),
    ).toBe(false);
  });

  it('deduplicates unchanged review decisions and otherwise leaves revisions/publications untouched', async () => {
    const first = await member(0, { imageFingerprints: ['fixture-fingerprint:owned-a'] });
    const second = await member(100, { imageFingerprints: ['fixture-fingerprint:owned-b'] });
    const db = database();
    db.assigned.push(
      assignment(first.creation, first.input),
      assignment(second.creation, second.input),
    );
    db.retained.push({ event: first.creation }, { event: second.creation });
    expect(await db.save([first.input, second.input])).toBe(1);
    const review = parsePropertyMatchQueuedForReview(db.append.mock.calls[0]![1][0]);
    expect(review.payload.comparison.decision).toBe('review');
    expect(review.payload.comparison.probability).toBe(0.89);
    expect(JSON.stringify(review)).not.toContain('fixture-fingerprint');
    db.deduplicate();
    db.append.mockClear();
    expect(await db.save([first.input, second.input])).toBe(0);
    expect(db.append).not.toHaveBeenCalled();
  });

  it('refuses changed configuration identity, missing causal authority, overflow and cancellation atomically', async () => {
    const first = await member(0);
    const db = database();
    db.setConfiguration({ ...configuration, weights: { ...configuration.weights, area: 0.2 } });
    await expect(db.save([first.input])).rejects.toThrow('configuration identity');
    db.setConfiguration(configuration);
    await expect(db.save([first.input])).rejects.toThrow('authentic listing');
    db.assigned.push(assignment(first.creation, first.input));
    await expect(db.save([first.input])).rejects.toThrow('lost its retained');
    db.retained.push(...Array.from({ length: 10001 }, () => ({ event: first.creation })));
    await expect(db.save([first.input])).rejects.toThrow('retained-event bound');
    db.retained.splice(1);
    const controller = new AbortController();
    controller.abort(new Error('Owned cancellation'));
    await expect(db.save([first.input], controller.signal)).rejects.toThrow('Owned cancellation');
    expect(db.append).not.toHaveBeenCalled();
    expect(db.query.mock.calls.at(-1)![0]).toBe('ROLLBACK');
  });

  it('propagates an outbox failure for transaction rollback instead of acknowledging an assignment', async () => {
    const first = await member(0);
    const second = await member(100);
    const db = database();
    db.retained.push({ event: first.creation }, { event: second.creation });
    db.append.mockRejectedValue(new Error('Owned outbox failure'));
    await expect(db.save([first.input, second.input])).rejects.toThrow('Owned outbox failure');
    expect(db.query.mock.calls.at(-1)![0]).toBe('ROLLBACK');
  });
});
