import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  CollectionSnapshotParsed,
  CollectionSnapshotCorrected,
  CollectionRunCompleted,
  parseUuidV7,
  Property,
  type ListingChronologyState,
  type ResolvedPropertyPlace,
} from '@rei/domain';
import type { CanonicalCompletedRun, CollectionHistoryFacade } from '../collection/index.js';
import {
  Transaction,
  type TransactionRunner,
  type EventEnvelope,
  type RetainedPublicationReader,
} from '../shared/index.js';
import type { PropertyRepository, ParsedListingFact } from './property.repository.js';
import type { ListingHistoryRepository, SourceHistoryWork } from './listing-history.repository.js';
import {
  ConsumeListingCompletion,
  ReconcileListingHistory,
} from './reconcile-listing-history.service.js';

const id = (n: number) => parseUuidV7(`0199c8f2-2394-7000-8000-${String(n).padStart(12, '0')}`);
const date = (n: number) => `2026-10-${String(n).padStart(2, '0')}T12:00:00.000Z`;
const hash = (text: string) => `sha256:${createHash('sha256').update(text).digest('hex')}`;
const place: ResolvedPropertyPlace = {
  place: {
    id: 'neighborhood',
    kind: 'neighborhood',
    name: { en: 'neighborhood', ptBR: 'neighborhood' },
  },
  breadcrumbs: (['country', 'state', 'city', 'zone', 'neighborhood'] as const).map((kind) => ({
    id: kind,
    kind,
    name: { en: kind, ptBR: kind },
  })),
};
function fact(n: number, price = 100, description = 'Original description.') {
  return new CollectionSnapshotParsed({
    eventId: id(n * 10 + 1),
    aggregateId: id(n * 10 + 2),
    occurredAt: date(n),
    payload: {
      run: { runId: id(n * 10) },
      snapshot: { snapshotId: id(n * 10 + 2), contentHash: hash(`snapshot-${n}`) },
      source: {
        sourceId: 'synthetic-data',
        sourceListingId: 'OWNED-HISTORY',
        sourceUrl: 'https://synthetic.invalid/history',
        observedAt: date(n),
      },
      listing: {
        propertyType: 'apartment',
        askingPriceMinorUnits: price,
        currency: 'BRL',
        areaSquareMeters: 50,
        bedrooms: 1,
        bathrooms: 1,
        parkingSpaces: 0,
        features: ['pool'],
        location: {
          city: 'São Paulo',
          stateCode: 'SP',
          neighborhood: 'Bela Vista',
          street: 'Avenida Exemplo',
        },
        listedAt: date(1),
        advertiser: { type: 'private', agencyName: null },
        maskedDescription: description,
        imageFingerprints: ['fixture:owned-fingerprint'],
      },
    },
  });
}
function completed(n: number, present = true): CanonicalCompletedRun {
  const event = new CollectionRunCompleted({
    eventId: id(n * 10 + 3),
    aggregateId: id(n * 10),
    occurredAt: date(n),
    payload: {
      sourceId: 'synthetic-data',
      observedCount: present ? 1 : 0,
      parsedCount: present ? 1 : 0,
      suppressedCount: 0,
      failedCount: 0,
      manifestHash: hash(`manifest-${n}`),
    },
  });
  return {
    event,
    runId: id(n * 10),
    sourceId: 'synthetic-data',
    startedAt: date(n),
    completedAt: date(n),
    counts: {
      observed: present ? 1 : 0,
      parsed: present ? 1 : 0,
      changed: present ? 1 : 0,
      suppressed: 0,
      failed: 0,
    },
    observedSourceListingIds: present ? ['OWNED-HISTORY'] : [],
    manifestHash: event.payload.manifestHash,
  };
}
function correction(original: CollectionSnapshotParsed, order = 1) {
  return new CollectionSnapshotCorrected({
    eventId: id(400 + order),
    aggregateId: original.aggregateId,
    occurredAt: date(20),
    payload: {
      ...original.payload,
      listing: {
        ...original.payload.listing,
        askingPriceMinorUnits: 777,
        maskedDescription: 'Corrected description.',
      },
      correction: {
        originalParsedEventId: original.eventId,
        kind: 'parser-correction',
        operationKey: `correction-${order}`,
        parserRevision: `parser-${order}`,
        order,
      },
    },
  });
}
interface State {
  inbox: string[];
  facts: ParsedListingFact[];
  properties: Property[];
  current: ListingChronologyState | null;
  outbox: EventEnvelope[];
  retained: EventEnvelope[];
  runs: string[];
  corrections: string[];
  queued: boolean;
}
class Scope extends Transaction {
  constructor(public state: State) {
    super();
  }
}
function fixture(
  initialOptions: Partial<{
    refuse: boolean;
    unknownAddress: boolean;
    failure: string;
    blocked: boolean;
  }> = {},
) {
  let state: State = {
    inbox: [],
    facts: [],
    properties: [],
    current: null,
    outbox: [],
    retained: [],
    runs: [],
    corrections: [],
    queued: false,
  };
  let work: SourceHistoryWork = { sourceId: 'synthetic-data', after: null, listingCursor: null };
  let nextId = 1000;
  const options = {
    refuse: false,
    unknownAddress: false,
    failure: '',
    blocked: false,
    ...initialOptions,
  };
  const rejectedCorrections = new Set<string>();
  const rejectedOriginals = new Set<string>();
  const runs: CanonicalCompletedRun[] = [];
  const facts: CollectionSnapshotParsed[] = [];
  const corrections: CollectionSnapshotCorrected[] = [];
  const checkpoint = (stage: string) => {
    if (options.failure === stage) throw new Error(`Injected ${stage} failure`);
  };
  const transactions: TransactionRunner = {
    async runInTransaction(callback, signal) {
      signal?.throwIfAborted();
      const working: State = {
        ...state,
        inbox: [...state.inbox],
        facts: [...state.facts],
        properties: [...state.properties],
        current: state.current ? JSON.parse(JSON.stringify(state.current)) : null,
        outbox: [...state.outbox],
        retained: [...state.retained],
        runs: [...state.runs],
        corrections: [...state.corrections],
      };
      const result = await callback(new Scope(working));
      signal?.throwIfAborted();
      state = working;
      return result;
    },
  };
  const properties: PropertyRepository = {
    lockSourceIdentity: async () => {},
    hasFact: async (tx, eventId) =>
      (tx as Scope).state.facts.some((item) => item.eventId === eventId),
    findSourceIdentity: async (tx) => (tx as Scope).state.properties[0]?.propertyId ?? null,
    appendFact: async (tx, event) => {
      (tx as Scope).state.facts.push(event);
      checkpoint('fact');
    },
    create: async (tx, property) => {
      (tx as Scope).state.properties.push(property);
      checkpoint('entity');
    },
  };
  const history: ListingHistoryRepository = {
    retainCreation: async (tx, event) => {
      (tx as Scope).state.retained.push(event);
    },
    pendingOriginalIdentities: async () =>
      state.properties.length &&
      facts.some(
        (item) =>
          !runs.some((run) => run.runId === item.payload.run.runId) &&
          !state.current?.acquisitions.some(
            (acquisition) => acquisition.original.eventId === item.eventId,
          ) &&
          !rejectedOriginals.has(item.eventId),
      )
        ? ['OWNED-HISTORY']
        : [],
    originalEffects: async () => [...rejectedOriginals],
    markOriginal: async (_tx, eventId) => {
      rejectedOriginals.add(eventId);
    },
    rotateOriginalIdentity: async () => {},
    correctionDisposition: async (tx, eventId) =>
      rejectedCorrections.has(eventId)
        ? 'rejected'
        : (tx as Scope).state.corrections.includes(eventId)
          ? 'applied'
          : null,
    enqueue: async (tx) => {
      (tx as Scope).state.queued = true;
    },
    nextSources: async () => (state.queued ? [work] : []),
    listingIdentities: async (tx, _source, observed, cursor, limit) =>
      [
        ...new Set([
          ...observed,
          ...(tx as Scope).state.properties.map((item) => item.provenance.sourceListingId),
        ]),
      ]
        .filter((identity) => !cursor || identity > cursor)
        .sort()
        .slice(0, limit),
    progress: async (_previous, cursor, after) => {
      checkpoint('progress');
      work = { ...work, listingCursor: cursor, after: after ?? work.after };
    },
    load: async (tx) => {
      const current = (tx as Scope).state;
      return current.properties[0]
        ? { property: current.properties[0], state: current.current }
        : null;
    },
    appliedRun: async (tx, _source, _identity, runId) => (tx as Scope).state.runs.includes(runId),
    markRun: async (tx, _source, _identity, runId) => {
      (tx as Scope).state.runs.push(runId);
    },
    save: async (tx, _property, current) => {
      (tx as Scope).state.current = current;
      checkpoint('history');
    },
    pendingCorrections: async () =>
      corrections.filter((item) => !state.corrections.includes(item.eventId)),
    markCorrection: async (tx, eventId, disposition) => {
      if (disposition === 'rejected') rejectedCorrections.add(eventId);
      (tx as Scope).state.corrections.push(eventId);
    },
  };
  const collection: CollectionHistoryFacade = {
    getLegacyListingFacts: async (_tx, _source, _identity, excluded, limit) =>
      facts
        .filter(
          (item) =>
            !options.refuse &&
            !options.blocked &&
            !runs.some((run) => run.runId === item.payload.run.runId) &&
            !excluded.includes(item.eventId),
        )
        .slice(0, limit),
    verifyCompletedEvent: async (_tx, event) =>
      !options.refuse && runs.some((run) => JSON.stringify(run.event) === JSON.stringify(event)),
    nextCompletedRun: async (_tx, _source, after) =>
      options.blocked
        ? null
        : (runs.find(
            (run) =>
              !after ||
              run.startedAt > after.startedAt ||
              (run.startedAt === after.startedAt && run.runId > after.runId),
          ) ?? null),
    getRunListingFacts: async (_tx, runId) =>
      facts.filter((item) => item.payload.run.runId === runId),
    getSnapshotCorrections: async (_tx, snapshotId) =>
      corrections
        .filter((item) => item.payload.snapshot.snapshotId === snapshotId)
        .sort((a, b) => b.payload.correction.order - a.payload.correction.order),
    verifyParsedEvent: async () => !options.refuse,
    getSourcePermissions: async () => ({
      sourceId: 'synthetic-data',
      collectionAllowed: true,
      imageFetchingAllowed: false,
      listingTextDisplayAllowed: true,
    }),
    getRun: async () => null,
    getSnapshotHash: async () => null,
    getSnapshotMetadata: async (expected) => ({
      availability: 'unavailable',
      collectedAt: expected.observedAt,
      expiresAt: null,
    }),
    listEnabledSources: async () => [],
  };
  const outbox = {
    append: async (tx: Transaction, events: readonly EventEnvelope[]) => {
      (tx as Scope).state.outbox.push(...events);
      checkpoint('outbox');
    },
  };
  const publications: RetainedPublicationReader = { find: async () => null };
  const service = new ReconcileListingHistory(
    collection,
    {
      resolveFixtureAddress: async (address) => {
        checkpoint('locations');
        return options.unknownAddress || address.street === 'Unknown correction street'
          ? null
          : place;
      },
    },
    properties,
    history,
    transactions,
    outbox,
    { generate: async () => id(nextId++) },
    hash,
    publications,
  );
  const intake = new ConsumeListingCompletion(collection, history, transactions, {
    record: async (tx, _consumer, eventId) => {
      const current = (tx as Scope).state;
      if (current.inbox.includes(eventId)) return false;
      current.inbox.push(eventId);
      return true;
    },
  });
  const signal = new AbortController().signal;
  async function collect(
    n: number,
    present = true,
    price = 100,
    description = 'Original description.',
  ) {
    const run = completed(n, present);
    runs.push(run);
    if (present) facts.push(fact(n, price, description));
    await intake.execute({ ...run.event }, signal);
    for (let i = 0; i < 3; i++) await service.execute(25, signal);
  }
  return {
    service,
    intake,
    signal,
    options,
    runs,
    facts,
    corrections,
    rejectedCorrections,
    history,
    publications,
    state: () => state,
    collect,
  };
}
describe('completion-bound durable history reconciliation', () => {
  it('commits eligible earlier absence and advances a manifest with no evidence at completion', async () => {
    for (const existing of [true, false]) {
      const f = fixture();
      if (existing) await f.collect(1);
      await f.collect(13, true, 130);
      const empty = {
        ...completed(14, false),
        completedAt: date(12),
        event: new CollectionRunCompleted({ ...completed(14, false).event, occurredAt: date(12) }),
      };
      f.runs.push(empty);
      await f.intake.execute({ ...empty.event }, f.signal);
      for (let i = 0; i < 3; i++) await f.service.execute(25, f.signal);
      expect(f.state().runs).toContain(empty.runId);
      expect(f.state().current?.acquisitions).toHaveLength(existing ? 2 : 1);
      expect(f.state().current?.status).toBe(existing ? 'removed' : 'active');
      if (existing)
        expect(f.state().current?.history.at(-1)).toMatchObject({
          type: 'removed',
          effectiveAt: date(12),
          provenance: { observedAt: date(1) },
        });
      else expect(f.state().current?.history.map((entry) => entry.type)).toEqual(['created']);
      await f.collect(15, true, 130);
      expect(f.state().current?.acquisitions).toHaveLength(existing ? 3 : 2);
      expect(f.state().current?.status).toBe('active');
    }
  });
  it.each([true, false])(
    'retains completion-driven inversion without legacy backfill (existing=%s)',
    async (existing) => {
      const f = fixture();
      if (existing) await f.collect(1);
      await f.collect(13, true, 130, 'Thirteen.');
      const before = JSON.stringify(f.state().outbox);
      const inverted = new CollectionSnapshotParsed({
        ...fact(14, 120, 'Twelve.'),
        payload: {
          ...fact(14, 120, 'Twelve.').payload,
          source: { ...fact(14).payload.source, observedAt: date(12) },
        },
      });
      f.runs.push(completed(14));
      f.facts.push(inverted);
      await f.intake.execute({ ...completed(14).event }, f.signal);
      for (let i = 0; i < 3; i++) await f.service.execute(25, f.signal);
      expect(f.state().current?.acquisitions).toHaveLength(existing ? 3 : 2);
      expect(f.state().current?.acquisitions.at(-1)?.original.payload.source.observedAt).toBe(
        date(13),
      );
      expect(
        f
          .state()
          .outbox.slice(-2)
          .map((item) => item.type),
      ).toEqual(['properties.listing.price-changed', 'properties.listing.description-changed']);
      expect(f.state().outbox.at(-2)?.payload).toMatchObject({
        previousMinorUnits: 130,
        effectiveAt: date(12),
      });
      expect(JSON.stringify(f.state().outbox.slice(0, -2))).toBe(before);
      await f.collect(15, true, 150, 'Fifteen.');
      expect(f.state().outbox.at(-2)?.payload).toMatchObject({ previousMinorUnits: 120 });
    },
  );
  it.each([true, false])(
    'copies only a genuinely retained legacy creation inside the listing transaction (available=%s)',
    async (available) => {
      const f = fixture();
      const initial = fact(1);
      const property = new Property(id(1000), id(1001), initial, place);
      const creation = property.creationEvent(id(1002));
      f.state().properties.push(property);
      f.state().facts.push(initial);
      f.facts.push(initial);
      f.state().queued = true;
      f.publications.find = async (tx, aggregateId, type) => {
        expect(tx).toBeInstanceOf(Scope);
        expect(aggregateId).toBe(property.listingId);
        expect(type).toBe('properties.listing.created');
        return available ? creation : null;
      };
      await f.service.execute(25, f.signal);
      expect(f.state().retained).toEqual(available ? [creation] : []);
      expect(f.state().outbox).toEqual([]);
      expect(f.state().current?.revision).toBe(1);
      await f.service.execute(25, f.signal);
      expect(f.state().retained).toEqual(available ? [creation] : []);
    },
  );
  it('recovers authentic pending legacy originals without completion or a new creation, with bounded replay', async () => {
    const f = fixture();
    const initial = fact(1);
    f.state().properties.push(new Property(id(1000), id(1001), initial, place));
    f.state().facts.push(initial, fact(2, 90), fact(3, 90, 'Legacy changed description.'));
    f.facts.push(initial, fact(2, 90), fact(3, 90, 'Legacy changed description.'));
    f.state().queued = true;
    for (let n = 0; n < 5; n++) await f.service.execute(1, f.signal);
    expect(f.state().current?.acquisitions).toHaveLength(3);
    expect(f.state().current?.history.map((item) => item.type)).toEqual([
      'created',
      'price-changed',
      'description-changed',
    ]);
    expect(f.state().outbox.map((item) => item.type)).toEqual([
      'properties.listing.price-changed',
      'properties.listing.description-changed',
    ]);
    expect(f.state().current?.status).toBe('active');
    const immutable = JSON.stringify(f.state().outbox);
    await f.service.execute(25, f.signal);
    await f.collect(4, true, 80, 'Legacy changed description.');
    expect(f.state().current?.acquisitions).toHaveLength(4);
    expect(JSON.stringify(f.state().outbox.slice(0, 2))).toBe(immutable);
    expect(
      f.state().outbox.filter((item) => item.type === 'properties.listing.created'),
    ).toHaveLength(0);
  });
  it('incorporates older-than-initial pending originals rather than rejecting valid upgrade evidence', async () => {
    const f = fixture();
    const initial = fact(3, 100, 'Creation text.');
    f.state().properties.push(new Property(id(1000), id(1001), initial, place));
    f.state().facts.push(initial, fact(1, 300), fact(2, 200));
    f.facts.push(initial, fact(1, 300), fact(2, 200));
    f.corrections.push(correction(fact(1, 300), 1));
    f.state().queued = true;
    for (let n = 0; n < 5; n++) await f.service.execute(1, f.signal);
    expect(
      f.state().current?.acquisitions.map((item) => item.original.payload.source.observedAt),
    ).toEqual([date(1), date(2), date(3)]);
    expect(f.state().current?.acquisitions[0]?.corrected).not.toBeNull();
    expect(f.state().current?.acquisitions.at(-1)?.original).toEqual(initial);
    expect(f.state().current?.history.map((item) => item.type)).toEqual(['created']);
    expect(f.state().current?.revision).toBe(1);
    expect(f.state().current?.lifeline).toEqual([{ from: date(1), to: null }]);
    expect(f.state().outbox).toEqual([]);
    await f.collect(4, true, 90, 'Creation text.');
    expect(f.state().current?.acquisitions).toHaveLength(4);
    expect(f.state().outbox.map((item) => item.type)).toEqual(['properties.listing.price-changed']);
  });
  it.each(['before original', 'after original'])(
    'isolates invalid correction geography %s and recovers the next valid order',
    async (timing) => {
      const f = fixture();
      const original = fact(1);
      const invalid = new CollectionSnapshotCorrected({
        ...correction(original, 2),
        payload: {
          ...correction(original, 2).payload,
          listing: {
            ...original.payload.listing,
            location: { ...original.payload.listing.location, street: 'Unknown correction street' },
          },
        },
      });
      if (timing === 'before original') f.corrections.push(invalid);
      await f.collect(1);
      if (timing === 'after original') {
        f.corrections.push(invalid);
        await f.service.execute(25, f.signal);
      }
      expect(f.rejectedCorrections.has(invalid.eventId)).toBe(true);
      expect(f.state().current?.acquisitions[0]?.corrected).toBeNull();
      expect(f.state().outbox.map((item) => item.type)).toEqual(['properties.listing.created']);
      const immutable = JSON.stringify(f.state().outbox);
      f.corrections.push(correction(original, 3));
      await f.service.execute(25, f.signal);
      expect(f.state().current?.acquisitions[0]?.corrected?.payload.correction.order).toBe(3);
      expect(f.state().current?.acquisitions).toHaveLength(1);
      expect(JSON.stringify(f.state().outbox)).toBe(immutable);
      await f.collect(2);
      expect(f.state().current?.acquisitions).toHaveLength(2);
    },
  );
  it('propagates correction infrastructure failure for retry instead of rejecting the original or correction', async () => {
    const f = fixture();
    await f.collect(1);
    f.corrections.push(correction(fact(1)));
    f.options.failure = 'locations';
    await expect(f.service.execute(25, f.signal)).rejects.toThrow('locations');
    expect(f.rejectedCorrections.size).toBe(0);
    expect(f.state().current?.acquisitions[0]?.corrected).toBeNull();
    f.options.failure = '';
    await f.service.execute(25, f.signal);
    expect(f.state().current?.acquisitions[0]?.corrected).not.toBeNull();
    expect(f.state().outbox).toHaveLength(1);
  });
  it('upgrades an immutable existing initial record for a canonical correction without re-emitting creation', async () => {
    const f = fixture({ blocked: true });
    const initial = fact(1);
    f.state().properties.push(new Property(id(1000), id(1001), initial, place));
    f.state().facts.push(initial);
    f.state().queued = true;
    f.corrections.push(correction(initial, 2));
    await f.service.execute(25, f.signal);
    expect(f.state().current?.acquisitions[0]?.corrected?.payload.correction.order).toBe(2);
    expect(f.state().current?.history.map((item) => item.type)).toEqual(['created']);
    expect(f.state().current?.revision).toBe(1);
    expect(f.state().outbox).toEqual([]);
    expect(f.state().properties[0]?.initial).toEqual(initial);
  });
  it('recovers broker-missing originals from authenticated completion before creating atomically', async () => {
    const f = fixture();
    expect(await f.service.execute(25, f.signal)).toBe(0);
    await f.collect(1);
    expect(f.state().properties).toHaveLength(1);
    expect(f.state().facts).toHaveLength(1);
    expect(f.state().outbox.map((item) => item.type)).toEqual(['properties.listing.created']);
    expect(f.state().current?.acquisitions).toHaveLength(1);
    await f.intake.execute({ ...f.runs[0]!.event }, f.signal);
    expect(f.state().inbox).toHaveLength(1);
  });
  it('handles unchanged acquisitions, original value ordering, absence and return without changing IDs', async () => {
    const f = fixture();
    await f.collect(1);
    const propertyId = f.state().properties[0]!.propertyId;
    await f.collect(2);
    await f.collect(3, true, 90, 'Changed description.');
    await f.collect(4, false);
    await f.collect(5, false);
    await f.collect(6, true, 80, 'Returned description.');
    expect(f.state().outbox.map((item) => item.type)).toEqual([
      'properties.listing.created',
      'properties.listing.price-changed',
      'properties.listing.description-changed',
      'properties.listing.removed',
      'properties.listing.reappeared',
      'properties.listing.price-changed',
      'properties.listing.description-changed',
    ]);
    expect(f.state().current?.acquisitions).toHaveLength(4);
    expect(f.state().current?.revision).toBe(7);
    expect(f.state().properties[0]!.propertyId).toBe(propertyId);
  });
  it.each(['fact', 'entity', 'history', 'outbox'])(
    'rolls back all listing effects at the %s boundary and retries exactly once',
    async (stage) => {
      const f = fixture();
      f.options.failure = stage;
      const run = completed(1);
      f.runs.push(run);
      f.facts.push(fact(1));
      await f.intake.execute({ ...run.event }, f.signal);
      await expect(f.service.execute(25, f.signal)).rejects.toThrow('Injected');
      expect(f.state().properties).toEqual([]);
      expect(f.state().facts).toEqual([]);
      expect(f.state().current).toBeNull();
      expect(f.state().outbox).toEqual([]);
      f.options.failure = '';
      await f.service.execute(25, f.signal);
      expect(f.state().outbox).toHaveLength(1);
    },
  );
  it('retries already-committed listing effects after a source progress crash without duplicating revisions', async () => {
    const f = fixture();
    f.options.failure = 'progress';
    f.runs.push(completed(1));
    f.facts.push(fact(1));
    await f.intake.execute({ ...f.runs[0]!.event }, f.signal);
    await expect(f.service.execute(1, f.signal)).rejects.toThrow('progress');
    expect(f.state().outbox).toHaveLength(1);
    f.options.failure = '';
    await f.service.execute(1, f.signal);
    expect(f.state().outbox).toHaveLength(1);
    expect(f.state().current?.revision).toBe(1);
  });
  it('applies the highest authenticated correction without replacing originals or emitting market history', async () => {
    const f = fixture();
    const first = fact(1);
    f.corrections.push(correction(first, 2), correction(first, 1));
    await f.collect(1);
    expect(f.state().current?.acquisitions[0]?.corrected?.payload.correction.order).toBe(2);
    const originalBytes = JSON.stringify(f.state().outbox);
    await f.collect(2);
    f.corrections.push(correction(first, 3));
    await f.service.execute(25, f.signal);
    expect(f.state().current?.acquisitions[0]?.corrected?.payload.correction.order).toBe(3);
    expect(
      f.state().current?.acquisitions.at(-1)?.original.payload.listing.askingPriceMinorUnits,
    ).toBe(100);
    expect(JSON.stringify(f.state().outbox)).toBe(originalBytes);
    expect(f.state().current?.acquisitions).toHaveLength(2);
  });
  it('keeps corrections pending until the original arrives and rejects counterfeit completion authorities', async () => {
    const f = fixture();
    f.corrections.push(correction(fact(2)));
    f.runs.push(completed(1, false));
    await f.intake.execute({ ...f.runs[0]!.event }, f.signal);
    await f.service.execute(25, f.signal);
    expect(f.state().corrections).toEqual([]);
    f.options.refuse = true;
    await expect(f.intake.execute({ ...completed(3).event }, f.signal)).rejects.toThrow();
    await expect(f.intake.execute({ ...fact(1) }, f.signal)).rejects.toThrow();
    expect(f.state().inbox).toHaveLength(1);
    f.options.refuse = false;
    await f.service.execute(25, f.signal);
    await f.collect(2);
    expect(f.state().current?.acquisitions[0]?.corrected).not.toBeNull();
  });
  it('respects a canonical earlier-run barrier, current permission refusal, invalid geography and cancellation', async () => {
    const f = fixture();
    f.runs.push(completed(1));
    f.facts.push(fact(1));
    await f.intake.execute({ ...f.runs[0]!.event }, f.signal);
    f.options.blocked = true;
    expect(await f.service.execute(25, f.signal)).toBe(0);
    f.options.blocked = false;
    f.options.refuse = true;
    await expect(f.service.execute(25, f.signal)).rejects.toThrow();
    f.options.refuse = false;
    f.options.unknownAddress = true;
    expect(await f.service.execute(25, f.signal)).toBe(1);
    expect(f.state().outbox).toEqual([]);
    expect(f.state().runs).toEqual([id(10)]);
    const controller = new AbortController();
    controller.abort();
    await expect(f.service.execute(25, controller.signal)).rejects.toThrow();
    await expect(f.intake.execute({ ...f.runs[0]!.event }, controller.signal)).rejects.toThrow();
    for (const limit of [0, 101, 1.5])
      await expect(f.service.execute(limit, f.signal)).rejects.toThrow(RangeError);
  });
});
