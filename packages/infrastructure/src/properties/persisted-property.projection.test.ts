import { describe, expect, it, vi } from 'vitest';
import { Property } from '@rei/domain';
import {
  parseListingResponse,
  parsePropertyResponse,
} from '../../../contracts/src/properties/index.js';
import { SyntheticPropertiesAdapter } from './synthetic-properties.adapter.js';
import { projectInitialProperty } from './persisted-property.projection.js';
import { PersistedPropertiesFacade } from './persisted-properties.facade.js';
import { fixtureId, initialEvent, initialProperty } from './property.test-fixture.js';

describe('persisted initial detail and composite facade', () => {
  it('projects normalized features and inherited per-value provenance with acquisition effective dates', async () => {
    const original = await initialProperty();
    const property = new Property(
      original.propertyId,
      original.listingId,
      {
        ...initialEvent,
        payload: {
          ...initialEvent.payload,
          listing: {
            ...initialEvent.payload.listing,
            features: [' Pool ', 'POOL', 'Unknown\t amenity'],
            bedrooms: 0,
            bathrooms: 0,
            parkingSpaces: 0,
          },
        },
      },
      original.resolved,
    );
    const response = parsePropertyResponse(projectInitialProperty(property, true));
    const listing = response.property.listings[0]!;
    expect(listing.features).toEqual(['pool', 'unknown amenity']);
    expect(response.property.featureAgreement.map((agreement) => agreement.feature)).toEqual(
      listing.features,
    );
    expect([listing.bedrooms, listing.bathrooms, listing.parkingSpaces]).toEqual([0, 0, 0]);
    expect(listing.street).toBe(property.normalized.location.street.value);
    expect(listing.provenance.sourceId).toBe(property.normalized.propertyType.source);
    expect(listing.provenance.sourceUrl).toBe(property.normalized.features[0]!.sourceUrl);
    expect(listing.fieldEffectiveAt).toEqual({
      askingPrice: property.normalized.askingPriceMinorUnits.collectedAt,
      description: property.normalized.maskedDescription.collectedAt,
      attributes: property.normalized.features[0]!.collectedAt,
    });
    expect(listing.provenance.observedAt).not.toBe(initialEvent.occurredAt);
    expect(property.initial.payload.listing.features).toEqual([
      ' Pool ',
      'POOL',
      'Unknown\t amenity',
    ]);
  });
  it.each([
    {
      label: 'unsafe result',
      askingPriceMinorUnits: Number.MAX_SAFE_INTEGER,
      areaSquareMeters: 0.01,
      expected: null,
    },
    {
      label: 'rounded zero',
      askingPriceMinorUnits: 1,
      areaSquareMeters: 1_000_000,
      expected: null,
    },
    {
      label: 'maximum safe result',
      askingPriceMinorUnits: Number.MAX_SAFE_INTEGER,
      areaSquareMeters: 1,
      expected: Number.MAX_SAFE_INTEGER,
    },
    {
      label: 'minimum positive result',
      askingPriceMinorUnits: 1,
      areaSquareMeters: 1,
      expected: 1,
    },
    {
      label: 'ordinary result',
      askingPriceMinorUnits: 78_500_000,
      areaSquareMeters: 82.5,
      expected: 951_515,
    },
  ])(
    'preserves exact asking cents and contract-safe derived money: $label',
    async ({ askingPriceMinorUnits, areaSquareMeters, expected }) => {
      const initial = await initialProperty();
      const property = new Property(
        initial.propertyId,
        initial.listingId,
        {
          ...initialEvent,
          payload: {
            ...initialEvent.payload,
            listing: { ...initialEvent.payload.listing, askingPriceMinorUnits, areaSquareMeters },
          },
        },
        initial.resolved,
      );
      const response = projectInitialProperty(property, true);
      const parsedProperty = parsePropertyResponse(response);
      const parsedListing = parseListingResponse({
        metadata: response.metadata,
        listing: response.property.listings[0],
      });
      expect(parsedProperty.property.summary.askingPrice?.minorUnits).toBe(askingPriceMinorUnits);
      expect(parsedProperty.property.summary.pricePerSquareMeter).toBe(expected);
      expect(parsedProperty.property.listings[0]!.pricePerSquareMeter).toBe(expected);
      expect(parsedListing.listing.askingPriceMinorUnits).toBe(askingPriceMinorUnits);
      expect(parsedListing.listing.pricePerSquareMeter).toBe(expected);
    },
  );
  it('projects strict canonical money, original provenance and honest initial-only state', async () => {
    const property = await initialProperty();
    const response = projectInitialProperty(property, true);
    const summary = response.property.summary;
    expect(summary.askingPrice?.minorUnits).toBe(78500000);
    expect(summary.pricePerSquareMeter).toBe(951515);
    expect(summary.place.kind).toBe('neighborhood');
    expect(summary.breadcrumbs).toHaveLength(5);
    expect(response.metadata.asOf).toBe(initialEvent.payload.source.observedAt);
    expect(response.property.listings[0]!.provenance).toEqual(property.provenance);
    expect(response.property.listings[0]!.collectionCount).toBe(1);
    expect(response.property.listings[0]!.history.map((item) => item.type)).toEqual(['created']);
    expect(response.property.priceChanges).toEqual([]);
    expect(response.property.preparedEvidence.productionMatchScore).toBeNull();
    expect(summary.neighborhoodComparison).toBeNull();
    expect(response.property.sale).toEqual({ status: 'not-recorded' });
    (response.property.listings[0]!.features as string[]).push('caller-only');
    expect(projectInitialProperty(property, true).property.listings[0]!.features).not.toContain(
      'caller-only',
    );
  });
  it('checks current independent text rights on both endpoints and propagates permission failure', async () => {
    const property = await initialProperty();
    const repository = {
      getProperty: vi.fn(async () => property),
      getListing: vi.fn(async () => property),
    };
    const rights = vi.fn(async () => ({
      sourceId: 'synthetic-data',
      collectionAllowed: true,
      imageFetchingAllowed: false,
      listingTextDisplayAllowed: true,
    }));
    const facade = new PersistedPropertiesFacade(
      repository,
      {
        getSourcePermissions: rights,
        getSnapshotMetadata: async (expected) => ({
          availability: 'unavailable',
          collectedAt: expected.observedAt,
          expiresAt: null,
        }),
      },
      new SyntheticPropertiesAdapter(),
    );
    expect(
      (await facade.getProperty(property.propertyId))!.property.listings[0]!.description.permission,
    ).toBe('allowed');
    expect((await facade.getListing(property.listingId))!.listing.description.permission).toBe(
      'allowed',
    );
    rights.mockResolvedValue({
      sourceId: 'synthetic-data',
      collectionAllowed: true,
      imageFetchingAllowed: false,
      listingTextDisplayAllowed: false,
    });
    for (const response of [
      await facade.getProperty(property.propertyId),
      await facade.getListing(property.listingId),
    ]) {
      expect(JSON.stringify(response)).not.toMatch(
        /Bright synthetic|"current"|"versions"|"text"|excerpt/,
      );
    }
    rights.mockRejectedValue(new Error('Dependency unavailable.'));
    await expect(facade.getProperty(property.propertyId)).rejects.toThrow(
      'Dependency unavailable.',
    );
    await expect(facade.getListing(property.listingId)).rejects.toThrow('Dependency unavailable.');
  });
  it('delegates missing detail and search without blending ingested facts', async () => {
    const prepared = new SyntheticPropertiesAdapter();
    const facade = new PersistedPropertiesFacade(
      { getProperty: async () => null, getListing: async () => null },
      {
        getSnapshotMetadata: async (expected) => ({
          availability: 'unavailable',
          collectedAt: expected.observedAt,
          expiresAt: null,
        }),
        getSourcePermissions: async () => {
          throw new Error('Unused.');
        },
      },
      prepared,
    );
    expect(await facade.getProperty(fixtureId(999))).toBeNull();
    expect(await facade.getListing(fixtureId(999))).toBeNull();
    const search = { pageSize: 20, sort: 'lowest-price-per-square-meter' } as const;
    expect(await facade.search(search)).toEqual(await prepared.search(search));
  });
});
