import { describe, expect, it, vi } from 'vitest';
import {
  CollectionSnapshotParsed,
  CollectionSnapshotCorrected,
  ListingChronology,
  Property,
  NormalizedListing,
  INITIAL_RESOLUTION_CONFIGURATION,
  compareResolutionInputs,
  type ListingChronologyState,
  type ResolutionInput,
} from '@rei/domain';
import { createHash } from 'node:crypto';
import { PersistedPropertiesFacade } from './persisted-properties.facade.js';
import { SyntheticPropertiesAdapter } from './synthetic-properties.adapter.js';
import { projectInitialProperty } from './persisted-property.projection.js';
import { fixtureId, initialEvent, initialProperty } from './property.test-fixture.js';

describe('listing provenance and current text permissions', () => {
  it('composes actual members with independent rights, requested IDs, source disagreement and active minimum ties', async () => {
    const first = await initialProperty();
    const event = new CollectionSnapshotParsed({
      ...initialEvent,
      eventId: fixtureId(103),
      aggregateId: fixtureId(102),
      payload: {
        ...initialEvent.payload,
        run: { runId: fixtureId(101) },
        snapshot: { ...initialEvent.payload.snapshot, snapshotId: fixtureId(102) },
        source: {
          ...initialEvent.payload.source,
          sourceId: 'synthetic-portal-aurora',
          sourceListingId: 'OWNED-SECOND',
        },
        listing: {
          ...initialEvent.payload.listing,
          areaSquareMeters: 80,
          features: ['balcony'],
          location: {
            ...initialEvent.payload.listing.location,
            neighborhood: 'Published disagreement',
          },
        },
      },
    });
    const second = new Property(fixtureId(110), fixtureId(111), event, first.resolved);
    const input = (property: Property): ResolutionInput => ({
      listingId: property.listingId,
      originalPropertyId: property.propertyId,
      inputEventId: property.initial.eventId,
      inputHash: `sha256:${'a'.repeat(64)}`,
      listing: new NormalizedListing(property.initial),
    });
    const comparison = compareResolutionInputs(input(first), input(second));
    const state = new ListingChronology(
      second,
      null,
      (text) => `sha256:${createHash('sha256').update(text).digest('hex')}`,
    );
    const at = '2026-10-12T12:00:00.000Z';
    state.remove(at, fixtureId(120));
    const group = {
      propertyId: first.propertyId,
      // The requested first listing deliberately follows another member in the projection.
      members: [second, first],
      states: [] as { listingId: string; state: ListingChronologyState | null }[],
      configuration: INITIAL_RESOLUTION_CONFIGURATION,
      comparisons: [comparison],
      priceChanges: [
        {
          effectiveAt: at,
          previousMinorUnits: 80000000,
          currentMinorUnits: 78500000,
          changePercent: -1.875,
          provenance: first.provenance,
        },
      ],
    };
    const metadata = vi.fn(async (provenance: Property['provenance']) => ({
      availability: 'available' as const,
      collectedAt: provenance.observedAt,
      expiresAt: '2026-11-09T11:59:59.000Z',
    }));
    const rights = vi.fn(async (sourceId: string) => ({
      sourceId,
      collectionAllowed: true,
      imageFetchingAllowed: false,
      listingTextDisplayAllowed: sourceId === first.provenance.sourceId,
    }));
    const history = { getState: vi.fn(async () => null) };
    const facade = new PersistedPropertiesFacade(
      {
        getProperty: async () => first,
        getListing: async () => first,
        getCurrentGroup: async () => group,
      },
      {
        getSourcePermissions: rights,
        getSnapshotMetadata: metadata,
      },
      new SyntheticPropertiesAdapter(),
      history,
    );
    const response = (await facade.getProperty(second.propertyId))!;
    expect(response.property.listings.map((listing) => listing.id)).toEqual([
      second.listingId,
      first.listingId,
    ]);
    expect(response.property.listings.map((listing) => listing.position)).toEqual([1, 2]);
    expect(response.property.summary.askingPrice!.listingId).toBe(first.listingId);
    expect(response.property.summary.activeListingCount).toBe(2);
    expect(response.property.summary.areaSquareMeters).toBeNull();
    expect(response.property.summary.bedrooms).toBe(first.normalized.bedrooms.value);
    expect(response.property.summary.priceReduced).toBe(true);
    expect(
      response.property.sourceAgreement.find((field) => field.field === 'neighborhood')!.agrees,
    ).toBe(false);
    expect(
      response.property.sourceAgreement.find((field) => field.field === 'areaSquareMeters')!.agrees,
    ).toBe(false);
    expect(
      response.property.featureAgreement.find((feature) => feature.feature === 'balcony'),
    ).toMatchObject({ reportingCount: 2, reportingPercent: 100 });
    expect(response.property.preparedEvidence).toMatchObject({
      kind: 'deterministic-rule',
      productionMatchScore: comparison.probability,
      rawProbability: comparison.rawProbability,
      configurationId: INITIAL_RESOLUTION_CONFIGURATION.id,
      probabilityBasis: 'deterministic-uncalibrated',
    });
    expect(response.property.listings[0]!.description.permission).toBe('denied');
    expect(response.property.listings[1]!.description.permission).toBe('allowed');
    expect(metadata).toHaveBeenCalledWith(first.provenance);
    expect(metadata).toHaveBeenCalledWith(second.provenance);
    expect((await facade.getListing(first.listingId))!.listing.id).toBe(first.listingId);
    expect(history.getState).not.toHaveBeenCalled();
    group.states = [{ listingId: second.listingId, state: state.state }];
    expect((await facade.getProperty(first.propertyId))!.property.summary.activeListingCount).toBe(
      1,
    );
    group.states.push({
      listingId: first.listingId,
      state: new ListingChronology(
        first,
        null,
        (text) => `sha256:${createHash('sha256').update(text).digest('hex')}`,
      ).state,
    });
    const firstRemoved = new ListingChronology(
      first,
      null,
      (text) => `sha256:${createHash('sha256').update(text).digest('hex')}`,
    );
    firstRemoved.remove(at, fixtureId(121));
    group.states[1] = { listingId: first.listingId, state: firstRemoved.state };
    const inactive = (await facade.getProperty(first.propertyId))!;
    expect(inactive.property.summary.askingPrice).toBeNull();
    expect(inactive.property.summary.pricePerSquareMeter).toBeNull();
    expect(inactive.metadata.asOf).toBe(at);
    expect(inactive.property.summary.timeOnMarketDays).toBe(2);
    metadata.mockRejectedValue(new Error('Group snapshot unavailable'));
    await expect(facade.getProperty(first.propertyId)).rejects.toThrow(
      'Group snapshot unavailable',
    );
  });

  it('exposes no score for an actual singleton and preserves missing/prepared reads and search', async () => {
    const property = await initialProperty();
    const prepared = new SyntheticPropertiesAdapter();
    const search = vi.spyOn(prepared, 'search');
    const facade = new PersistedPropertiesFacade(
      {
        getProperty: async () => property,
        getListing: async () => property,
        getCurrentGroup: async () => ({
          propertyId: property.propertyId,
          members: [property],
          states: [],
          comparisons: [],
          configuration: INITIAL_RESOLUTION_CONFIGURATION,
          priceChanges: [],
        }),
      },
      {
        getSourcePermissions: async (sourceId) => ({
          sourceId,
          collectionAllowed: true,
          imageFetchingAllowed: false,
          listingTextDisplayAllowed: true,
        }),
        getSnapshotMetadata: async () => ({
          availability: 'unavailable',
          collectedAt: property.provenance.observedAt,
          expiresAt: null,
        }),
      },
      prepared,
    );
    expect(
      (await facade.getProperty(property.propertyId))!.property.preparedEvidence,
    ).toMatchObject({
      kind: 'deterministic-rule',
      productionMatchScore: null,
      rawProbability: null,
      reasons: [],
    });
    await facade.search({});
    expect(search).toHaveBeenCalledWith({});
    const missing = new PersistedPropertiesFacade(
      { getProperty: async () => null, getListing: async () => null },
      {
        getSourcePermissions: vi.fn(),
        getSnapshotMetadata: vi.fn(),
      },
      prepared,
    );
    expect(await missing.getProperty(fixtureId(999))).toBeNull();
    expect(await missing.getListing(fixtureId(999))).toBeNull();
  });
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
