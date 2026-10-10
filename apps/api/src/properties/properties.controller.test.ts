import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  parseListingResponse,
  parsePlaceResponse,
  parsePlacesResponse,
  parsePropertyResponse,
  parseReductionsResponse,
  parseSearchResponse,
  PROPERTY_SORTS,
  type ErrorResponse,
} from '@rei/contracts';
import {
  SUPPLEMENTARY_LISTING_IDS,
  SUPPLEMENTARY_PROPERTY_IDS,
  syntheticReadId,
} from '@rei/infrastructure';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { configureApi } from '../configure-api';
import { LocationsModule } from '../locations/index';
import { PropertiesModule } from './properties.module';

describe('production properties and locations module HTTP contract', () => {
  let app: INestApplication;
  let base: string;
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [PropertiesModule, LocationsModule],
    }).compile();
    app = module.createNestApplication();
    configureApi(app);
    await app.listen(0, '127.0.0.1');
    const address = app.getHttpServer().address();
    if (!address || typeof address === 'string') throw new Error('Missing HTTP listener');
    base = `http://127.0.0.1:${address.port}`;
  });
  afterAll(async () => {
    await app.close();
  });
  async function get(path: string) {
    const response = await fetch(`${base}/api/v1/${path}`);
    expect(response.status).toBe(200);
    return response.json();
  }
  it('traverses picker → crumbs → search → grouped property → listing → reductions with stable IDs', async () => {
    const roots = parsePlacesResponse(await get('places'));
    expect(roots.items[0]!.propertyCount).toBe(5);
    const zones = parsePlacesResponse(await get('places/sao-paulo/children'));
    expect(zones.items).toHaveLength(5);
    const neighborhood = parsePlacesResponse(await get('places/sao-paulo-centro/children'))
      .items[0]!;
    const place = parsePlaceResponse(await get(`places/${neighborhood.id}`));
    expect(place.place.breadcrumbs.map((crumb) => crumb.id)).toEqual([
      'brazil',
      'sao-paulo-state',
      'sao-paulo',
      'sao-paulo-centro',
      neighborhood.id,
    ]);
    const search = parseSearchResponse(await get(`properties?placeId=${neighborhood.id}`));
    expect(search.totalItems).toBe(1);
    const property = parsePropertyResponse(await get(`properties/${search.items[0]!.id}`));
    expect(property.property.listings).toHaveLength(3);
    expect(property.property.summary.id).toBe(search.items[0]!.id);
    expect(property.property.sale.status).toBe('not-recorded');
    for (const grouped of property.property.listings) {
      const listing = parseListingResponse(await get(`listings/${grouped.id}`));
      expect(listing.listing).toEqual(grouped);
      expect(listing.listing.place.id).toBe(`${place.place.id}-fictional-block`);
      expect(listing.listing.provenance.contentHash).toMatch(/^sha256:/);
    }
    const reductions = parseReductionsResponse(
      await get(`places/${neighborhood.id}/largest-reductions`),
    );
    expect(reductions.items[0]!.propertyId).toBe(property.property.summary.id);
    expect(reductions.items[0]!.currentMinorUnits).toBe(78000000);
    expect(property.property.priceChanges).toHaveLength(2);
    expect(JSON.stringify(property)).not.toMatch(
      /unitNumber|contact|phone|email|photo|imageFingerprint|fingerprint/,
    );
  });
  it.each([
    ['propertyType=house', 1],
    ['minAskingPrice=78000000&maxAskingPrice=78000000', 1],
    ['minPricePerSquareMeter=951220&maxPricePerSquareMeter=951220', 1],
    ['minArea=82&maxArea=82', 2],
    ['minBedrooms=3', 3],
    ['minBathrooms=3', 1],
    ['minParkingSpaces=2', 2],
    ['timeOnMarket=up-to-30', 0],
    ['timeOnMarket=31-to-90', 0],
    ['timeOnMarket=over-90', 5],
    ['timeOnMarket=over-180', 5],
    ['priceReduced=true', 3],
    ['returnedToMarket=true', 1],
    ['multipleListings=true', 3],
    ['returnedToMarket=true&priceReduced=false&multipleListings=true', 1],
    ['returnedToMarket=true&priceReduced=true', 0],
    ['maxAskingPrice=1', 0],
  ])('filters actual HTTP %s', async (query, total) => {
    const response = parseSearchResponse(await get(`properties?${query}`));
    expect(response.totalItems).toBe(total);
    if (total === 0) expect(response.medianPricePerSquareMeter).toBeNull();
  });
  it.each([
    ['minAskingPrice=9007199254740991', 0],
    ['maxAskingPrice=9007199254740991.000', 5],
    ['minPricePerSquareMeter=0.000', 5],
    ['maxPricePerSquareMeter=9007199254740991', 5],
    ['pageSize=1.0000000000000000', 5],
    ['pageSize=20.0', 5],
    ['minBedrooms=0.000&minBathrooms=0&minParkingSpaces=0', 5],
    ['minBedrooms=100.0', 0],
    ['minArea=0.0100000000000000000&maxArea=1000000.00000000000', 5],
    ['minArea=0.0100000000000000001&maxArea=999999.99999999999', 5],
    ['maxArea=0.01', 0],
    ['minArea=1000000', 0],
  ])('accepts exact numeric query boundary %s', async (query, total) => {
    const response = parseSearchResponse(await get(`properties?${query}`));
    expect(response.totalItems).toBe(total);
    if (query.startsWith('pageSize=1.')) expect(response.items).toHaveLength(1);
  });
  it.each(PROPERTY_SORTS)(
    'pages real HTTP %s without omissions and keeps full-set median',
    async (sort) => {
      const expected = parseSearchResponse(await get(`properties?sort=${sort}`));
      const ids = [];
      let cursor: string | null = null;
      do {
        const page = parseSearchResponse(
          await get(`properties?sort=${sort}&pageSize=1${cursor ? `&cursor=${cursor}` : ''}`),
        );
        expect(page.totalItems).toBe(5);
        expect(page.medianPricePerSquareMeter).toBe(expected.medianPricePerSquareMeter);
        ids.push(page.items[0]!.id);
        cursor = page.nextCursor;
      } while (cursor);
      expect(ids).toEqual(expected.items.map((item) => item.id));
    },
  );
  it('returns dated history, gaps, denied text, expired provenance and missing values through HTTP', async () => {
    const vm = parsePropertyResponse(await get(`properties/${syntheticReadId(4)}`));
    const cobalto = vm.property.listings.find(
      (listing) => listing.source.sourceListingId === 'COB-VM-001',
    )!;
    expect(cobalto.lifeline).toHaveLength(2);
    expect(cobalto.history.map((history) => history.type)).toContain('reappeared');
    const denied = parseListingResponse(
      await get(`listings/${SUPPLEMENTARY_LISTING_IDS.deniedText}`),
    );
    expect(denied.listing.description.permission).toBe('denied');
    for (const path of [
      `listings/${SUPPLEMENTARY_LISTING_IDS.deniedText}`,
      `properties/${SUPPLEMENTARY_PROPERTY_IDS.deniedText}`,
    ]) {
      const json = JSON.stringify(await get(path));
      expect(json).not.toMatch(
        /quiet bedrooms|renovated living room|"current"|"versions"|"text"|excerpt/,
      );
    }
    const expired = parseListingResponse(
      await get(`listings/${SUPPLEMENTARY_LISTING_IDS.expiredSnapshot}`),
    );
    expect(expired.listing.snapshot.availability).toBe('expired');
    expect(expired.listing.provenance.contentHash).toMatch(/^sha256:/);
    const inactive = parsePropertyResponse(
      await get(`properties/${SUPPLEMENTARY_PROPERTY_IDS.noActiveListings}`),
    );
    expect(inactive.property.summary.askingPrice).toBeNull();
    expect(inactive.property.summary.bedrooms).toBeNull();
    expect(inactive.property.sale.status).toBe('not-recorded');
    expect(
      parsePlacesResponse(await get('places/sao-paulo-bela-vista-fictional-block/children')).items,
    ).toEqual([]);
    expect(
      parseReductionsResponse(await get('places/sao-paulo-oeste/largest-reductions')).items,
    ).toEqual([]);
  });
  it('serves six place levels, block metadata and canonical block scope through the real modules', async () => {
    let places = parsePlacesResponse(await get('places'));
    for (const [kind, id] of [
      ['country', 'brazil'],
      ['state', 'sao-paulo-state'],
      ['city', 'sao-paulo'],
      ['zone', 'sao-paulo-centro'],
      ['neighborhood', 'sao-paulo-bela-vista'],
      ['street-block', 'sao-paulo-bela-vista-fictional-block'],
    ]) {
      const place = places.items.find((place) => place.id === id)!;
      expect(place.kind).toBe(kind);
      expect(parsePlaceResponse(await get(`places/${id}`)).place).toEqual(place);
      if (kind === 'street-block') {
        expect(place.breadcrumbs).toHaveLength(6);
        expect(place.block).toEqual({
          streetName: 'Rua Cenário Um',
          fromNumber: 100,
          toNumber: 199,
          origin: 'prepared-fixture',
        });
        expect(place.coordinates).toEqual({ latitude: -23.55, longitude: -46.63 });
      } else {
        expect(place.block).toBeNull();
        expect(place.coordinates).toBeNull();
      }
      const results = parseSearchResponse(await get(`properties?placeId=${id}`));
      expect(results.totalItems).toBe(place.propertyCount);
      places = parsePlacesResponse(await get(`places/${id}/children`));
    }
    expect(places.items).toEqual([]);
  });
  it('returns prepared probability/reasons, backend percentages, type/feature agreement and property reductions', async () => {
    const property = parsePropertyResponse(await get(`properties/${syntheticReadId(1)}`)).property;
    expect(property.preparedEvidence.illustrativeProbability).toBe(0.95);
    expect(property.preparedEvidence.probabilityBasis).toBe('prepared-not-calibrated');
    expect(property.preparedEvidence.productionMatchScore).toBeNull();
    expect(
      property.preparedEvidence.reasons.some(
        (reason) => reason.type === 'published-neighborhood-disagreement',
      ),
    ).toBe(true);
    expect(property.sourceAgreement.find((entry) => entry.field === 'propertyType')!.agrees).toBe(
      true,
    );
    expect(property.featureAgreement.find((entry) => entry.feature === 'balcony')).toEqual({
      feature: 'balcony',
      reportingCount: 3,
      reportingPercent: 100,
      listingIds: property.listings.map((listing) => listing.id),
      sourceIds: property.listings.map((listing) => listing.source.sourceId),
    });
    expect(property.priceChanges.map((change) => change.changePercent)).toEqual([-200 / 82, -2.5]);
    const reductions = parseReductionsResponse(await get('places/sao-paulo/largest-reductions'));
    expect(reductions.items.map((row) => row.propertyId)).toEqual(
      [5, 1, 3, 4].map(syntheticReadId),
    );
    expect(new Set(reductions.items.map((row) => row.propertyId)).size).toBe(4);
    const santana = reductions.items.find((row) => row.propertyId === syntheticReadId(3))!;
    expect(santana.previousMinorUnits).toBe(67000000);
    expect(santana.currentMinorUnits).toBe(65500000);
    expect(santana.reductionPercent).toBeCloseTo(150 / 67);
    let cursor: string | null = null;
    const ids = [];
    do {
      const page = parseReductionsResponse(
        await get(
          `places/sao-paulo/largest-reductions?pageSize=1${cursor ? `&cursor=${cursor}` : ''}`,
        ),
      );
      expect(page.totalItems).toBe(4);
      ids.push(page.items[0]!.propertyId);
      cursor = page.nextCursor;
    } while (cursor);
    expect(ids).toEqual(reductions.items.map((row) => row.propertyId));
  });
  it.each([
    'unknown=secret',
    'propertyType=boat',
    'sort=bad',
    'placeId=BAD',
    'minArea=NaN',
    'minArea=Infinity',
    'minArea=-1',
    'minArea=0',
    'minArea=1000001',
    'minArea=2&maxArea=1',
    'minAskingPrice=2&maxAskingPrice=1',
    'minBedrooms=1.5',
    'minBedrooms=101',
    'minBathrooms=-1',
    'minParkingSpaces=bad',
    'timeOnMarket=bad',
    'priceReduced=1',
    'returnedToMarket=TRUE',
    'multipleListings=yes',
    'pageSize=0',
    'pageSize=21',
    'pageSize=1.5',
    'pageSize=1&pageSize=2',
    'sort=most-recent&sort=most-recent',
    'minAskingPrice=9007199254740992',
    'minAskingPrice=9007199254740991.1',
    'maxAskingPrice=9007199254740991.1',
    'minPricePerSquareMeter=9007199254740991.1',
    'maxPricePerSquareMeter=9007199254740991.1',
    'pageSize=1.0000000000000001',
    'minBedrooms=1.0000000000000001',
    'minBathrooms=1.0000000000000001',
    'minParkingSpaces=1.0000000000000001',
    'minArea=0.0099999999999999999',
    'maxArea=0.0099999999999999999',
    'minArea=1000000.00000000001',
    'maxArea=1000000.00000000001',
    'minAskingPrice=1e2',
    'cursor=bad',
    'cursor=',
    'minArea[x]=1',
    '__proto__[x]=1',
    '__proto__=secret',
    'constructor=secret',
    'toString=secret',
    'placeId[]=sao-paulo',
  ])('rejects malformed raw query %s with fresh sanitized request ID', async (query) => {
    const response = await fetch(`${base}/api/v1/properties?${query}`, {
      headers: { 'x-request-id': 'client-controlled' },
    });
    expect(response.status).toBe(400);
    const body = (await response.json()) as ErrorResponse;
    expect(body).toEqual({
      error: {
        code: 'bad_request',
        message: 'The request could not be processed.',
        requestId: expect.any(String),
      },
    });
    expect(body.error.requestId).toBe(response.headers.get('x-request-id'));
    expect(body.error.requestId).not.toBe('client-controlled');
    expect(JSON.stringify(body)).not.toMatch(/secret|stack|Invalid read query/);
  });
  it('rejects changed cursor scope/sort and paging keys on nonpage endpoints', async () => {
    const page = parseSearchResponse(await get('properties?pageSize=1'));
    for (const path of [
      `properties?pageSize=1&sort=most-recent&cursor=${page.nextCursor}`,
      `properties?pageSize=1&placeId=sao-paulo-centro&cursor=${page.nextCursor}`,
      `places/sao-paulo/largest-reductions?pageSize=1&cursor=${page.nextCursor}`,
      'places?pageSize=1',
      'places/sao-paulo?sort=most-recent',
      'places/sao-paulo/children?extra=true',
      `properties/${syntheticReadId(1)}?extra=true`,
      `listings/${syntheticReadId(101)}?extra=true`,
      'places/sao-paulo/largest-reductions?sort=most-recent',
    ])
      expect((await fetch(`${base}/api/v1/${path}`)).status).toBe(400);
  });
  it.each([
    `properties/${syntheticReadId(999)}`,
    `listings/${syntheticReadId(999)}`,
    'places/unknown',
    'places/unknown/children',
    'places/unknown/largest-reductions',
  ])('returns sanitized 404 for valid missing resource %s', async (path) => {
    const response = await fetch(`${base}/api/v1/${path}`);
    expect(response.status).toBe(404);
    const body = (await response.json()) as ErrorResponse;
    expect(body.error.code).toBe('not_found');
    expect(body.error.requestId).toBe(response.headers.get('x-request-id'));
  });
  it.each([
    'properties/bad',
    'listings/bad',
    'places/BAD',
    'places/BAD/children',
    'places/BAD/largest-reductions',
    'properties/%ZZ',
    'listings/%ZZ',
    'places/%ZZ',
  ])('rejects malformed path ID %s', async (path) => {
    const response = await fetch(`${base}/api/v1/${path}`);
    expect(response.status).toBe(400);
    expect(((await response.json()) as ErrorResponse).error.code).toBe('bad_request');
  });
  it.each([
    'properties',
    'properties/unknown',
    'listings',
    'listings/unknown',
    'places',
    'places/unknown',
  ])('rejects unprefixed %s with the existing JSON envelope', async (path) => {
    const response = await fetch(`${base}/${path}`);
    expect(response.status).toBe(404);
    expect(((await response.json()) as ErrorResponse).error).toEqual({
      code: 'not_found',
      message: 'The requested resource was not found.',
      requestId: response.headers.get('x-request-id'),
    });
  });
  it('requires versioned prefix and generates distinct IDs for separate failures', async () => {
    const first = await fetch(`${base}/properties`);
    const second = await fetch(`${base}/properties`);
    expect(first.status).toBe(404);
    expect(((await first.json()) as ErrorResponse).error.code).toBe('not_found');
    expect(first.headers.get('x-request-id')).not.toBe(second.headers.get('x-request-id'));
  });
});
