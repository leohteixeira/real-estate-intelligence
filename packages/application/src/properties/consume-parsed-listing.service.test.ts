import { describe, expect, it } from 'vitest';
import {
  CollectionSnapshotParsed,
  CollectionSnapshotCorrected,
  parseUuidV7,
  type Property,
  type ResolvedPropertyPlace,
} from '@rei/domain';
import { Transaction, type EventEnvelope, type TransactionRunner } from '../shared/index.js';
import type {
  IncomingFactDisposition,
  ParsedListingFact,
  PropertyRepository,
} from './property.repository.js';
import { ConsumeParsedListing } from './consume-parsed-listing.service.js';

const id = (n: number) => parseUuidV7(`0199c8f2-2394-7000-8000-${String(n).padStart(12, '0')}`);
const event = new CollectionSnapshotParsed({
  eventId: id(3),
  aggregateId: id(2),
  occurredAt: '2026-10-10T12:01:00.000Z',
  payload: {
    run: { runId: id(1) },
    snapshot: { snapshotId: id(2), contentHash: `sha256:${'a'.repeat(64)}` },
    source: {
      sourceId: 'synthetic-data',
      sourceListingId: 'SYN-SP-0001',
      sourceUrl: 'https://synthetic.invalid/SYN-SP-0001',
      observedAt: '2026-10-10T12:00:00.000Z',
    },
    listing: {
      propertyType: 'apartment',
      askingPriceMinorUnits: 78500000,
      currency: 'BRL',
      areaSquareMeters: 82.5,
      bedrooms: 2,
      bathrooms: 2,
      parkingSpaces: 1,
      features: ['balcony'],
      location: {
        city: 'São Paulo',
        stateCode: 'SP',
        neighborhood: 'Bela Vista',
        street: 'Avenida Exemplo',
      },
      listedAt: '2026-10-01T12:00:00.000Z',
      advertiser: { type: 'private', agencyName: null },
      maskedDescription: 'Synthetic description.',
      imageFingerprints: ['synthetic-fingerprint'],
    },
  },
});
const refs: ResolvedPropertyPlace = {
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
interface State {
  inbox: string[];
  facts: { event: ParsedListingFact; disposition: IncomingFactDisposition }[];
  properties: Property[];
  outbox: EventEnvelope[];
}
class Scope extends Transaction {
  public constructor(public readonly state: State) {
    super();
  }
}

function fixture(
  options: { failure?: string; cancel?: string; unknownAddress?: boolean; refuse?: boolean } = {},
) {
  let state: State = { inbox: [], facts: [], properties: [], outbox: [] };
  let serial = Promise.resolve();
  let nextId = 100;
  const controller = new AbortController();
  const evidence = new Map<string, ParsedListingFact>([[event.eventId, event]]);
  const geographyCalls: { address: unknown; transaction: Transaction | undefined }[] = [];
  let verifiedScope: Transaction | undefined;
  const checkpoint = (stage: string) => {
    if (options.failure === stage) throw new Error('Injected rollback.');
    if (options.cancel === stage) controller.abort(new Error('Injected cancellation.'));
  };
  const transactions: TransactionRunner = {
    async runInTransaction(work, signal) {
      const prior = serial;
      let release!: () => void;
      serial = new Promise((resolve) => {
        release = resolve;
      });
      await prior;
      const working = {
        inbox: [...state.inbox],
        facts: [...state.facts],
        properties: [...state.properties],
        outbox: [...state.outbox],
      };
      try {
        signal?.throwIfAborted();
        const result = await work(new Scope(working));
        signal?.throwIfAborted();
        state = working;
        return result;
      } finally {
        release();
      }
    },
  };
  const repository: PropertyRepository = {
    lockSourceIdentity: async () => undefined,
    hasFact: async (tx, eventId) =>
      (tx as Scope).state.facts.some((fact) => fact.event.eventId === eventId),
    findSourceIdentity: async (tx, sourceId, sourceListingId) =>
      (tx as Scope).state.properties.find(
        (property) =>
          property.provenance.sourceId === sourceId &&
          property.provenance.sourceListingId === sourceListingId,
      )?.propertyId ?? null,
    appendFact: async (tx, received, disposition) => {
      (tx as Scope).state.facts.push({ event: received, disposition });
      checkpoint('fact');
    },
    create: async (tx, property) => {
      (tx as Scope).state.properties.push(property);
      checkpoint('entity');
    },
  };
  const service = new ConsumeParsedListing(
    {
      verifyParsedEvent: async (tx, received) => {
        verifiedScope = tx;
        return (
          !options.refuse &&
          JSON.stringify(evidence.get(received.eventId)) === JSON.stringify(received)
        );
      },
    },
    {
      resolveFixtureAddress: async (address, transaction) => {
        expect(verifiedScope).toBeDefined();
        geographyCalls.push({ address, transaction });
        return options.unknownAddress ? null : refs;
      },
    },
    repository,
    transactions,
    {
      record: async (tx, _consumer, eventId) => {
        const working = (tx as Scope).state;
        if (working.inbox.includes(eventId)) return false;
        working.inbox.push(eventId);
        checkpoint('inbox');
        return true;
      },
    },
    {
      append: async (tx, events) => {
        (tx as Scope).state.outbox.push(...events);
        checkpoint('outbox');
      },
    },
    { generate: async () => id(nextId++) },
  );
  return {
    service,
    evidence,
    state: () => state,
    controller,
    options,
    geographyCalls,
    verifiedScope: () => verifiedScope,
  };
}

describe('ConsumeParsedListing atomic initial ingestion', () => {
  it('resolves only verified geography through the exact evidence transaction scope', async () => {
    const f = fixture();
    await f.service.execute({ ...event }, f.controller.signal);
    expect(f.geographyCalls).toHaveLength(1);
    expect(f.geographyCalls[0]!.address).toEqual(event.payload.listing.location);
    expect(f.geographyCalls[0]!.transaction).toBe(f.verifiedScope());
    const refused = fixture({ refuse: true });
    await expect(
      refused.service.execute({ ...event }, refused.controller.signal),
    ).rejects.toThrow();
    expect(refused.geographyCalls).toHaveLength(0);
  });
  it('deduplicates sequential/concurrent/restarted semantic replay even after inbox expiry', async () => {
    const f = fixture();
    await Promise.all(
      Array.from({ length: 8 }, () => f.service.execute({ ...event }, f.controller.signal)),
    );
    const original = f.state().properties[0];
    f.state().inbox.length = 0;
    await f.service.execute({ ...event }, f.controller.signal);
    expect(f.state().properties).toEqual([original]);
    expect(f.state().facts.map((fact) => fact.disposition)).toEqual(['initial']);
    expect(f.state().inbox).toHaveLength(1);
    expect(f.state().outbox.map((outgoing) => outgoing.type)).toEqual([
      'properties.listing.created',
    ]);
  });
  it('durably stages v2 first and later observations without altering the initial view', async () => {
    const f = fixture();
    const correction = new CollectionSnapshotCorrected({
      eventId: id(4),
      aggregateId: event.aggregateId,
      occurredAt: '2026-10-10T14:00:00.000Z',
      payload: {
        ...event.payload,
        listing: { ...event.payload.listing, askingPriceMinorUnits: 76000000 },
        correction: {
          kind: 'parser-correction',
          operationKey: 'reparse-1',
          parserRevision: 'v2',
          originalParsedEventId: event.eventId,
          order: 1,
        },
      },
    });
    f.evidence.set(correction.eventId, correction);
    await f.service.execute({ ...correction }, f.controller.signal);
    expect(f.state().properties).toHaveLength(0);
    expect(f.state().outbox).toHaveLength(0);
    await f.service.execute({ ...event }, f.controller.signal);
    const later = new CollectionSnapshotParsed({
      ...event,
      eventId: id(6),
      aggregateId: id(5),
      payload: {
        ...event.payload,
        snapshot: { ...event.payload.snapshot, snapshotId: id(5) },
        listing: { ...event.payload.listing, askingPriceMinorUnits: 74000000 },
      },
    });
    f.evidence.set(later.eventId, later);
    await f.service.execute({ ...later }, f.controller.signal);
    const laterCorrection = new CollectionSnapshotCorrected({
      ...correction,
      eventId: id(7),
      payload: {
        ...correction.payload,
        correction: { ...correction.payload.correction, operationKey: 'reparse-2', order: 2 },
      },
    });
    f.evidence.set(laterCorrection.eventId, laterCorrection);
    await f.service.execute({ ...laterCorrection }, f.controller.signal);
    expect(f.state().facts.map((fact) => fact.disposition)).toEqual([
      'pending-correction',
      'initial',
      'pending-history',
      'pending-correction',
    ]);
    expect(f.state().properties[0]!.initial.eventId).toBe(event.eventId);
    expect(f.state().properties).toHaveLength(1);
    expect(f.state().outbox).toHaveLength(1);
  });
  it.each(['inbox', 'fact', 'entity', 'outbox'])(
    'rolls back failure after %s and permits a clean retry',
    async (failure) => {
      const f = fixture({ failure });
      await expect(f.service.execute({ ...event }, f.controller.signal)).rejects.toThrow(
        'Injected rollback.',
      );
      expect(f.state()).toEqual({ inbox: [], facts: [], properties: [], outbox: [] });
      delete f.options.failure;
      await f.service.execute({ ...event }, f.controller.signal);
      expect(f.state().properties).toHaveLength(1);
      expect(f.state().outbox).toHaveLength(1);
    },
  );
  it.each(['inbox', 'fact', 'entity', 'outbox'])(
    'rolls back cancellation after %s',
    async (cancel) => {
      const f = fixture({ cancel });
      await expect(f.service.execute({ ...event }, f.controller.signal)).rejects.toThrow(
        'Injected cancellation.',
      );
      expect(f.state()).toEqual({ inbox: [], facts: [], properties: [], outbox: [] });
    },
  );
  it.each([{ refuse: true }, { unknownAddress: true }])(
    'refuses unverified evidence or unknown geography before effects (%j)',
    async (options) => {
      const f = fixture(options);
      await expect(f.service.execute({ ...event }, f.controller.signal)).rejects.toThrow();
      expect(f.state()).toEqual({ inbox: [], facts: [], properties: [], outbox: [] });
    },
  );
  it('rejects malformed events, unsupported versions/types, forged times/values and unowned sources', async () => {
    const f = fixture();
    for (const wire of [
      { ...event, extra: true },
      { ...event, version: 3 },
      { ...event, type: 'collection.run.completed' },
      { ...event, occurredAt: '2026-10-10T12:02:00.000Z' },
      {
        ...event,
        payload: {
          ...event.payload,
          listing: { ...event.payload.listing, askingPriceMinorUnits: 1 },
        },
      },
      {
        ...event,
        payload: {
          ...event.payload,
          source: { ...event.payload.source, sourceId: 'unowned-source' },
        },
      },
    ])
      await expect(f.service.execute(wire, f.controller.signal)).rejects.toThrow();
    expect(f.state()).toEqual({ inbox: [], facts: [], properties: [], outbox: [] });
    f.controller.abort(new Error('Already aborted.'));
    await expect(f.service.execute(event, f.controller.signal)).rejects.toThrow('Already aborted.');
  });
});
