import { describe, expect, it, vi } from 'vitest';
import {
  CollectionSnapshotParsed,
  CollectionSnapshotCorrected,
  ListingChronology,
  Property,
  NormalizedListing,
  INITIAL_RESOLUTION_CONFIGURATION,
  compareResolutionInputs,
  rankLargestReductions,
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
      minimumRule: true,
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
      displayLabel: `Registered ${sourceId}`,
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
    // Each listing carries its own registered source name, with text allowed or denied.
    expect(second.provenance.sourceId).not.toBe(first.provenance.sourceId);
    expect(response.property.listings.map((listing) => listing.source.label)).toEqual([
      `Registered ${second.provenance.sourceId}`,
      `Registered ${first.provenance.sourceId}`,
    ]);
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

  it('builds grouped price history from each listing, never from a cross-source minimum difference', async () => {
    const hash = (text: string) => `sha256:${createHash('sha256').update(text).digest('hex')}`;
    const cheaper = await initialProperty();
    const at = (day: number) => `2026-10-${String(10 + day).padStart(2, '0')}T12:00:00.000Z`;
    const dearerEvent = new CollectionSnapshotParsed({
      ...initialEvent,
      eventId: fixtureId(203),
      aggregateId: fixtureId(202),
      payload: {
        ...initialEvent.payload,
        run: { runId: fixtureId(201) },
        snapshot: { ...initialEvent.payload.snapshot, snapshotId: fixtureId(202) },
        source: {
          ...initialEvent.payload.source,
          sourceId: 'synthetic-portal-aurora',
          sourceListingId: 'OWNED-DEARER',
        },
        listing: {
          ...initialEvent.payload.listing,
          askingPriceMinorUnits: initialEvent.payload.listing.askingPriceMinorUnits + 2_000_000,
        },
      },
    });
    const dearer = new Property(fixtureId(210), fixtureId(211), dearerEvent, cheaper.resolved);
    // The dearer source lowers its own price once; the cheaper source never changes its price,
    // it only leaves and returns, which moves the property minimum up and down again.
    const dearerHistory = new ListingChronology(dearer, null, hash);
    const repriced = dearerEvent.payload.listing.askingPriceMinorUnits - 500_000;
    dearerHistory.observe(
      new CollectionSnapshotParsed({
        ...dearerEvent,
        eventId: fixtureId(223),
        aggregateId: fixtureId(222),
        occurredAt: at(2),
        payload: {
          ...dearerEvent.payload,
          snapshot: { ...dearerEvent.payload.snapshot, snapshotId: fixtureId(222) },
          source: { ...dearerEvent.payload.source, observedAt: at(2) },
          listing: { ...dearerEvent.payload.listing, askingPriceMinorUnits: repriced },
        },
      }),
      dearer.resolved,
      [fixtureId(224), fixtureId(225), fixtureId(226)],
    );
    const cheaperHistory = new ListingChronology(cheaper, null, hash);
    cheaperHistory.remove(at(3), fixtureId(230));
    cheaperHistory.observe(
      new CollectionSnapshotParsed({
        ...initialEvent,
        eventId: fixtureId(233),
        aggregateId: fixtureId(232),
        occurredAt: at(4),
        payload: {
          ...initialEvent.payload,
          snapshot: { ...initialEvent.payload.snapshot, snapshotId: fixtureId(232) },
          source: { ...initialEvent.payload.source, observedAt: at(4) },
        },
      }),
      cheaper.resolved,
      [fixtureId(234), fixtureId(235), fixtureId(236)],
    );
    const low = initialEvent.payload.listing.askingPriceMinorUnits;
    let minimumRule = true;
    let requested = cheaper;
    const facade = new PersistedPropertiesFacade(
      {
        getProperty: async () => requested,
        getListing: async () => requested,
        getCurrentGroup: async () => ({
          propertyId: cheaper.propertyId,
          minimumRule,
          members: [dearer, cheaper],
          states: [
            { listingId: dearer.listingId, state: dearerHistory.state },
            { listingId: cheaper.listingId, state: cheaperHistory.state },
          ],
          comparisons: [],
          configuration: INITIAL_RESOLUTION_CONFIGURATION,
          // Minimum effects of the cheaper source leaving and returning: two sources' prices.
          priceChanges: [
            {
              effectiveAt: at(3),
              previousMinorUnits: low,
              currentMinorUnits: repriced,
              changePercent: ((repriced - low) / low) * 100,
              provenance: dearer.provenance,
            },
            {
              effectiveAt: at(4),
              previousMinorUnits: repriced,
              currentMinorUnits: low,
              changePercent: ((low - repriced) / repriced) * 100,
              provenance: cheaper.provenance,
            },
          ],
        }),
      },
      {
        getSourcePermissions: async (sourceId) => ({
          sourceId,
          collectionAllowed: true,
          imageFetchingAllowed: false,
          listingTextDisplayAllowed: true,
        }),
        getSnapshotMetadata: async (provenance) => ({
          availability: 'unavailable',
          collectedAt: provenance.observedAt,
          expiresAt: null,
        }),
      },
      new SyntheticPropertiesAdapter(),
    );
    const { property } = (await facade.getProperty(cheaper.propertyId))!;
    expect(property.summary.askingPrice).toMatchObject({
      minorUnits: low,
      listingId: cheaper.listingId,
    });
    expect(property.priceChanges).toEqual([
      {
        effectiveAt: at(2),
        previousMinorUnits: dearerEvent.payload.listing.askingPriceMinorUnits,
        currentMinorUnits: repriced,
        changePercent:
          ((repriced - dearerEvent.payload.listing.askingPriceMinorUnits) /
            dearerEvent.payload.listing.askingPriceMinorUnits) *
          100,
        provenance: expect.objectContaining({
          sourceId: 'synthetic-portal-aurora',
          sourceListingId: 'OWNED-DEARER',
        }),
      },
    ]);
    // Every entry belongs to exactly one member listing and matches that listing's own history.
    expect(property.priceChanges).toEqual(
      property.listings.flatMap((listing) =>
        listing.history
          .filter((entry) => entry.type === 'price-changed')
          .map((entry) => expect.objectContaining({ provenance: entry.provenance })),
      ),
    );
    // No listing lowered the price to `low`, yet the minimum dropped when the cheaper listing
    // returned. The page figure is the row the reductions panel ranks from the same effects.
    const panel = rankLargestReductions(
      [
        {
          propertyId: cheaper.propertyId,
          listingId: cheaper.listingId,
          place: cheaper.resolved.place,
          asOf: at(4),
          priceChanges: [
            [at(3), low, repriced, dearer.provenance] as const,
            [at(4), repriced, low, cheaper.provenance] as const,
          ].map(([effectiveAt, previousMinorUnits, currentMinorUnits, provenance]) => ({
            type: 'price-changed' as const,
            effectiveAt,
            previousMinorUnits,
            currentMinorUnits,
            provenance,
          })),
        },
      ],
      at(4),
    )[0]!;
    expect(property.minimumReduction).toEqual({
      effectiveAt: at(4),
      previousMinorUnits: repriced,
      currentMinorUnits: low,
      reductionPercent: ((repriced - low) / repriced) * 100,
    });
    expect(property.minimumReduction).toEqual({
      effectiveAt: panel.effectiveAt,
      previousMinorUnits: panel.previousMinorUnits,
      currentMinorUnits: panel.currentMinorUnits,
      reductionPercent: panel.reductionPercent,
    });
    // Where the reductions read falls back to a listing's own history, so does the page.
    minimumRule = false;
    requested = dearer;
    expect((await facade.getProperty(dearer.propertyId))!.property.minimumReduction).toEqual({
      effectiveAt: at(2),
      previousMinorUnits: dearerEvent.payload.listing.askingPriceMinorUnits,
      currentMinorUnits: repriced,
      reductionPercent:
        ((dearerEvent.payload.listing.askingPriceMinorUnits - repriced) /
          dearerEvent.payload.listing.askingPriceMinorUnits) *
        100,
    });
    requested = cheaper;
    expect((await facade.getProperty(cheaper.propertyId))!.property.minimumReduction).toBeNull();
  });
  it('exposes no score for an actual singleton and preserves missing/prepared detail reads', async () => {
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
          minimumRule: false,
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
    expect(() => facade.search({})).toThrow('Persisted search query is unavailable');
    expect(search).not.toHaveBeenCalled();
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
  it('delegates search only to its dedicated provider and propagates failures', async () => {
    const prepared = new SyntheticPropertiesAdapter();
    const fake = vi.spyOn(prepared, 'search');
    const response = {
      metadata: {
        dataMode: 'synthetic-stub' as const,
        fixtureVersion: 'persisted',
        asOf: '2026-10-01T12:00:00.000Z',
      },
      items: [],
      totalItems: 0,
      nextCursor: null,
      medianPricePerSquareMeter: null,
      placeCounts: [],
    };
    const execute = vi.fn(async () => response);
    const facade = new PersistedPropertiesFacade(
      { getProperty: async () => null, getListing: async () => null },
      { getSourcePermissions: vi.fn(), getSnapshotMetadata: vi.fn() },
      prepared,
      undefined,
      undefined,
      { execute },
    );
    expect(await facade.search({ priceReduced: false })).toBe(response);
    expect(execute).toHaveBeenCalledWith({ priceReduced: false });
    execute.mockRejectedValueOnce(new Error('Search unavailable'));
    await expect(facade.search({})).rejects.toThrow('Search unavailable');
    expect(fake).not.toHaveBeenCalled();
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
    // A source without a registered name is still told apart by its identifier.
    expect((await facade.getListing(property.listingId))!.listing.source.label).toBe(
      property.provenance.sourceId,
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

it('consults permanent Collection authority before returning any prepared fallback member', async () => {
  const prepared = new SyntheticPropertiesAdapter();
  const id = '0199a3e0-0000-7000-8000-000000000001';
  const detail = await prepared.getProperty(id);
  expect(detail).not.toBeNull();
  const member = detail!.property.listings[0]!;
  const isSuppressed = vi.fn(async () => true);
  const facade = new PersistedPropertiesFacade(
    { getProperty: async () => null, getListing: async () => null },
    { getSourcePermissions: async () => null, getSnapshotMetadata: async () => null },
    prepared,
    undefined,
    undefined,
    undefined,
    { isSuppressed, lockAndCheck: async () => true },
  );
  expect(await facade.getProperty(id)).toBeNull();
  expect(await facade.getListing(member.id)).toBeNull();
  expect(isSuppressed).toHaveBeenCalledWith(
    { sourceId: member.provenance.sourceId, sourceListingId: member.provenance.sourceListingId },
    expect.any(AbortSignal),
  );
  isSuppressed.mockRejectedValue(new Error('authority unavailable'));
  await expect(facade.getListing(member.id)).rejects.toThrow('authority unavailable');
});
