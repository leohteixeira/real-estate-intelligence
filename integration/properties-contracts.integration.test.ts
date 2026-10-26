import { randomUUID } from 'node:crypto';
import { expect, test } from 'vitest';
import type { SearchResponse } from '../packages/contracts/dist/index.js';
import {
  parseListingResponse,
  parsePlaceResponse,
  parsePlacesResponse,
  parsePropertyResponse,
  parseReductionsResponse,
  parseSearchResponse,
  PROPERTY_SORTS,
} from '../packages/contracts/dist/index.js';
import {
  DatabaseConnection,
  SUPPLEMENTARY_LISTING_IDS,
  SUPPLEMENTARY_PROPERTY_IDS,
  syntheticReadId,
} from '../packages/infrastructure/dist/index.js';
import {
  allocatePorts,
  cleanupAll,
  preserveCleanup,
  withPreparedSearchCampaign as withCampaign,
} from './support/fixture.ts';
import { requestHttp } from './support/http.ts';
test('properties-contracts preserves its complete real-service campaign', async () => {
  await withCampaign(async ({ command }) => {
    const run = command;
    const project = `rei-properties-${process.pid}-${randomUUID().slice(0, 8)}`;
    async function port() {
      const [selected] = await allocatePorts(1);
      expect(Number.isInteger(selected)).toBeTruthy();
      return selected;
    }
    const postgresPort = await port();
    const apiPort = await port();
    const environment = {
      ...process.env,
      COMPOSE_FILE: 'compose.yaml',
      COMPOSE_PROJECT_NAME: project,
      COMPOSE_PROFILES: '',
      COMPOSE_DISABLE_ENV_FILE: '1',
      COMPOSE_ENV_FILES: '',
      NODE_ENV: 'test',
      POSTGRES_DB: 'rei_properties_fixture',
      POSTGRES_USER: 'rei_properties_fixture',
      POSTGRES_PASSWORD: 'rei-properties-synthetic-fixture',
      POSTGRES_PORT: String(postgresPort),
      API_PORT: String(apiPort),
      OTEL_EXPORTER_OTLP_ENDPOINT: '',
    };
    async function compose(...args: string[]) {
      return run(
        'docker',
        ['compose', '--file', 'compose.yaml', '--project-name', project, ...args],
        {
          cwd: new URL('..', import.meta.url),
          env: environment,
          timeout: 240000,
          maxBuffer: 10 * 1024 * 1024,
        },
      );
    }
    async function releasePorts() {}
    const base = `http://127.0.0.1:${apiPort}`;
    let requests = 0;
    async function get<
      T extends (value: unknown) => {
        metadata: { dataMode: string; fixtureVersion: string; asOf: string };
      },
    >(path: string, parser: T) {
      const response = await requestHttp(`${base}/api/v1/${path}`, {
        signal: AbortSignal.timeout(5000),
      });
      requests++;
      expect(response.status, path).toBe(200);
      const body = parser(await response.json());
      expect(body.metadata.dataMode).toBe('synthetic-stub');
      if (Object.is(parser, parseReductionsResponse)) {
        expect(body.metadata.fixtureVersion).toBe('persisted-synthetic-reductions-v1');
        expect(Number.isFinite(Date.parse(body.metadata.asOf))).toBeTruthy();
      } else expect(body.metadata.asOf).toBe('2026-10-01T12:00:00.000Z');
      return body as ReturnType<T>;
    }
    const failureIds = new Set();
    async function error(path: string, status: number, prefixed = true) {
      const response = await requestHttp(`${base}${prefixed ? '/api/v1' : ''}/${path}`, {
        headers: { 'x-request-id': 'client-controlled' },
        signal: AbortSignal.timeout(5000),
      });
      requests++;
      expect(response.status, path).toBe(status);
      expect(response.headers.get('content-type') ?? '', path).toMatch(/^application\/json/);
      const body = (await response.json()) as {
        error: { code: string; message: string; requestId: string };
      };
      expect(Object.keys(body)).toStrictEqual(['error']);
      expect(Object.keys(body.error).sort()).toStrictEqual(['code', 'message', 'requestId']);
      expect(body.error.code).toBe(status === 400 ? 'bad_request' : 'not_found');
      expect(body.error.message).toBe(
        status === 400
          ? 'The request could not be processed.'
          : 'The requested resource was not found.',
      );
      expect(body.error.requestId).toBe(response.headers.get('x-request-id'));
      expect(body.error.requestId).not.toBe('client-controlled');
      expect(!failureIds.has(body.error.requestId)).toBeTruthy();
      failureIds.add(body.error.requestId);
    }
    async function unchangedCounts(connection: DatabaseConnection) {
      const rows = await connection.query<{ runs: number; snapshots: number; events: number }>(
        'SELECT (SELECT count(*) FROM collection.collection_run)::integer AS runs, (SELECT count(*) FROM collection.raw_object)::integer AS snapshots, (SELECT count(*) FROM platform.outbox)::integer AS events',
      );
      return rows[0];
    }
    let connection: DatabaseConnection;
    {
      let cleanupPrimary1: unknown;
      let cleanupPrimaryThrown1 = false;
      try {
        await releasePorts();
        console.log(`Starting isolated properties HTTP campaign ${project}.`);
        await compose('up', '--detach', '--build', '--wait', 'postgres', 'migrations', 'api');
        const databaseUrl = new URL(`postgres://127.0.0.1:${postgresPort}`);
        databaseUrl.username = environment.POSTGRES_USER;
        databaseUrl.password = environment.POSTGRES_PASSWORD;
        databaseUrl.pathname = environment.POSTGRES_DB;
        connection = new DatabaseConnection(databaseUrl.toString());
        const before = await unchangedCounts(connection);
        const roots = await get('places', parsePlacesResponse);
        expect(roots!.items[0]!.propertyCount).toBe(5);
        const zones = await get('places/sao-paulo/children', parsePlacesResponse);
        expect(zones.items.length).toBe(5);
        const neighborhoods = await get('places/sao-paulo-centro/children', parsePlacesResponse);
        const placeId = neighborhoods!.items[0]!.id;
        const place = await get(`places/${placeId}`, parsePlaceResponse);
        expect(place.place.breadcrumbs.map((crumb) => crumb.id)).toStrictEqual([
          'brazil',
          'sao-paulo-state',
          'sao-paulo',
          'sao-paulo-centro',
          placeId,
        ]);
        const search = await get(`properties?placeId=${placeId}`, parseSearchResponse);
        expect(search.totalItems).toBe(1);
        const property = await get(`properties/${search!.items[0]!.id}`, parsePropertyResponse);
        expect(property.property.listings.length).toBe(3);
        expect(property!.property.summary.askingPrice!.minorUnits).toBe(78000000);
        expect(property.property.sale.status).toBe('not-recorded');
        expect(property.property.priceChanges.length).toBe(2);
        expect(property.property.preparedEvidence.productionMatchScore).toBe(null);
        expect(property.property.preparedEvidence.kind).toBe('prepared-fixture');
        if (property.property.preparedEvidence.kind !== 'prepared-fixture')
          throw new Error('Expected prepared evidence.');
        expect(property.property.preparedEvidence.illustrativeProbability).toBe(0.95);
        expect(property.property.preparedEvidence.probabilityBasis).toBe('prepared-not-calibrated');
        expect(
          property.property.preparedEvidence.reasons.some(
            (reason: { type: string }) => reason.type === 'published-neighborhood-disagreement',
          ),
        ).toBeTruthy();
        expect(
          property!.property.sourceAgreement.find(
            (entry: { field: string }) => entry.field === 'propertyType',
          )!.agrees,
        ).toBeTruthy();
        expect(
          property.property.featureAgreement.find(
            (entry: { feature: string }) => entry.feature === 'balcony',
          ),
        ).toStrictEqual({
          feature: 'balcony',
          reportingCount: 3,
          reportingPercent: 100,
          listingIds: property.property.listings.map((listing) => listing.id),
          sourceIds: property.property.listings.map((listing) => listing.source.sourceId),
        });
        expect(property.property.priceChanges.map((change) => change.changePercent)).toStrictEqual([
          -200 / 82,
          -2.5,
        ]);
        let picker = roots;
        for (const [kind, id] of [
          ['country', 'brazil'],
          ['state', 'sao-paulo-state'],
          ['city', 'sao-paulo'],
          ['zone', 'sao-paulo-centro'],
          ['neighborhood', 'sao-paulo-bela-vista'],
          ['street-block', 'sao-paulo-bela-vista-fictional-block'],
        ] as const) {
          const current = picker.items.find((place: { id: string | undefined }) => place.id === id);
          expect(current!.kind).toBe(kind);
          expect((await get(`places/${id}`, parsePlaceResponse)).place).toStrictEqual(current);
          expect((await get(`properties?placeId=${id}`, parseSearchResponse)).totalItems).toBe(
            current!.propertyCount,
          );
          if (kind === 'street-block') {
            expect(current!.breadcrumbs.length).toBe(6);
            expect(current!.block).toStrictEqual({
              streetName: 'Rua Cen\u00E1rio Um',
              fromNumber: 100,
              toNumber: 199,
              origin: 'prepared-fixture',
            });
            expect(current!.coordinates).toStrictEqual({ latitude: -23.55, longitude: -46.63 });
            expect(property.property.summary.place.id).toBe(id);
            expect(
              property.property.listings.every(
                (listing: { place: { id: string | undefined } }) => listing.place.id === id,
              ),
            ).toBeTruthy();
          } else {
            expect(current!.coordinates).toBe(null);
            expect(current!.block).toBe(null);
          }
          picker = await get(`places/${id}/children`, parsePlacesResponse);
        }
        expect(picker.items).toStrictEqual([]);
        for (const grouped of property.property.listings) {
          const listing = await get(`listings/${grouped.id}`, parseListingResponse);
          expect(listing.listing).toStrictEqual(grouped);
        }
        const reductions = await get(
          `places/${placeId}/largest-reductions`,
          parseReductionsResponse,
        );
        expect(reductions.items).toStrictEqual([]);
        expect(reductions.totalItems).toBe(0);
        expect(reductions.nextCursor).toBe(null);
        const filterCases = [
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
          ['priceReduced=false&returnedToMarket=true&multipleListings=true', 1],
          ['priceReduced=true&returnedToMarket=true', 0],
          ['maxAskingPrice=1', 0],
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
        ] as const;
        for (const [query, count] of filterCases) {
          const page = await get(`properties?${query}`, parseSearchResponse);
          expect(page.totalItems, query).toBe(count);
          if (query!.startsWith('pageSize=1.')) expect(page.items.length).toBe(1);
          if (!count) expect(page.medianPricePerSquareMeter).toBe(null);
        }
        for (const sort of PROPERTY_SORTS) {
          const full = await get(`properties?sort=${sort}`, parseSearchResponse);
          const ids = [];
          let cursor;
          do {
            const page: SearchResponse = await get(
              `properties?sort=${sort}&pageSize=1${cursor ? `&cursor=${cursor}` : ''}`,
              parseSearchResponse,
            );
            expect(page.totalItems).toBe(5);
            expect(page.medianPricePerSquareMeter).toBe(full.medianPricePerSquareMeter);
            ids.push(page.items[0]!.id);
            cursor = page.nextCursor;
          } while (cursor);
          expect(ids).toStrictEqual(full.items.map((item) => item.id));
          expect(new Set(ids).size).toBe(5);
        }
        const vm = await get(`properties/${syntheticReadId(4)}`, parsePropertyResponse);
        expect(
          vm!.property.listings.find(
            (listing: { source: { sourceListingId: string } }) =>
              listing.source.sourceListingId === 'COB-VM-001',
          )!.lifeline.length,
        ).toBe(2);
        for (const path of [
          `listings/${SUPPLEMENTARY_LISTING_IDS.deniedText}`,
          `properties/${SUPPLEMENTARY_PROPERTY_IDS.deniedText}`,
        ]) {
          const denied = await get(
            path,
            path.startsWith('listings') ? parseListingResponse : parsePropertyResponse,
          );
          expect(
            !/quiet bedrooms|renovated living room|"text"|"current"|"versions"|excerpt/.test(
              JSON.stringify(denied),
            ),
          ).toBeTruthy();
        }
        const expired = await get(
          `listings/${SUPPLEMENTARY_LISTING_IDS.expiredSnapshot}`,
          parseListingResponse,
        );
        expect(expired.listing.snapshot.availability).toBe('expired');
        expect(expired.listing.provenance.contentHash).toMatch(/^sha256:/);
        const inactive = await get(
          `properties/${SUPPLEMENTARY_PROPERTY_IDS.noActiveListings}`,
          parsePropertyResponse,
        );
        expect(inactive.property.summary.askingPrice).toBe(null);
        expect(inactive.property.summary.bedrooms).toBe(null);
        expect(inactive.property.sale.status).toBe('not-recorded');
        expect(
          (await get('places/sao-paulo-oeste/largest-reductions', parseReductionsResponse))
            .totalItems,
        ).toBe(0);
        expect(
          (await get(`places/${placeId}-fictional-block/children`, parsePlacesResponse)).items,
        ).toStrictEqual([]);
        const allReductions = await get(
          'places/sao-paulo/largest-reductions',
          parseReductionsResponse,
        );
        expect(allReductions.items).toStrictEqual([]);
        expect(allReductions.totalItems).toBe(0);
        for (const pageSize of [1, 20]) {
          const page = await get(
            `places/sao-paulo/largest-reductions?pageSize=${pageSize}`,
            parseReductionsResponse,
          );
          expect(page.totalItems).toBe(0);
          expect(page.items).toStrictEqual([]);
          expect(page.nextCursor).toBe(null);
        }
        const invalidQueries = [
          'unknown=secret',
          'propertyType=boat',
          'sort=bad',
          'minArea=NaN',
          'minArea=Infinity',
          'minArea=-1',
          'minArea=2&maxArea=1',
          'minAskingPrice=2&maxAskingPrice=1',
          'minBedrooms=1.5',
          'minBathrooms=-1',
          'minParkingSpaces=bad',
          'timeOnMarket=bad',
          'priceReduced=1',
          'returnedToMarket=TRUE',
          'multipleListings=yes',
          'pageSize=0',
          'pageSize=21',
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
          'cursor=bad',
          'cursor=',
          'minArea[x]=1',
          '__proto__[x]=1',
          '__proto__=secret',
          'constructor=secret',
          'toString=secret',
          'placeId[]=sao-paulo',
        ];
        for (const query of invalidQueries) await error(`properties?${query}`, 400);
        const page = await get('properties?pageSize=1', parseSearchResponse);
        await error(`properties?pageSize=1&sort=most-recent&cursor=${page.nextCursor}`, 400);
        await error(
          `properties?pageSize=1&placeId=sao-paulo-centro&cursor=${page.nextCursor}`,
          400,
        );
        await error(
          `places/sao-paulo/largest-reductions?pageSize=1&cursor=${page.nextCursor}`,
          400,
        );
        for (const path of [
          'properties/bad',
          'listings/bad',
          'places/BAD',
          'properties/%ZZ',
          'listings/%ZZ',
          'places/%ZZ',
          'places?pageSize=1',
          'places/sao-paulo/children?extra=true',
          'places/sao-paulo/largest-reductions?sort=most-recent',
        ])
          await error(path, 400);
        for (const path of [
          `properties/${syntheticReadId(999)}`,
          `listings/${syntheticReadId(999)}`,
          'places/unknown',
          'places/unknown/children',
          'places/unknown/largest-reductions',
        ])
          await error(path, 404);
        for (const path of [
          'properties',
          'properties/unknown',
          'listings',
          'listings/unknown',
          'places',
          'places/unknown',
        ])
          await error(path, 404, false);
        expect(
          await unchangedCounts(connection),
          'Read journey changed collection or outbox state',
        ).toStrictEqual(before);
        console.log(
          `Properties contracts integration passed (${requests} real HTTP requests; collection and outbox unchanged).`,
        );
      } catch (error) {
        cleanupPrimary1 = error;
        cleanupPrimaryThrown1 = true;
        throw error;
      } finally {
        await preserveCleanup(
          async () => {
            if (cleanupPrimaryThrown1) throw cleanupPrimary1;
          },
          async () => {
            await cleanupAll(
              async () => {
                await connection?.close();
              },
              async () => {
                await compose('down', '--volumes', '--remove-orphans');
              },
            );
          },
        );
      }
    }
  });
});
