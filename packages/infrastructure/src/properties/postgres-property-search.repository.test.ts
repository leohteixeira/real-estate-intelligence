import { createHash } from 'node:crypto';
import { expect, it, vi } from 'vitest';
import {
  Property,
  ListingChronology,
  CollectionSnapshotCorrected,
  CollectionSnapshotParsed,
} from '@rei/domain';
import type { DatabaseConnection } from '../shared/index.js';
import { PostgresPropertySearchRepository } from './postgres-property-search.repository.js';
import {
  projectCurrentPropertySummary,
  projectInitialProperty,
} from './persisted-property.projection.js';
import { fixtureId, initialProperty, initialEvent } from './property.test-fixture.js';

it('hydrates one stable current group and each unassigned original identity from one SQL snapshot', async () => {
  const original = await initialProperty();
  const secondEvent = new CollectionSnapshotParsed({
    ...initialEvent,
    eventId: fixtureId(103),
    payload: {
      ...initialEvent.payload,
      source: { ...initialEvent.payload.source, sourceListingId: 'second' },
    },
  });
  const second = new Property(fixtureId(110), fixtureId(111), secondEvent, original.resolved);
  const hash = (text: string) => `sha256:${createHash('sha256').update(text).digest('hex')}`;
  const history = new ListingChronology(second, null, hash);
  history.correct(
    new CollectionSnapshotCorrected({
      ...secondEvent,
      eventId: fixtureId(104),
      payload: {
        ...secondEvent.payload,
        listing: { ...secondEvent.payload.listing, areaSquareMeters: 90 },
        correction: {
          kind: 'parser-correction',
          originalParsedEventId: secondEvent.eventId,
          order: 1,
          operationKey: 'owned-correction',
          parserRevision: 'owned-v1',
        },
      },
    }),
    second.resolved,
  );
  const changes = [
    {
      effectiveAt: original.provenance.observedAt,
      previousMinorUnits: 80000000,
      currentMinorUnits: 78500000,
      changePercent: -1.875,
      provenance: original.provenance,
    },
  ];
  const row = (property: Property, assigned = true) => ({
    property_id: original.propertyId,
    original_property_id: property.propertyId,
    listing_id: property.listingId,
    assigned,
    event: property.initial,
    resolved_place: property.resolved,
    state: property === second ? history.state : null,
    price_changes: changes,
  });
  const rows = [
    row(original),
    row(second),
    {
      ...row(original, false),
      property_id: fixtureId(120),
      original_property_id: fixtureId(120),
      listing_id: fixtureId(121),
    },
  ];
  const query = vi.fn<DatabaseConnection['query']>().mockResolvedValue(rows);
  const repository = new PostgresPropertySearchRepository({ query });
  const result = await repository.readCurrent();
  expect(query).toHaveBeenCalledOnce();
  expect(result).toHaveLength(2);
  expect(result[0]).toEqual(
    projectCurrentPropertySummary(
      original.propertyId,
      [
        projectInitialProperty(original, false),
        projectInitialProperty(second, false, history.state),
      ],
      changes,
    ),
  );
  expect(result[0]!.summary).toMatchObject({
    activeListingCount: 2,
    areaSquareMeters: null,
    priceReduced: true,
    askingPrice: { listingId: original.listingId },
  });
  expect(result[1]!.summary.id).toBe(fixtureId(120));
  const sql = query.mock.calls[0]![0];
  expect(sql).toContain('COALESCE(assignment.property_id,listing.property_id)');
  expect(sql).toContain(
    'ORDER BY property_id,listing.source_id,listing.source_listing_id,listing.listing_id',
  );
  expect(sql).not.toMatch(/locations\.|collection\.|platform\.|INSERT|UPDATE|DELETE/);
  // A changed committed snapshot is read again rather than cached.
  history.remove('2026-10-12T12:00:00.000Z', fixtureId(130));
  query.mockResolvedValueOnce([{ ...row(second), state: history.state }]);
  expect((await repository.readCurrent())[0]!.summary).toMatchObject({
    activeListingCount: 0,
    askingPrice: null,
    pricePerSquareMeter: null,
    timeOnMarketDays: 2,
  });
  query.mockResolvedValueOnce([]);
  expect(await repository.readCurrent()).toEqual([]);
});

it('propagates safe failed snapshot reads without prepared fallback', async () => {
  const query = vi
    .fn<DatabaseConnection['query']>()
    .mockRejectedValue(new Error('postgres://user:password@localhost/owned is unavailable'));
  await expect(new PostgresPropertySearchRepository({ query }).readCurrent()).rejects.toThrow();
  await expect(new PostgresPropertySearchRepository({ query }).readCurrent()).rejects.not.toThrow(
    'password',
  );
});
