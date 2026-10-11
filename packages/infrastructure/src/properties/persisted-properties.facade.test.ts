import { describe, expect, it, vi } from 'vitest';
import {
  CollectionSnapshotParsed,
  CollectionSnapshotCorrected,
  ListingChronology,
} from '@rei/domain';
import { createHash } from 'node:crypto';
import { PersistedPropertiesFacade } from './persisted-properties.facade.js';
import { SyntheticPropertiesAdapter } from './synthetic-properties.adapter.js';
import { projectInitialProperty } from './persisted-property.projection.js';
import { fixtureId, initialEvent, initialProperty } from './property.test-fixture.js';

describe('listing provenance and current text permissions', () => {
  it('delegates reductions only to the persisted query, including empty and failed reads', async () => {
    const prepared = new SyntheticPropertiesAdapter();
    const preparedReductions = vi.spyOn(prepared, 'largestReductions');
    const execute = vi.fn(async () => ({
      metadata: {
        dataMode: 'synthetic-stub' as const,
        fixtureVersion: 'persisted-synthetic-reductions-v1',
        asOf: '2026-10-11T12:00:00.000Z',
      },
      items: [],
      nextCursor: null,
      totalItems: 0,
    }));
    const facade = new PersistedPropertiesFacade(
      { getProperty: async () => null, getListing: async () => null },
      { getSourcePermissions: vi.fn(), getSnapshotMetadata: vi.fn() },
      prepared,
      undefined,
      { execute },
    );
    expect((await facade.largestReductions('brazil', {}))!.totalItems).toBe(0);
    expect(execute).toHaveBeenCalledWith('brazil', {});
    execute.mockRejectedValueOnce(new Error('Read unavailable'));
    await expect(facade.largestReductions('brazil', {})).rejects.toThrow('Read unavailable');
    expect(preparedReductions).not.toHaveBeenCalled();
    const unwired = new PersistedPropertiesFacade(
      { getProperty: async () => null, getListing: async () => null },
      { getSourcePermissions: vi.fn(), getSnapshotMetadata: vi.fn() },
      prepared,
    );
    expect(() => unwired.largestReductions('brazil', {})).toThrow(
      'Persisted reductions query is unavailable',
    );
  });
  it('gates every prepared source independently, restores stored text and never fabricates denied text', async () => {
    const prepared = new SyntheticPropertiesAdapter();
    const propertyId = '0199a3e0-0000-7000-8000-000000000001';
    const original = (await prepared.getProperty(propertyId))!;
    const allowed = new Set([original.property.listings[0]!.source.sourceId]);
    const rights = vi.fn(async (sourceId: string) => ({
      sourceId,
      collectionAllowed: true,
      imageFetchingAllowed: false,
      listingTextDisplayAllowed: allowed.has(sourceId),
    }));
    const facade = new PersistedPropertiesFacade(
      { getProperty: async () => null, getListing: async () => null },
      {
        getSourcePermissions: rights,
        getSnapshotMetadata: async (expected) => ({
          availability: 'unavailable',
          collectedAt: expected.observedAt,
          expiresAt: null,
        }),
      },
      prepared,
    );
    for (const listing of (await facade.getProperty(propertyId))!.property.listings) {
      expect(listing.description.permission).toBe(
        allowed.has(listing.source.sourceId) ? 'allowed' : 'denied',
      );
      const detail = (await facade.getListing(listing.id))!;
      expect(detail.listing.description).toEqual(listing.description);
      if (!allowed.has(listing.source.sourceId))
        expect(JSON.stringify(detail)).not.toMatch(/"current"|"versions"|"text"|excerpt/);
    }
    original.property.listings.forEach((listing) => allowed.add(listing.source.sourceId));
    expect(await facade.getProperty(propertyId)).toEqual(original);
    const deniedId = '0199a3e0-0000-7000-8000-000000000991';
    const denied = (await prepared.getListing(deniedId))!;
    allowed.add(denied.listing.source.sourceId);
    expect((await facade.getListing(deniedId))!.listing.description.permission).toBe('denied');
    rights.mockRejectedValue(new Error('Rights unavailable.'));
    await expect(facade.getProperty(propertyId)).rejects.toThrow('Rights unavailable.');
    await expect(facade.getListing(original.property.listings[0]!.id)).rejects.toThrow(
      'Rights unavailable.',
    );
  });
  it('resolves lifecycle using latest dated corrected provenance and defaults direct projection to unavailable', async () => {
    const property = await initialProperty();
    const metadata = vi.fn(async () => ({
      availability: 'expired' as const,
      collectedAt: property.provenance.observedAt,
      expiresAt: '2026-11-09T11:59:59.000Z',
    }));
    const facade = new PersistedPropertiesFacade(
      { getProperty: async () => property, getListing: async () => property },
      {
        getSourcePermissions: async (sourceId) => ({
          sourceId,
          collectionAllowed: true,
          imageFetchingAllowed: false,
          listingTextDisplayAllowed: true,
        }),
        getSnapshotMetadata: metadata,
      },
      new SyntheticPropertiesAdapter(),
    );
    expect(projectInitialProperty(property, true).property.listings[0]!.snapshot.availability).toBe(
      'unavailable',
    );
    expect(
      (await facade.getProperty(property.propertyId))!.property.listings[0]!.snapshot.availability,
    ).toBe('expired');
    expect((await facade.getListing(property.listingId))!.listing.snapshot.availability).toBe(
      'expired',
    );
    expect(metadata).toHaveBeenCalledWith(property.provenance);
    metadata.mockRejectedValue(new Error('Metadata unavailable.'));
    await expect(facade.getListing(property.listingId)).rejects.toThrow('Metadata unavailable.');
  });
  it('unites immutable description events and corrected transitions when corrected versions collapse or newly differ', async () => {
    const property = await initialProperty();
    const hash = (text: string) => `sha256:${createHash('sha256').update(text).digest('hex')}`;
    const chronology = new ListingChronology(property, null, hash);
    const second = new CollectionSnapshotParsed({
      ...initialEvent,
      eventId: fixtureId(23),
      aggregateId: fixtureId(22),
      occurredAt: '2026-10-11T12:00:00.000Z',
      payload: {
        ...initialEvent.payload,
        run: { runId: fixtureId(21) },
        snapshot: {
          snapshotId: fixtureId(22),
          contentHash: initialEvent.payload.snapshot.contentHash,
        },
        source: { ...initialEvent.payload.source, observedAt: '2026-10-11T11:59:59.000Z' },
        listing: { ...initialEvent.payload.listing, maskedDescription: 'A different description.' },
      },
    });
    chronology.observe(second, property.resolved, [fixtureId(24), fixtureId(25)]);
    const originalHistory = JSON.stringify(chronology.state.history);
    const corrected = (text: string, order: number) =>
      new CollectionSnapshotCorrected({
        ...second,
        eventId: fixtureId(30 + order),
        payload: {
          ...second.payload,
          listing: { ...second.payload.listing, maskedDescription: text },
          correction: {
            kind: 'parser-correction',
            originalParsedEventId: second.eventId,
            order,
            operationKey: `test-${order}`,
            parserRevision: `test-${order}`,
          },
        },
      });
    chronology.correct(
      corrected(initialEvent.payload.listing.maskedDescription, 1),
      property.resolved,
    );
    expect(
      projectInitialProperty(property, true, chronology.state).property.listings[0]!.description,
    ).toMatchObject({ versions: [{ effectiveAt: property.provenance.observedAt }] });
    expect(
      projectInitialProperty(property, false, chronology.state).property.listings[0]!.description,
    ).toMatchObject({ changedAt: [second.payload.source.observedAt] });
    chronology.correct(corrected('New corrected description.', 2), property.resolved);
    expect(
      projectInitialProperty(property, false, chronology.state).property.listings[0]!.description,
    ).toMatchObject({ changedAt: [second.payload.source.observedAt] });
    expect(JSON.stringify(chronology.state.history)).toBe(originalHistory);
    const unchanged = new ListingChronology(property, null, hash);
    const equalOriginal = new CollectionSnapshotParsed({
      ...second,
      payload: { ...second.payload, listing: initialEvent.payload.listing },
    });
    unchanged.observe(equalOriginal, property.resolved, [fixtureId(41), fixtureId(42)]);
    const unchangedHistory = JSON.stringify(unchanged.state.history);
    unchanged.correct(
      new CollectionSnapshotCorrected({
        ...corrected('New corrected description.', 1),
        payload: {
          ...corrected('New corrected description.', 1).payload,
          correction: {
            ...corrected('New corrected description.', 1).payload.correction,
            originalParsedEventId: equalOriginal.eventId,
          },
        },
      }),
      property.resolved,
    );
    expect(
      projectInitialProperty(property, false, unchanged.state).property.listings[0]!.description,
    ).toMatchObject({ changedAt: [second.payload.source.observedAt] });
    expect(JSON.stringify(unchanged.state.history)).toBe(unchangedHistory);
  });
});
