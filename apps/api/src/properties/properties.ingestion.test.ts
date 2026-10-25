import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { COLLECTION_FACADE } from '@rei/application';
import { parseListingResponse, parsePropertyResponse } from '@rei/contracts';
import { CollectionSnapshotParsed, Property, parseSha256Hash } from '@rei/domain';
import { SYNTHETIC_LISTING_BYTES, SyntheticLocationsAdapter } from '@rei/infrastructure';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { configureApi } from '../configure-api';
import { DATABASE_CONNECTION } from '../persistence/persistence.module';
import { PropertiesModule } from './properties.module';

const id = (n: number) => `0199c8f2-2394-7000-8000-${String(n).padStart(12, '0')}`;
describe('persisted initial property through production Nest HTTP wiring', () => {
  let app: INestApplication;
  let base: string;
  let property: Property;
  const rights = vi.fn(async () => ({
    sourceId: 'synthetic-data',
    collectionAllowed: true,
    imageFetchingAllowed: false,
    listingTextDisplayAllowed: true,
  }));
  beforeAll(async () => {
    const initial = new CollectionSnapshotParsed({
      eventId: id(3),
      aggregateId: id(2),
      occurredAt: '2026-10-10T12:00:00.000Z',
      traceContext: null,
      payload: {
        run: { runId: id(1) as CollectionSnapshotParsed['payload']['run']['runId'] },
        snapshot: {
          snapshotId: id(2) as CollectionSnapshotParsed['payload']['snapshot']['snapshotId'],
          contentHash: parseSha256Hash(`sha256:${'a'.repeat(64)}`),
        },
        source: {
          sourceId: 'synthetic-data',
          sourceListingId: 'SYN-SP-0001',
          sourceUrl: 'https://synthetic.invalid/listings/SYN-SP-0001',
          observedAt: '2026-10-10T11:59:59.000Z',
        },
        listing: {
          ...JSON.parse(new TextDecoder().decode(SYNTHETIC_LISTING_BYTES)),
          features: [' Pool ', 'POOL', 'Cafe\u0301', 'Unknown\t amenity'],
        },
      },
    });
    property = new Property(
      id(10),
      id(11),
      initial,
      (await new SyntheticLocationsAdapter().resolveFixtureAddress(
        initial.payload.listing.location,
      ))!,
    );
    const module = await Test.createTestingModule({ imports: [PropertiesModule] })
      .overrideProvider(DATABASE_CONNECTION)
      .useValue({
        close: async () => undefined,
        query: async (sql: string, params: readonly unknown[]) => {
          // This initial-only fixture has no current resolution assignment.
          if (sql.startsWith('WITH members AS (')) return [];
          return [property.propertyId, property.listingId].includes(
            params[0] as Property['propertyId'],
          )
            ? [
                {
                  property_id: property.propertyId,
                  listing_id: property.listingId,
                  event: { ...initial },
                  resolved_place: property.resolved,
                },
              ]
            : [];
        },
      })
      .overrideProvider(COLLECTION_FACADE)
      .useValue({
        getSourcePermissions: rights,
        getSnapshotMetadata: async (expected: Property['provenance']) => ({
          availability: 'unavailable',
          collectedAt: expected.observedAt,
          expiresAt: null,
        }),
      })
      .compile();
    app = module.createNestApplication();
    configureApi(app);
    await app.listen(0, '127.0.0.1');
    const address = app.getHttpServer().address();
    if (!address || typeof address === 'string') throw new Error('Missing listener.');
    base = `http://127.0.0.1:${address.port}/api/v1`;
  });
  afterAll(async () => {
    await app.close();
  });
  it('serializes the persisted property and listing through the frozen contract', async () => {
    const response = await fetch(`${base}/properties/${property.propertyId}`);
    expect(response.status).toBe(200);
    const detail = parsePropertyResponse(await response.json());
    expect(detail.property.summary.askingPrice?.minorUnits).toBe(78500000);
    expect(detail.property.summary.pricePerSquareMeter).toBe(951515);
    expect(detail.property.summary.breadcrumbs).toHaveLength(5);
    const listing = await fetch(`${base}/listings/${property.listingId}`);
    expect(listing.status).toBe(200);
    expect(parseListingResponse(await listing.json()).listing).toEqual(detail.property.listings[0]);
    expect(detail.property.listings[0]!.provenance).toEqual(property.provenance);
    expect(detail.property.listings[0]!.features).toEqual(['pool', 'café', 'unknown amenity']);
    expect(detail.property.featureAgreement.map((agreement) => agreement.feature)).toEqual([
      'pool',
      'café',
      'unknown amenity',
    ]);
    expect(detail.property.listings[0]!.fieldEffectiveAt).toEqual({
      askingPrice: property.normalized.askingPriceMinorUnits.collectedAt,
      description: property.normalized.maskedDescription.collectedAt,
      attributes: property.normalized.propertyType.collectedAt,
    });
    for (const value of [
      property.normalized.propertyType,
      property.normalized.askingPriceMinorUnits,
      property.normalized.areaSquareMeters,
      property.normalized.bedrooms,
      property.normalized.bathrooms,
      property.normalized.parkingSpaces,
      ...property.normalized.features,
      ...Object.values(property.normalized.location),
      property.normalized.maskedDescription,
    ]) {
      expect(detail.property.listings[0]!.provenance).toMatchObject({
        sourceId: value.source,
        sourceUrl: value.sourceUrl,
        observedAt: value.collectedAt,
      });
    }
    expect(detail.property.preparedEvidence.productionMatchScore).toBeNull();
  });
  it('revokes text independently on both endpoints and keeps provenance', async () => {
    rights.mockResolvedValue({
      sourceId: 'synthetic-data',
      collectionAllowed: true,
      imageFetchingAllowed: false,
      listingTextDisplayAllowed: false,
    });
    for (const path of [`properties/${property.propertyId}`, `listings/${property.listingId}`]) {
      const response = await fetch(`${base}/${path}`);
      expect(response.status).toBe(200);
      const json = await response.json();
      expect(JSON.stringify(json)).not.toMatch(
        /Bright synthetic|"current"|"versions"|"text"|excerpt/,
      );
      expect(JSON.stringify(json)).toContain(property.provenance.contentHash);
      const listing = path.startsWith('properties')
        ? parsePropertyResponse(json).property.listings[0]!
        : parseListingResponse(json).listing;
      expect(listing.fieldEffectiveAt.description).toBe(
        property.normalized.maskedDescription.collectedAt,
      );
      if (path.startsWith('properties')) parsePropertyResponse(json);
      else parseListingResponse(json);
    }
  });
  it('sanitizes permission failure instead of making the response permissive', async () => {
    rights.mockRejectedValue(new Error('private dependency payload'));
    for (const path of [`properties/${property.propertyId}`, `listings/${property.listingId}`]) {
      const response = await fetch(`${base}/${path}`);
      expect(response.status).toBe(500);
      expect(JSON.stringify(await response.json())).not.toMatch(
        /private|dependency|Bright synthetic|stack/,
      );
    }
  });
});
