import { describe, expect, it, vi } from 'vitest';
import { PropertiesEvent, PropertiesEventV2, type ListingFact } from '@rei/domain';
import { Transaction, type TransactionRunner } from '../shared/index.js';
import { ConsumeMarketListing } from './consume-market-listing.service.js';
import type { MarketListingEvent, MarketPriceFactsEvent } from './market-price-facts.port.js';

const id = (n: number) => `0199c8f2-2394-7000-8000-${String(n).padStart(12, '0')}`;
const date = '2026-10-10T12:00:00.000Z';
function event(revision = 1, eventId = id(revision + 10), effectiveAt = date): MarketListingEvent {
  const listing: ListingFact = {
    listingId: id(1),
    propertyId: id(2),
    sourceId: 'synthetic-source',
    sourceListingId: 'listing-1',
    placeId: 'block',
    propertyType: 'apartment',
    areaSquareMeters: 10,
    status: 'active',
    askingPriceMinorUnits: 10000 + revision,
    currency: 'BRL',
    effectiveAt,
    provenance: {
      sourceId: 'synthetic-source',
      sourceListingId: 'listing-1',
      sourceUrl: 'https://source.invalid/1',
      runId: id(3),
      snapshotId: id(4),
      contentHash: `sha256:${'a'.repeat(64)}`,
      observedAt: effectiveAt,
    },
  };
  return new PropertiesEvent('properties.listing.created', {
    eventId,
    aggregateId: id(1),
    occurredAt: date,
    payload: { revision, effectiveAt, listing },
  });
}
interface State {
  evidence: MarketPriceFactsEvent[];
  current: MarketPriceFactsEvent | null;
  inbox: string[];
}
class Scope extends Transaction {
  public constructor(public readonly state: State) {
    super();
  }
}
function fixture(fail?: 'fact' | 'inbox', cancel?: 'fact' | 'inbox') {
  let state: State = { evidence: [], current: null, inbox: [] };
  const controller = new AbortController();
  const checkpoint = (stage: 'fact' | 'inbox') => {
    if (fail === stage) throw new Error('Injected failure');
    if (cancel === stage) controller.abort(new Error('Cancelled delivery'));
  };
  const transactions: TransactionRunner = {
    async runInTransaction(work, signal) {
      const working = {
        evidence: [...state.evidence],
        current: state.current,
        inbox: [...state.inbox],
      };
      signal?.throwIfAborted();
      const result = await work(new Scope(working));
      signal?.throwIfAborted();
      state = working;
      return result;
    },
  };
  const project = vi.fn(async (tx: Transaction, incoming: MarketPriceFactsEvent) => {
    if (!(tx instanceof Scope)) throw new Error('Wrong transaction');
    const previous = tx.state.evidence.find(
      (stored) =>
        stored.eventId === incoming.eventId ||
        stored.payload.revision === incoming.payload.revision,
    );
    const business = (item: MarketPriceFactsEvent) =>
      JSON.stringify({ ...item, traceContext: null });
    if (previous && business(previous) !== business(incoming))
      throw new Error('Permanent conflict');
    if (!previous) tx.state.evidence.push(incoming);
    if (!tx.state.current || incoming.payload.revision > tx.state.current.payload.revision)
      tx.state.current = incoming;
    checkpoint('fact');
  });
  const record = vi.fn(async (tx: Transaction, _consumer: string, eventId: string) => {
    if (!(tx instanceof Scope)) throw new Error('Wrong transaction');
    const fresh = !tx.state.inbox.includes(eventId);
    if (fresh) tx.state.inbox.push(eventId);
    checkpoint('inbox');
    return fresh;
  });
  return {
    service: new ConsumeMarketListing({ project }, transactions, { record }),
    controller,
    state: () => state,
    project,
    record,
  };
}
describe('Market listing consumer', () => {
  it('projects a causal property snapshot before recording the shared inbox', async () => {
    const f = fixture();
    const listing = event().payload.listing;
    const current = {
      propertyId: listing.propertyId,
      placeId: listing.placeId,
      areaSquareMeters: listing.areaSquareMeters,
      minimumMinorUnits: listing.askingPriceMinorUnits,
      currency: listing.currency,
      selectedListingId: listing.listingId,
      provenance: listing.provenance,
      activeListingIds: [listing.listingId],
    };
    const incoming = new PropertiesEventV2('properties.property.asking-price-changed', {
      eventId: id(100),
      aggregateId: listing.propertyId,
      occurredAt: date,
      payload: {
        revision: 2,
        effectiveAt: date,
        previous: { ...current, minimumMinorUnits: 20000 },
        current,
        listingStates: [{ listing, revision: 3, assignmentRevision: 1 }],
      },
    });
    await f.service.execute(incoming, f.controller.signal);
    expect(f.state().evidence).toEqual([incoming]);
    expect(f.state().inbox).toEqual([incoming.eventId]);
    expect(f.project.mock.invocationCallOrder[0]).toBeLessThan(
      f.record.mock.invocationCallOrder[0]!,
    );
    for (const failed of [
      fixture('fact'),
      fixture('inbox'),
      fixture(undefined, 'fact'),
      fixture(undefined, 'inbox'),
    ]) {
      await expect(failed.service.execute(incoming, failed.controller.signal)).rejects.toThrow();
      expect(failed.state()).toEqual({ evidence: [], current: null, inbox: [] });
    }
  });
  it('rejects a valid property-level event outside the five listing subscriptions', async () => {
    const f = fixture();
    const fact = event().payload.listing;
    const minimum = {
      propertyId: fact.propertyId,
      placeId: fact.placeId,
      areaSquareMeters: fact.areaSquareMeters,
      minimumMinorUnits: fact.askingPriceMinorUnits,
      currency: fact.currency,
      selectedListingId: fact.listingId,
      provenance: fact.provenance,
      activeListingIds: [fact.listingId],
    };
    const propertyEvent = new PropertiesEvent('properties.property.asking-price-changed', {
      eventId: id(100),
      aggregateId: fact.propertyId,
      occurredAt: date,
      payload: {
        revision: 1,
        effectiveAt: date,
        previous: minimum,
        current: { ...minimum, minimumMinorUnits: fact.askingPriceMinorUnits + 1 },
      },
    });
    await expect(f.service.execute(propertyEvent, f.controller.signal)).rejects.toThrow();
    expect(f.project).not.toHaveBeenCalled();
    expect(f.record).not.toHaveBeenCalled();
  });
  it('preserves the highest revision when time regresses and permanently fences replay', async () => {
    const f = fixture();
    for (const item of [
      event(3, id(13), '2026-10-09T12:00:00.000Z'),
      event(2),
      event(1),
      event(3, id(13), '2026-10-09T12:00:00.000Z'),
    ])
      await f.service.execute({ ...item }, f.controller.signal);
    expect(f.state().evidence).toHaveLength(3);
    expect(f.state().current!.payload.revision).toBe(3);
    f.state().inbox.length = 0;
    await f.service.execute({ ...event() }, f.controller.signal);
    expect(f.state().evidence).toHaveLength(3);
    const before = structuredClone(f.state());
    await expect(f.service.execute({ ...event(2, id(99)) }, f.controller.signal)).rejects.toThrow(
      'Permanent conflict',
    );
    await expect(f.service.execute({ ...event(2, id(11)) }, f.controller.signal)).rejects.toThrow(
      'Permanent conflict',
    );
    expect(structuredClone(f.state())).toEqual(before);
    expect(f.project.mock.invocationCallOrder[0]).toBeLessThan(
      f.record.mock.invocationCallOrder[0]!,
    );
  });
  it.each(['fact', 'inbox'] as const)(
    'rolls back every durable effect on %s failure or cancellation',
    async (stage) => {
      for (const f of [fixture(stage), fixture(undefined, stage)]) {
        await expect(f.service.execute({ ...event() }, f.controller.signal)).rejects.toThrow();
        expect(f.state()).toEqual({ evidence: [], current: null, inbox: [] });
      }
    },
  );
  it('rejects malformed events and an already cancelled delivery before any projection', async () => {
    const f = fixture();
    await expect(f.service.execute({ private: true }, f.controller.signal)).rejects.toThrow();
    f.controller.abort(new Error('Already cancelled'));
    await expect(f.service.execute({ ...event() }, f.controller.signal)).rejects.toThrow(
      'Already cancelled',
    );
    expect(f.project).not.toHaveBeenCalled();
  });
});
