import { expect } from 'vitest';
import { CollectSourceRun } from '../../packages/application/dist/index.js';
import { parseCollectedListing } from '../../packages/domain/dist/index.js';
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
import { parseReductionsResponse } from '../../packages/contracts/dist/index.js';
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
  const observedAt = '2027-01-01T12:00:00.000Z';
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
    },
    () =>
      cleanupAll(
        async () => store.destroy(),
        () => connection.close(),
      ),
  );
}
