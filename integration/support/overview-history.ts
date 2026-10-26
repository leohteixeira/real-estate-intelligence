import { expect } from 'vitest';
import { CollectSourceRun } from '../../packages/application/dist/index.js';
import {
  PropertiesEventV2,
  isSerializableEventPayload,
  parseCollectedListing,
  type ListingFact,
} from '../../packages/domain/dist/index.js';
import {
  DatabaseConnection,
  PostgresCollectionRunRepository,
  PostgresOutbox,
  PostgresSnapshotLifecycle,
  PostgresSourceRegisterRepository,
  PostgresTransactionRunner,
  PostgresUuidV7Generator,
  S3RawSnapshotStore,
  SYNTHETIC_LISTING_BYTES,
  SYNTHETIC_LISTING_ID,
  SyntheticListingSource,
} from '../../packages/infrastructure/dist/index.js';
import {
  parseReductionsResponse,
  parsePlaceMarketResponse,
  parsePlaceMarketNeighboursResponse,
  parsePlaceMarketSeriesResponse,
} from '../../packages/contracts/dist/index.js';
import { cleanupAll, preserveCleanup } from './cleanup.ts';
import { requestHttp } from './http.ts';

/** Genuine acquisition: production collection, raw S3 snapshot, SQL outbox and worker consumers. */
export async function acquireOverviewReduction(fixture: {
  base: string;
  postgres: number;
  minio: number;
  user: string;
  password: string;
  bucket: string;
}) {
  const database = new URL(`postgres://127.0.0.1:${fixture.postgres}/${fixture.user}`);
  database.username = fixture.user;
  database.password = fixture.password;
  const connection = new DatabaseConnection(database.toString());
  const before = await requestHttp(`${fixture.base}/api/v1/places/sao-paulo-bela-vista/market`);
  expect(before.status).toBe(200);
  const previousObservation = parsePlaceMarketResponse(
    await before.json(),
  ).figures.medianAskingPricePerSquareMeter.sources.find(
    (source) => source.id === 'synthetic-data',
  );
  expect(previousObservation).toBeDefined();
  const observedAt = new Date().toISOString();
  expect(Date.parse(observedAt)).toBeGreaterThan(Date.parse(previousObservation!.collectedAt));
  const clock = { now: () => observedAt };
  const store = new S3RawSnapshotStore({
    endpoint: `http://127.0.0.1:${fixture.minio}`,
    region: 'us-east-1',
    bucket: fixture.bucket,
    accessKeyId: fixture.user,
    secretAccessKey: fixture.password,
    lifecycle: new PostgresSnapshotLifecycle(connection),
    clock,
  });
  await preserveCleanup(
    async () => {
      const original = parseCollectedListing(
        JSON.parse(new TextDecoder().decode(SYNTHETIC_LISTING_BYTES)),
      );
      const parser = new SyntheticListingSource();
      const source = {
        fetchPage: async () => ({
          documents: [
            {
              sourceId: 'synthetic-data',
              sourceListingId: SYNTHETIC_LISTING_ID,
              sourceUrl: `https://synthetic.invalid/listings/${SYNTHETIC_LISTING_ID}`,
              observedAt,
              mediaType: 'application/json' as const,
              bytes: new TextEncoder().encode(
                JSON.stringify({ ...original, askingPriceMinorUnits: 70_000_000 }),
              ),
            },
          ],
          nextCursor: null,
          exhausted: true,
        }),
        parse: parser.parse.bind(parser),
      };
      const collect = new CollectSourceRun(
        source,
        store,
        new PostgresSourceRegisterRepository(connection),
        new PostgresCollectionRunRepository(connection),
        new PostgresTransactionRunner(connection),
        new PostgresUuidV7Generator(connection),
        clock,
        new PostgresOutbox(connection),
      );
      await collect.execute(
        'synthetic-data',
        'owned-overview-price-reduction',
        null,
        AbortSignal.timeout(60_000),
      );
      await expect
        .poll(
          async () => {
            const response = await requestHttp(
              `${fixture.base}/api/v1/places/sao-paulo-bela-vista/largest-reductions?pageSize=3`,
            );
            expect(response.status).toBe(200);
            return parseReductionsResponse(await response.json()).items;
          },
          { timeout: 60_000, interval: 200 },
        )
        .toEqual([
          expect.objectContaining({
            previousMinorUnits: 78_500_000,
            currentMinorUnits: 70_000_000,
            effectiveAt: observedAt,
            provenance: expect.objectContaining({ sourceId: 'synthetic-data', observedAt }),
          }),
        ]);
      const after = await requestHttp(`${fixture.base}/api/v1/places/sao-paulo-bela-vista/market`);
      expect(after.status).toBe(200);
      const overview = parsePlaceMarketResponse(await after.json());
      expect(overview.basis).toBe('event-fed-place-figures');
      expect(overview.figures.medianAskingPricePerSquareMeter.state).toBe('available');
      expect(Date.parse(observedAt)).toBeLessThanOrEqual(Date.parse(overview.evaluatedAt));
    },
    () =>
      cleanupAll(
        async () => store.destroy(),
        () => connection.close(),
      ),
  );
}

/** Owned synthetic neighbour evidence follows the production outbox and worker projection. */
export async function retainOverviewNeighbour(fixture: {
  base: string;
  postgres: number;
  user: string;
  password: string;
}) {
  const database = new URL(`postgres://127.0.0.1:${fixture.postgres}/${fixture.user}`);
  database.username = fixture.user;
  database.password = fixture.password;
  const connection = new DatabaseConnection(database.toString());
  await preserveCleanup(
    async () => {
      const id = (n: number) => `0199c8f2-2394-7000-8000-${String(n).padStart(12, '0')}`;
      const now = Date.now() - 60_000;
      const listing = (price: number, days: number): ListingFact => {
        const at = new Date(now - days * 86_400_000).toISOString();
        return {
          listingId: id(9901),
          propertyId: id(9902),
          sourceId: 'synthetic-neighbour',
          sourceListingId: 'overview-neighbour',
          placeId: 'sao-paulo-vila-mariana-fictional-block',
          propertyType: 'apartment',
          status: 'active',
          askingPriceMinorUnits: price,
          currency: 'BRL',
          areaSquareMeters: 10,
          effectiveAt: at,
          provenance: {
            sourceId: 'synthetic-neighbour',
            sourceListingId: 'overview-neighbour',
            sourceUrl: 'https://neighbour.invalid/listing',
            observedAt: at,
            runId: id(9903),
            snapshotId: id(9904),
            contentHash: `sha256:${'a'.repeat(64)}`,
          },
        };
      };
      const events = [listing(3_000_000, 200), listing(4_500_000, 5)].map((fact, index) => {
        const event = new PropertiesEventV2(
          index === 0 ? 'properties.listing.created' : 'properties.listing.price-changed',
          {
            eventId: id(9910 + index),
            aggregateId: fact.listingId,
            occurredAt: fact.effectiveAt,
            payload: {
              revision: index + 1,
              assignmentRevision: 0,
              effectiveAt: fact.effectiveAt,
              listing: fact,
              ...(index === 0 ? {} : { previousMinorUnits: 3_000_000 }),
            },
          },
        );
        if (!isSerializableEventPayload(event.payload))
          throw new Error('Invalid owned neighbour event.');
        return { ...event, payload: event.payload };
      });
      await new PostgresTransactionRunner(connection).runInTransaction((tx) =>
        new PostgresOutbox(connection).append(tx, events),
      );
      await expect
        .poll(
          async () => {
            const response = await requestHttp(
              `${fixture.base}/api/v1/places/sao-paulo-bela-vista/market/neighbours`,
            );
            expect(response.status).toBe(200);
            return parsePlaceMarketNeighboursResponse(await response.json()).items[0]!.movement
              .value;
          },
          { timeout: 60_000, interval: 200 },
        )
        .toBe(50);
      const seriesRead = await requestHttp(
        `${fixture.base}/api/v1/places/sao-paulo-vila-mariana/market/monthly-series`,
      );
      expect(seriesRead.status).toBe(200);
      const series = parsePlaceMarketSeriesResponse(await seriesRead.json());
      expect(series.basis).toBe('event-fed-place-figures');
      expect(
        series.points.some(
          (point, index) => index < 11 && point.median.value?.minorUnits === 300000,
        ),
      ).toBe(true);
      expect(series.points.at(-1)!.median.value?.minorUnits).toBe(450000);
    },
    () => connection.close(),
  );
}
