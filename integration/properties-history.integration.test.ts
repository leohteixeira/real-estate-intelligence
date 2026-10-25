import { randomUUID } from 'node:crypto';
import { expect, test, vi } from 'vitest';
import type {
  CollectSourceRunResult,
  CollectionExecutionResult,
  ListingSource,
  RawListingDocument,
  RawSnapshotStore,
  StartCollectionRunInput,
  Transaction,
} from '../packages/application/dist/index.js';
import {
  CollectSourceOnce,
  CollectSourceRun,
  ExternalFailure,
  ReparseSnapshot,
} from '../packages/application/dist/index.js';
import type { ListingDescription, ListingHistory } from '../packages/contracts/dist/index.js';
import {
  parseListingResponse,
  parsePropertyResponse,
  parseReductionsResponse,
  type ListingResponse,
} from '../packages/contracts/dist/index.js';
import type {
  CollectedListing,
  CollectionRunCompleted,
  CollectionSnapshotCorrected,
  CollectionSnapshotParsed,
  ListingChronologyState,
  PropertiesEvent,
} from '../packages/domain/dist/index.js';
import {
  parseCollectedListing,
  parseCollectionEvent,
  parseUuidV7,
} from '../packages/domain/dist/index.js';
import {
  DatabaseConnection,
  PostgresCollectionFacade,
  PostgresCollectionRunRepository,
  PostgresOutbox,
  PostgresSnapshotLifecycle,
  PostgresSnapshotReparseRepository,
  PostgresSourceRegisterRepository,
  PostgresTransactionRunner,
  PostgresUuidV7Generator,
  RabbitMqEventBroker,
  S3RawSnapshotStore,
  SYNTHETIC_LISTING_BYTES,
  SYNTHETIC_SAO_PAULO_DATASET,
  SyntheticListingSource,
  supplementaryPlaces,
  syntheticPlaces,
} from '../packages/infrastructure/dist/index.js';
import { allocatePorts, cleanupAll, preserveCleanup, withCampaign } from './support/fixture.ts';
import { requestHttp } from './support/http.ts';
test('properties-history preserves its complete real-service campaign', async () => {
  await withCampaign(async ({ command }) => {
    const run = command;
    const project = `rei-properties-history-${process.pid}-${randomUUID().slice(0, 8)}`;
    const fixture = {
      user: 'rei_ingest_fixture',
      password: 'rei-ingest-owned-local-fixture',
      database: 'rei_ingest_fixture',
      bucket: 'rei-ingest-fixture',
      vhost: 'rei-ingest-fixture',
    };
    async function reservePort() {
      const [selected] = await allocatePorts(1);
      expect(Number.isInteger(selected)).toBeTruthy();
      return selected;
    }
    const [postgres, rabbit, management, minio, minioConsole, api] = await Promise.all(
      Array.from({ length: 6 }, reservePort),
    );
    expect(new Set([postgres, rabbit, management, minio, minioConsole, api]).size).toBe(6);
    const environment = {
      ...process.env,
      COMPOSE_FILE: 'compose.yaml',
      COMPOSE_PROJECT_NAME: project,
      COMPOSE_PROFILES: 'tools',
      COMPOSE_DISABLE_ENV_FILE: '1',
      COMPOSE_ENV_FILES: '',
      NODE_ENV: 'test',
      POSTGRES_USER: fixture.user,
      POSTGRES_PASSWORD: fixture.password,
      POSTGRES_DB: fixture.database,
      POSTGRES_PORT: String(postgres),
      RABBITMQ_USER: fixture.user,
      RABBITMQ_PASSWORD: fixture.password,
      RABBITMQ_VHOST: fixture.vhost,
      RABBITMQ_PORT: String(rabbit),
      RABBITMQ_MANAGEMENT_PORT: String(management),
      MINIO_ROOT_USER: fixture.user,
      MINIO_ROOT_PASSWORD: fixture.password,
      MINIO_API_PORT: String(minio),
      MINIO_CONSOLE_PORT: String(minioConsole),
      OBJECT_STORE_REGION: 'us-east-1',
      OBJECT_STORE_BUCKET: fixture.bucket,
      API_PORT: String(api),
      SNAPSHOT_ENCRYPTION_KEY_ID: '',
      SNAPSHOT_ENCRYPTION_KEY_BASE64: '',
      WORKER_INTERVAL_MS: '30000',
      OUTBOX_RELAY_INTERVAL_MS: '250',
      RABBITMQ_RECONNECT_INTERVAL_MS: '1000',
      WORKER_OPERATION_TIMEOUT_MS: '5000',
      COLLECTION_DEADLINE_MS: '30000',
      SHUTDOWN_TIMEOUT_MS: '15000',
      EVENT_DELIVERY_LIMIT: '3',
      EVENT_REDELIVERY_DELAY_MS: '250',
      OUTBOX_CLAIM_LEASE_MS: '130000',
      OTEL_EXPORTER_OTLP_ENDPOINT: '',
    };
    const compose = (...args: string[]) =>
      run(
        'docker',
        [
          'compose',
          '--file',
          'compose.yaml',
          '--project-name',
          project,
          '--profile',
          'tools',
          ...args,
        ],
        {
          cwd: new URL('..', import.meta.url),
          env: environment,
          timeout: 240000,
          maxBuffer: 10 * 1024 * 1024,
        },
      );
    const databaseUrl = new URL(`postgres://127.0.0.1:${postgres}/${fixture.database}`);
    databaseUrl.username = fixture.user;
    databaseUrl.password = fixture.password;
    const rabbitUrl = new URL(`amqp://127.0.0.1:${rabbit}/${fixture.vhost}`);
    rabbitUrl.username = fixture.user;
    rabbitUrl.password = fixture.password;
    const signal = () => AbortSignal.timeout(15000);
    async function waitFor<T>(description: string, probe: () => Promise<T> | T, duration = 60000) {
      let result: T | undefined;
      await vi.waitFor(
        async () => {
          result = await probe();
          expect(result, description).toBeTruthy();
        },
        { timeout: duration, interval: 100 },
      );
    }
    async function get<
      T extends (value: unknown) => {
        metadata: { dataMode: string; fixtureVersion: string; asOf: string };
      },
    >(path: string, parser: T) {
      const response = await requestHttp(`http://127.0.0.1:${api}/api/v1/${path}`, {
        signal: signal(),
      });
      expect(response.status, path).toBe(200);
      return parser(await response.json()) as ReturnType<T>;
    }
    let connection: DatabaseConnection, store: S3RawSnapshotStore, publisher: RabbitMqEventBroker;
    {
      let cleanupPrimary1: unknown;
      let cleanupPrimaryThrown1 = false;
      try {
        try {
          console.log(`Starting isolated Properties history campaign ${project}.`);
          await compose(
            'up',
            '--detach',
            '--build',
            '--wait',
            'postgres',
            'rabbitmq',
            'minio',
            'migrations',
            'worker',
            'api',
          );
          connection = new DatabaseConnection(databaseUrl.toString());
          publisher = new RabbitMqEventBroker({
            url: rabbitUrl.toString(),
            operationTimeoutMs: 5000,
          });
          let instant = '2025-10-01T12:00:00.000Z';
          const clock = { now: () => instant };
          store = new S3RawSnapshotStore({
            endpoint: `http://127.0.0.1:${minio}`,
            region: 'us-east-1',
            bucket: fixture.bucket,
            accessKeyId: fixture.user,
            secretAccessKey: fixture.password,
            lifecycle: new PostgresSnapshotLifecycle(connection),
            clock,
          });
          const parser = new SyntheticListingSource();
          const collect = async (
            sourceId: string,
            key: string,
            documents: {
              sourceId: string;
              sourceListingId: string;
              sourceUrl: string;
              observedAt: string;
              mediaType: 'application/json';
              bytes: NodeJS.NonSharedUint8Array;
            }[],
            observedAt: string,
            completionOffset = 1000,
          ) => {
            instant = observedAt;
            const source = {
              fetchPage: async () => {
                instant = new Date(Date.parse(observedAt) + completionOffset).toISOString();
                return { documents, nextCursor: null, exhausted: true };
              },
              parse: (document: RawListingDocument, cancellation: AbortSignal) =>
                parser.parse(document, cancellation),
            };
            const service = new CollectSourceRun(
              source,
              store,
              new PostgresSourceRegisterRepository(connection),
              new PostgresCollectionRunRepository(connection),
              new PostgresTransactionRunner(connection),
              new PostgresUuidV7Generator(connection),
              clock,
              new PostgresOutbox(connection),
            );
            return service.execute(sourceId, key, null, signal());
          };
          // Genuine collections populate evidence/outbox while subscriptions are offline. Canonical
          // source chronology must not depend on cross-aggregate broker prefetch or reception order.
          await compose('stop', 'worker');
          for (const cycle of SYNTHETIC_SAO_PAULO_DATASET.runs) {
            for (const [index, source] of SYNTHETIC_SAO_PAULO_DATASET.sources.entries()) {
              const observations = cycle.observations.filter(
                (item) => item.sourceId === source.sourceId,
              );
              const documents = observations.map((item) => ({
                ...item,
                mediaType: 'application/json' as const,
                bytes: new TextEncoder().encode(JSON.stringify(item.listing)),
              }));
              await collect(
                source.sourceId,
                `history-catalog-${cycle.runKey}-${source.sourceId}`,
                documents,
                cycle.observedAt,
                (index + 1) * 1000,
              );
            }
          }
          expect(
            (
              await connection.query<{ count: number }>(
                'SELECT count(*)::integer AS count FROM collection.completed_event_evidence',
              )
            )[0]!.count,
          ).toBe(39);
          await compose('up', '--detach', '--wait', 'worker');
          await waitFor(
            '115 durable acquisitions',
            async () =>
              (
                await connection.query<{ count: number }>(
                  'SELECT count(*)::integer AS count FROM properties.listing_acquisition',
                )
              )[0]!.count === 115,
          );
          await waitFor(
            'all canonical source runs',
            async () =>
              (
                await connection.query<{ count: number }>(
                  'SELECT count(*)::integer AS count FROM properties.source_work WHERE listing_cursor IS NULL AND last_run_id IS NOT NULL',
                )
              )[0]!.count === 3,
          );
          const eventCounts = await connection.query<{ event_type: string; count: number }>(
            "SELECT event_type,count(*)::integer AS count FROM platform.outbox WHERE event_type LIKE 'properties.listing.%' GROUP BY event_type ORDER BY event_type",
          );
          expect(
            Object.fromEntries(eventCounts.map((row) => [row.event_type, row.count])),
          ).toStrictEqual({
            'properties.listing.created': 9,
            'properties.listing.description-changed': 3,
            'properties.listing.price-changed': 4,
            'properties.listing.reappeared': 1,
            'properties.listing.removed': 1,
          });
          const identities = await connection.query<{
            listing_id: string;
            property_id: string;
            source_id: string;
            source_listing_id: string;
          }>(
            'SELECT listing_id::text,property_id::text,source_id,source_listing_id FROM properties.listing ORDER BY source_id,source_listing_id',
          );
          let acquisitions = 0;
          for (const row of identities) {
            const listing = (await get(`listings/${row.listing_id}`, parseListingResponse)).listing;
            const property = (await get(`properties/${row.property_id}`, parsePropertyResponse))
              .property;
            acquisitions += listing.collectionCount;
            expect(property.listings.find((member) => member.id === listing.id)).toStrictEqual(
              listing,
            );
            const observations = SYNTHETIC_SAO_PAULO_DATASET.runs
              .flatMap((run) => run.observations)
              .filter(
                (item) =>
                  item.sourceId === row.source_id && item.sourceListingId === row.source_listing_id,
              );
            expect(listing.collectionCount).toBe(observations.length);
            expect(listing.firstCollectedAt).toBe(observations![0]!.observedAt);
            expect(listing.lastCollectedAt).toBe(observations!.at(-1)!.observedAt);
            expect(listing.askingPriceMinorUnits).toBe(
              observations!.at(-1)!.listing.askingPriceMinorUnits,
            );
            const durable = await connection.query<{
              revision: number;
              event: PropertiesEvent<
                | 'properties.listing.created'
                | 'properties.listing.price-changed'
                | 'properties.listing.description-changed'
                | 'properties.listing.removed'
                | 'properties.listing.reappeared'
              >;
            }>(
              'SELECT revision,event FROM properties.listing_event WHERE listing_id=$1 ORDER BY revision',
              [row.listing_id],
            );
            expect(durable.map((item) => item.revision)).toStrictEqual(
              Array.from({ length: durable.length }, (_, i) => i + 1),
            );
            expect(
              durable.map((item) => item.event.type.replace('properties.listing.', '')),
            ).toStrictEqual(listing.history.map((item) => item.type));
            for (const event of durable)
              expect(event.event.payload.listing.provenance.observedAt).toBe(
                listing!.history[event.revision - 1]!.provenance.observedAt,
              );
            const removal = durable.find(
              (item) => item.event.type === 'properties.listing.removed',
            );
            if (removal) {
              const run = (
                await connection.query<{ event: CollectionRunCompleted }>(
                  "SELECT event FROM collection.completed_event_evidence WHERE event->>'occurredAt'=$1",
                  [removal.event.payload.effectiveAt],
                )
              )[0];
              expect(run).toBeTruthy();
              expect(listing!.lifeline[0]!.to).toBe(run!.event.occurredAt);
              expect(listing!.lifeline[1]!.from).toBe(
                listing!.history.find((item: { type: string }) => item.type === 'reappeared')!
                  .effectiveAt,
              );
            }
          }
          expect(acquisitions).toBe(115);
          // Independent HTTP-detail oracle: immutable effects, not corrected current asking prices.
          const registeredPlaces = [...syntheticPlaces(), ...supplementaryPlaces()];
          const reductions = (place = 'sao-paulo', query = '') =>
            get(`places/${place}/largest-reductions${query}`, parseReductionsResponse);
          const catalogIdentities = new Set(identities.map((item) => item.listing_id));
          const catalogExpected = await Promise.all(
            [
              {
                members: ['COB-TT-001'],
                source: 'COB-TT-001',
                previous: 95000000,
                current: 92000000,
                at: '2026-09-01T12:00:00.000Z',
                place: 'sao-paulo-tatuape-fictional-block',
              },
              {
                members: ['AUR-BV-001', 'BRI-BV-001', 'COB-BV-001'],
                source: 'AUR-BV-001',
                previous: 80000000,
                current: 78000000,
                at: '2026-07-01T12:00:00.000Z',
                place: 'sao-paulo-bela-vista-fictional-block',
              },
              {
                members: ['AUR-SN-001', 'BRI-SN-001'],
                source: 'BRI-SN-001',
                previous: 67000000,
                current: 65500000,
                at: '2026-02-01T12:00:00.000Z',
                place: 'sao-paulo-santana-fictional-block',
              },
              {
                members: ['BRI-VM-001', 'COB-VM-001'],
                source: 'COB-VM-001',
                previous: 126000000,
                current: 124000000,
                at: '2026-06-01T12:00:00.000Z',
                place: 'sao-paulo-vila-mariana-fictional-block',
              },
            ].map(async (expected) => {
              const identity = identities.find(
                (item) => item.source_listing_id === expected.source,
              )!;
              const effect = (
                await get(`listings/${identity.listing_id}`, parseListingResponse)
              ).listing.history.find(
                (item) =>
                  item.effectiveAt === expected.at &&
                  (item.type === 'price-changed' || item.type === 'reappeared'),
              )!;
              expect(effect.type).toBe(
                expected.source === 'COB-VM-001' ? 'reappeared' : 'price-changed',
              );
              return {
                propertyId: identities
                  .filter((item) => expected.members.includes(item.source_listing_id))
                  .map((item) => item.property_id)
                  .sort()[0]!,
                listingId: identity.listing_id,
                place: (() => {
                  const place = registeredPlaces.find((item) => item.id === expected.place)!;
                  return { id: place.id, kind: place.kind, name: place.name };
                })(),
                effectiveAt: expected.at,
                previousMinorUnits: expected.previous,
                currentMinorUnits: expected.current,
                reductionPercent:
                  ((expected.previous - expected.current) / expected.previous) * 100,
                provenance: effect.provenance,
              };
            }),
          );
          const assertRankings = async () => {
            const rows = await connection.query<{ listing_id: string }>(
              'SELECT listing_id::text FROM properties.listing ORDER BY listing_id',
            );
            const details = [];

            for (const row of rows)
              details.push((await get(`listings/${row.listing_id}`, parseListingResponse)).listing);
            for (const place of registeredPlaces) {
              const scope = registeredPlaces
                .filter((item) => item.breadcrumbs.some((crumb) => crumb.id === place.id))
                .map((item) => item.id);
              const scoped = details.filter((item) =>
                scope.includes(
                  item.provenance.sourceListingId === 'COB-BV-001'
                    ? 'sao-paulo-bela-vista-fictional-block'
                    : item.place.id,
                ),
              );
              const expected = scoped
                .filter((listing) => !catalogIdentities.has(listing.id))
                .flatMap((listing) => {
                  let effect;
                  for (const item of listing.history)
                    if (
                      item.type === 'price-changed' &&
                      item.currentMinorUnits < item.previousMinorUnits &&
                      (!effect || item.effectiveAt >= effect.effectiveAt)
                    )
                      effect = item;
                  return effect
                    ? [
                        {
                          propertyId: listing.propertyId,
                          listingId: listing.id,
                          place: listing.place,
                          effectiveAt: effect.effectiveAt,
                          previousMinorUnits: effect.previousMinorUnits,
                          currentMinorUnits: effect.currentMinorUnits,
                          reductionPercent:
                            ((effect.previousMinorUnits - effect.currentMinorUnits) /
                              effect.previousMinorUnits) *
                            100,
                          provenance: effect.provenance,
                        },
                      ]
                    : [];
                })
                .concat(catalogExpected.filter((item) => scope.includes(item.place.id)))
                .sort((a, b) => {
                  const difference =
                    BigInt(b.previousMinorUnits - b.currentMinorUnits) *
                      BigInt(a.previousMinorUnits) -
                    BigInt(a.previousMinorUnits - a.currentMinorUnits) *
                      BigInt(b.previousMinorUnits);
                  return difference > 0n
                    ? 1
                    : difference < 0n
                      ? -1
                      : a.propertyId.localeCompare(b.propertyId);
                });
              const full = await reductions(place.id);
              expect(
                full.totalItems,
                `${place.id}: ${JSON.stringify({ expected, actual: full.items })}`,
              ).toBe(expected.length);
              expect(full.items, place.id).toStrictEqual(expected.slice(0, 20));
              expect(full.metadata.fixtureVersion).toBe('persisted-synthetic-reductions-v1');
              expect(full.metadata.dataMode).toBe('synthetic-stub');
              if (scoped.length)
                expect(full.metadata.asOf).toBe(
                  scoped
                    .flatMap((item) => [
                      item.lastCollectedAt,
                      ...item.history.map((effect) => effect.effectiveAt),
                    ])
                    .sort()
                    .at(-1),
                );
              for (const size of [1, 20]) {
                const paged = [];
                let cursor;
                do {
                  const page = await reductions(
                    place.id,
                    `?pageSize=${size}${cursor ? `&cursor=${cursor}` : ''}`,
                  );
                  expect(page.totalItems).toBe(expected.length);
                  paged.push(...page.items);
                  cursor = page.nextCursor;
                } while (cursor);
                expect(paged, `${place.id}/${size}`).toStrictEqual(expected);
              }
            }
            return reductions();
          };
          const catalogRanking = await assertRankings();
          expect(
            catalogRanking.totalItems,
            'Four current groups retain authentic minimum drops, including the cheaper member returning.',
          ).toBe(4);
          expect(
            catalogRanking.items.map((item) => [item.previousMinorUnits, item.currentMinorUnits]),
          ).toStrictEqual([
            [95000000, 92000000],
            [80000000, 78000000],
            [67000000, 65500000],
            [126000000, 124000000],
          ]);
          const firstPage = await reductions('sao-paulo', '?pageSize=1');
          expect(firstPage.nextCursor).toBeTruthy();
          for (const path of [
            `places/sao-paulo/largest-reductions?pageSize=20&cursor=${firstPage.nextCursor}`,
            `places/brazil/largest-reductions?pageSize=1&cursor=${firstPage.nextCursor}`,
            `properties?pageSize=1&cursor=${firstPage.nextCursor}`,
            'places/sao-paulo/largest-reductions?cursor=invalid',
            'places/sao-paulo/largest-reductions?pageSize=1&pageSize=1',
            'places/sao-paulo/largest-reductions?extra=value',
          ]) {
            const response = await requestHttp(`http://127.0.0.1:${api}/api/v1/${path}`, {
              signal: signal(),
            });
            expect(response.status, path).toBe(400);
            const error = (await response.json()) as { error: { requestId: string } };
            expect(error.error.requestId).toBeTruthy();
            expect(!JSON.stringify(error).includes(firstPage.nextCursor!)).toBeTruthy();
          }
          expect(
            (
              await requestHttp(
                `http://127.0.0.1:${api}/api/v1/places/unknown/largest-reductions`,
                {
                  signal: signal(),
                },
              )
            ).status,
          ).toBe(404);
          const document = (day: number, listing: CollectedListing) => ({
            sourceId: 'synthetic-data',
            sourceListingId: 'OWNED-FIVE-TYPES',
            sourceUrl: 'https://synthetic.invalid/listings/owned-five-types',
            observedAt: `2027-01-0${day}T12:00:00.000Z`,
            mediaType: 'application/json' as const,
            bytes: new TextEncoder().encode(JSON.stringify(listing)),
          });
          const first = {
            ...parseCollectedListing(JSON.parse(new TextDecoder().decode(SYNTHETIC_LISTING_BYTES))),
            imageFingerprints: ['fixture-fingerprint:owned-five-types'],
          };
          const price = { ...first, askingPriceMinorUnits: first.askingPriceMinorUnits - 100000 };
          const description = {
            ...price,
            maskedDescription: 'Owned history journey changed synthetic description.',
          };
          for (const [day, listing] of [
            [1, first],
            [2, price],
            [3, description],
            [4, null],
            [5, description],
          ] as const) {
            const observedAt = `2027-01-0${day}T12:00:00.000Z`;
            await collect(
              'synthetic-data',
              `owned-five-types-${day}`,
              listing ? [document(day, listing)] : [],
              observedAt,
            );
          }
          await waitFor(
            'five focused market types',
            async () =>
              (
                await connection.query<{ count: number }>(
                  "SELECT count(*)::integer AS count FROM properties.listing_event event JOIN properties.listing listing USING(listing_id) WHERE listing.source_listing_id='OWNED-FIVE-TYPES'",
                )
              )[0]!.count === 5,
          );
          const focused = (
            await connection.query<{ listing_id: string; property_id: string }>(
              "SELECT listing_id::text,property_id::text FROM properties.listing WHERE source_listing_id='OWNED-FIVE-TYPES'",
            )
          )[0];
          let focusedResponse = await get(`listings/${focused!.listing_id}`, parseListingResponse);
          expect(focusedResponse.listing.history.map((item) => item.type)).toStrictEqual([
            'created',
            'price-changed',
            'description-changed',
            'removed',
            'reappeared',
          ]);
          expect(focusedResponse.listing.collectionCount).toBe(4);
          expect(focusedResponse.listing.lifeline).toStrictEqual([
            { from: '2027-01-01T12:00:00.000Z', to: '2027-01-04T12:00:01.000Z' },
            { from: '2027-01-05T12:00:00.000Z', to: null },
          ]);
          const reparse = async (
            snapshotId: string,
            key: string,
            price: number,
            description: string,
            invalidGeography: boolean | Partial<CollectedListing['location']> = false,
          ) =>
            new ReparseSnapshot(
              {
                parse: async (document, cancellation: AbortSignal) => {
                  const listing = await parser.parse(document, cancellation);
                  return {
                    ...listing,
                    askingPriceMinorUnits: price,
                    maskedDescription: description,
                    ...(invalidGeography
                      ? {
                          location: {
                            ...listing.location,
                            ...(typeof invalidGeography === 'object'
                              ? invalidGeography
                              : { street: 'Unknown correction street' }),
                          },
                        }
                      : {}),
                  };
                },
              },
              store,
              new PostgresSnapshotReparseRepository(connection),
              new PostgresTransactionRunner(connection),
              new PostgresUuidV7Generator(connection),
              clock,
              new PostgresOutbox(connection),
            ).execute(snapshotId, key, key, null, signal());
          const originalFocusedEffects = JSON.stringify(
            await connection.query<{
              event: PropertiesEvent<
                | 'properties.listing.created'
                | 'properties.listing.price-changed'
                | 'properties.listing.description-changed'
                | 'properties.listing.removed'
                | 'properties.listing.reappeared'
              >;
            }>('SELECT event FROM properties.listing_event WHERE listing_id=$1 ORDER BY revision', [
              focused!.listing_id,
            ]),
          );
          const originalFocusedRanking = (await reductions()).items.find(
            (item) => item.propertyId === focused!.property_id,
          );
          expect(originalFocusedRanking!.previousMinorUnits).toBe(first.askingPriceMinorUnits);
          expect(originalFocusedRanking!.currentMinorUnits).toBe(price.askingPriceMinorUnits);
          const focusedSnapshots = await connection.query<{ snapshot_id: string }>(
            "SELECT snapshot_id::text FROM collection.snapshot_observation WHERE source_listing_id='OWNED-FIVE-TYPES' ORDER BY observed_at,snapshot_id",
          );
          // Historical correction changes only dated values, never a later acquisition's current price.
          await reparse(
            focusedSnapshots![0]!.snapshot_id,
            'history-historical-correction',
            100000,
            'Owned corrected historical text.',
          );
          await waitFor(
            'authenticated historical correction',
            async () =>
              (
                await connection.query<{ state: ListingChronologyState }>(
                  'SELECT state FROM properties.listing_current WHERE listing_id=$1',
                  [focused!.listing_id],
                )
              )[0]!.state.acquisitions[0]!.corrected !== null,
          );
          expect(
            (await get(`listings/${focused!.listing_id}`, parseListingResponse)).listing
              .askingPriceMinorUnits,
          ).toBe(description.askingPriceMinorUnits);
          const lower = await reparse(
            focusedSnapshots!.at(-1)!.snapshot_id,
            'history-current-correction-1',
            200000,
            'Owned lower-order corrected text.',
          );
          const higher = await reparse(
            focusedSnapshots!.at(-1)!.snapshot_id,
            'history-current-correction-2',
            300000,
            'Owned higher-order corrected text.',
          );
          await waitFor(
            'highest corrected current price',
            async () =>
              (await get(`listings/${focused!.listing_id}`, parseListingResponse)).listing
                .askingPriceMinorUnits === 300000,
          );
          const correctedWires = await connection.query<{
            event: CollectionSnapshotParsed | CollectionSnapshotCorrected;
          }>(
            'SELECT event FROM collection.parsed_event_evidence WHERE event_id=ANY($1::uuid[]) ORDER BY event_id DESC',
            [[lower.eventId, higher.eventId]],
          );
          for (const row of correctedWires)
            await publisher.publish(parseCollectionEvent(row.event), signal());
          focusedResponse = await get(`listings/${focused!.listing_id}`, parseListingResponse);
          expect(focusedResponse.listing.collectionCount).toBe(4);
          expect(focusedResponse.listing.provenance.snapshotId).toBe(
            focusedSnapshots!.at(-1)!.snapshot_id,
          );
          expect(
            (
              focusedResponse.listing.description as Extract<
                ListingDescription,
                { permission: 'allowed' }
              >
            ).current,
          ).toBe('Owned higher-order corrected text.');
          expect(
            (await reductions()).items.find((item) => item.propertyId === focused!.property_id),
          ).toStrictEqual(originalFocusedRanking);
          expect((await reductions()).metadata.asOf).toBe('2027-01-05T12:00:00.000Z');
          expect(
            JSON.stringify(
              await connection.query<{
                event: PropertiesEvent<
                  | 'properties.listing.created'
                  | 'properties.listing.price-changed'
                  | 'properties.listing.description-changed'
                  | 'properties.listing.removed'
                  | 'properties.listing.reappeared'
                >;
              }>(
                'SELECT event FROM properties.listing_event WHERE listing_id=$1 ORDER BY revision',
                [focused!.listing_id],
              ),
            ),
          ).toBe(originalFocusedEffects);
          // Correction-first receipt plus completion-first recovery, with both original broker facts withheld.
          await compose('stop', 'worker');
          const interruptRun = async (sourceId: string, key: string, startedAt: string) => {
            instant = startedAt;
            const interrupted = new CollectSourceRun(
              {
                fetchPage: async () => {
                  throw new Error('Owned interrupted source page.');
                },
                parse: (document, cancellation: AbortSignal) =>
                  parser.parse(document, cancellation),
              },
              store,
              new PostgresSourceRegisterRepository(connection),
              new PostgresCollectionRunRepository(connection),
              new PostgresTransactionRunner(connection),
              new PostgresUuidV7Generator(connection),
              clock,
              new PostgresOutbox(connection),
            );
            await expect(interrupted.execute(sourceId, key, null, signal())).rejects.toThrow();
          };
          // Durable completion may be found without broker delivery. An authentic earlier running run
          // keeps this acquisition unavailable until the correction-first receipt has been exercised.
          await interruptRun(
            'synthetic-portal-cobalto',
            'owned-correction-first-barrier',
            '2027-01-06T11:00:00.000Z',
          );
          const correctionDocument = {
            ...document(6, first),
            sourceId: 'synthetic-portal-cobalto',
            sourceListingId: 'OWNED-CORRECTION-FIRST',
            sourceUrl: 'https://synthetic.invalid/listings/owned-correction-first',
            bytes: new TextEncoder().encode(
              JSON.stringify({
                ...first,
                imageFingerprints: ['fixture-fingerprint:owned-correction-first'],
              }),
            ),
          };
          const correctionRun = await collect(
            'synthetic-portal-cobalto',
            'owned-correction-first',
            [correctionDocument],
            correctionDocument.observedAt,
          );
          const completion = (
            await connection.query<{ event: CollectionRunCompleted }>(
              'SELECT event FROM collection.completed_event_evidence WHERE run_id=$1',
              [correctionRun.runId],
            )
          )[0]!.event;
          const correctionSnapshot = (
            await connection.query<{ snapshot_id: string; parsed_event_id: string }>(
              'SELECT snapshot_id::text,parsed_event_id::text FROM collection.snapshot_observation WHERE run_id=$1',
              [correctionRun.runId],
            )
          )[0];
          await connection.query(
            'UPDATE platform.outbox SET published_at=clock_timestamp() WHERE event_id=ANY($1::uuid[])',
            [[completion.eventId, correctionSnapshot!.parsed_event_id]],
          );
          const firstCorrection = await reparse(
            correctionSnapshot!.snapshot_id,
            'history-correction-first',
            400000,
            'Owned correction-first text.',
            true,
          );
          await compose('up', '--detach', '--wait', 'worker');
          await waitFor(
            'v2-first durable receipt',
            async () =>
              (
                await connection.query<{ count: number }>(
                  'SELECT count(*)::integer AS count FROM properties.incoming_fact WHERE event_id=$1',
                  [firstCorrection.eventId],
                )
              )[0]!.count === 1,
          );
          expect(
            (
              await connection.query<{ count: number }>(
                "SELECT count(*)::integer AS count FROM properties.listing WHERE source_listing_id='OWNED-CORRECTION-FIRST'",
              )
            )[0]!.count,
          ).toBe(0);
          await publisher.publish(parseCollectionEvent(completion), signal());
          await collect(
            'synthetic-portal-cobalto',
            'owned-correction-first-barrier',
            [],
            '2027-01-06T11:00:00.000Z',
          );
          await waitFor(
            'completion recovers missing v1 despite invalid correction',
            async () =>
              (
                await connection.query<{ disposition: string }>(
                  'SELECT disposition FROM properties.correction_effect WHERE event_id=$1',
                  [firstCorrection.eventId],
                )
              )[0]?.disposition === 'rejected',
          );
          const correctionIdentity = (
            await connection.query<{ listing_id: string }>(
              "SELECT listing_id::text FROM properties.listing WHERE source_listing_id='OWNED-CORRECTION-FIRST'",
            )
          )[0];
          const originalRecovery = (
            await get(`listings/${correctionIdentity!.listing_id}`, parseListingResponse)
          ).listing;
          expect(originalRecovery.collectionCount).toBe(1);
          expect(originalRecovery.askingPriceMinorUnits).toBe(first.askingPriceMinorUnits);
          const correctionFirstEffects = JSON.stringify(
            await connection.query<{
              event: PropertiesEvent<
                | 'properties.listing.created'
                | 'properties.listing.price-changed'
                | 'properties.listing.description-changed'
                | 'properties.listing.removed'
                | 'properties.listing.reappeared'
              >;
            }>('SELECT event FROM properties.listing_event WHERE listing_id=$1 ORDER BY revision', [
              correctionIdentity!.listing_id,
            ]),
          );
          await reparse(
            correctionSnapshot!.snapshot_id,
            'history-correction-first-valid',
            400000,
            'Owned correction-first text.',
          );
          await waitFor(
            'valid higher correction after durable rejection',
            async () =>
              (await get(`listings/${correctionIdentity!.listing_id}`, parseListingResponse))
                .listing.askingPriceMinorUnits === 400000,
          );
          const invalidAfter = await reparse(
            correctionSnapshot!.snapshot_id,
            'history-correction-after-invalid',
            900000,
            'Owned invalid later correction.',
            true,
          );
          await waitFor(
            'invalid correction after materialization rejected alone',
            async () =>
              (
                await connection.query<{ disposition: string }>(
                  'SELECT disposition FROM properties.correction_effect WHERE event_id=$1',
                  [invalidAfter.eventId],
                )
              )[0]?.disposition === 'rejected',
          );
          expect(
            (await get(`listings/${correctionIdentity!.listing_id}`, parseListingResponse)).listing
              .askingPriceMinorUnits,
          ).toBe(400000);
          await reparse(
            correctionSnapshot!.snapshot_id,
            'history-correction-after-valid',
            400000,
            'Owned correction-first text.',
          );
          await waitFor(
            'later valid correction recovers after materialization',
            async () =>
              (
                await connection.query<{ state: ListingChronologyState }>(
                  'SELECT state FROM properties.listing_current WHERE listing_id=$1',
                  [correctionIdentity!.listing_id],
                )
              )[0]!.state.acquisitions[0]!.corrected?.payload.correction.order === 4,
          );
          expect(
            JSON.stringify(
              await connection.query<{
                event: PropertiesEvent<
                  | 'properties.listing.created'
                  | 'properties.listing.price-changed'
                  | 'properties.listing.description-changed'
                  | 'properties.listing.removed'
                  | 'properties.listing.reappeared'
                >;
              }>(
                'SELECT event FROM properties.listing_event WHERE listing_id=$1 ORDER BY revision',
                [correctionIdentity!.listing_id],
              ),
            ),
          ).toBe(correctionFirstEffects);
          const recovered = (
            await get(`listings/${correctionIdentity!.listing_id}`, parseListingResponse)
          ).listing;
          expect(recovered.askingPriceMinorUnits).toBe(400000);
          expect(recovered.collectionCount).toBe(1);
          expect(recovered.history.map((item) => item.type)).toStrictEqual(['created']);
          // A genuine unfinished earlier run fences an already-complete later run across restart.
          await interruptRun('synthetic-data', 'owned-earlier-barrier', '2027-01-07T12:00:00.000Z');
          const laterListing = { ...description, askingPriceMinorUnits: 700000 };
          const laterRun = await collect(
            'synthetic-data',
            'owned-later-barrier',
            [document(8, laterListing)],
            '2027-01-08T12:00:00.000Z',
          );
          await waitFor(
            'later completion receipt behind earlier run',
            async () =>
              (
                await connection.query<{ count: number }>(
                  "SELECT count(*)::integer AS count FROM platform.inbox WHERE consumer_name='properties.completed-run' AND event_id=$1",
                  [laterRun.completedEventId],
                )
              )[0]!.count === 1,
          );
          await compose('restart', 'worker');
          await compose('up', '--detach', '--wait', 'worker');
          expect(
            (await get(`listings/${focused!.listing_id}`, parseListingResponse)).listing
              .collectionCount,
          ).toBe(4);
          expect(
            (
              await connection.query<{ count: number }>(
                'SELECT count(*)::integer AS count FROM properties.listing_run_effect WHERE run_id=$1',
                [laterRun.runId],
              )
            )[0]!.count,
          ).toBe(0);
          // Fail only source cursor progress: listing business effects commit independently and replay once.
          await connection.query(
            "CREATE FUNCTION properties.owned_fail_progress() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.source_id='synthetic-data' THEN RAISE EXCEPTION 'owned progress interruption'; END IF; RETURN NEW; END $$",
          );
          await connection.query(
            'CREATE TRIGGER owned_fail_progress BEFORE UPDATE ON properties.source_work FOR EACH ROW EXECUTE FUNCTION properties.owned_fail_progress()',
          );
          await collect(
            'synthetic-data',
            'owned-earlier-barrier',
            [document(7, { ...description, askingPriceMinorUnits: 800000 })],
            '2027-01-07T12:00:00.000Z',
          );
          await waitFor(
            'effect committed before failed source progress',
            async () =>
              (await get(`listings/${focused!.listing_id}`, parseListingResponse)).listing
                .collectionCount === 5,
          );
          const effectBeforeProgress = JSON.stringify(
            await connection.query<{
              event: PropertiesEvent<
                | 'properties.listing.created'
                | 'properties.listing.price-changed'
                | 'properties.listing.description-changed'
                | 'properties.listing.removed'
                | 'properties.listing.reappeared'
              >;
            }>('SELECT event FROM properties.listing_event WHERE listing_id=$1 ORDER BY revision', [
              focused!.listing_id,
            ]),
          );
          await compose('stop', 'worker');
          expect(
            JSON.stringify(
              await connection.query<{
                event: PropertiesEvent<
                  | 'properties.listing.created'
                  | 'properties.listing.price-changed'
                  | 'properties.listing.description-changed'
                  | 'properties.listing.removed'
                  | 'properties.listing.reappeared'
                >;
              }>(
                'SELECT event FROM properties.listing_event WHERE listing_id=$1 ORDER BY revision',
                [focused!.listing_id],
              ),
            ),
          ).toBe(effectBeforeProgress);
          await connection.query('DROP TRIGGER owned_fail_progress ON properties.source_work');
          await connection.query('DROP FUNCTION properties.owned_fail_progress()');
          await compose('up', '--detach', '--wait', 'worker');
          await waitFor(
            'canonical earlier then later catch-up',
            async () =>
              (await get(`listings/${focused!.listing_id}`, parseListingResponse)).listing
                .collectionCount === 6,
          );
          expect(
            (await get(`listings/${focused!.listing_id}`, parseListingResponse)).listing
              .askingPriceMinorUnits,
          ).toBe(700000);
          // A failed parse is still a seen identity, so complete full-manifest evidence cannot remove it.
          const failedDocument = {
            ...document(9, laterListing),
            bytes: new TextEncoder().encode('{}'),
          };
          const failedRun = await collect(
            'synthetic-data',
            'owned-seen-failed',
            [failedDocument],
            failedDocument.observedAt,
          );
          expect(failedRun.failedCount).toBe(1);
          await waitFor(
            'failed seen manifest is reconciled',
            async () =>
              (
                await connection.query<{ last_run_id: string }>(
                  "SELECT last_run_id::text FROM properties.source_work WHERE source_id='synthetic-data'",
                )
              )[0]!.last_run_id === failedRun.runId,
          );
          focusedResponse = await get(`listings/${focused!.listing_id}`, parseListingResponse);
          expect(focusedResponse.listing.status).toBe('active');
          expect(focusedResponse.listing.collectionCount).toBe(6);
          // One-shot runs establish source chronology before either remote fetch returns.
          let releaseEarlier;
          let enteredEarlier: () => void;
          const earlierEntered = new Promise<void>((resolve) => {
            enteredEarlier = resolve;
          });
          const earlierRelease = new Promise<void>((resolve) => {
            releaseEarlier = resolve;
          });
          const oneShot = (observedAt: string, price: number, held = false) =>
            new CollectSourceOnce(
              {
                fetchPage: async () => {
                  if (held) {
                    enteredEarlier();
                    await earlierRelease;
                  }
                  return {
                    documents: [
                      {
                        ...document(9, { ...laterListing, askingPriceMinorUnits: price }),
                        observedAt,
                      },
                    ],
                    nextCursor: null,
                    exhausted: true,
                  };
                },
                parse: (fetched, cancellation: AbortSignal) => parser.parse(fetched, cancellation),
              },
              store,
              new PostgresSourceRegisterRepository(connection),
              new PostgresCollectionRunRepository(connection),
              new PostgresTransactionRunner(connection),
              new PostgresUuidV7Generator(connection),
              { now: () => observedAt },
              new PostgresOutbox(connection),
            );
          const earlierPending = oneShot('2027-02-01T12:00:00.000Z', 600000, true).execute(
            'synthetic-data',
            'owned-once-earlier',
            null,
            AbortSignal.timeout(60000),
          );
          await earlierEntered;
          const earlierBoundary = (
            await connection.query<{ run_id: string; status: string; started_at: Date }>(
              "SELECT run_id::text,status,started_at FROM collection.collection_run WHERE operation_key='owned-once-earlier'",
            )
          )[0];
          expect(earlierBoundary!.status).toBe('running');
          expect(new Date(earlierBoundary!.started_at).toISOString()).toBe(
            '2027-02-01T12:00:00.000Z',
          );
          const laterOnce = await oneShot('2027-02-02T12:00:00.000Z', 500000).execute(
            'synthetic-data',
            'owned-once-later',
            null,
            signal(),
          );
          await waitFor(
            'later one-shot completion remains fenced during earlier fetch',
            async () =>
              (
                await connection.query<{ count: number }>(
                  "SELECT count(*)::integer AS count FROM platform.inbox WHERE consumer_name='properties.completed-run' AND event_id=$1",
                  [laterOnce.completedEventId],
                )
              )[0]!.count === 1,
          );
          expect(
            (await get(`listings/${focused!.listing_id}`, parseListingResponse)).listing
              .collectionCount,
          ).toBe(6);
          expect(
            (
              await connection.query<{ count: number }>(
                'SELECT count(*)::integer AS count FROM properties.listing_run_effect WHERE run_id=$1',
                [laterOnce.runId],
              )
            )[0]!.count,
          ).toBe(0);
          releaseEarlier!();
          const earlierOnce = await earlierPending;
          expect(earlierOnce.runId).toBe(earlierBoundary!.run_id);
          await waitFor(
            'canonical overlapping one-shot acquisitions',
            async () =>
              (await get(`listings/${focused!.listing_id}`, parseListingResponse)).listing
                .collectionCount === 8,
          );
          focusedResponse = await get(`listings/${focused!.listing_id}`, parseListingResponse);
          expect(focusedResponse.listing.askingPriceMinorUnits).toBe(500000);
          expect(
            (
              await connection.query<{ state: ListingChronologyState }>(
                'SELECT state FROM properties.listing_current WHERE listing_id=$1',
                [focused!.listing_id],
              )
            )[0]!.state.acquisitions
              .slice(-2)
              .map((item) => item.original.payload.source.observedAt),
          ).toStrictEqual(['2027-02-01T12:00:00.000Z', '2027-02-02T12:00:00.000Z']);
          // Authentic temporal inversion: A starts first but completes empty after B observed.
          // Each live run reads the wall clock; no fixture clock rewrites B's acquisition date.
          const invertedSource = 'synthetic-portal-brisa';
          const wallClock = { now: () => new Date().toISOString() };
          const invertedDocument = (observedAt: string) => ({
            sourceId: invertedSource,
            sourceListingId: 'OWNED-TEMPORAL-INVERSION',
            sourceUrl: 'https://synthetic.invalid/listings/owned-temporal-inversion',
            observedAt,
            mediaType: 'application/json' as const,
            bytes: new TextEncoder().encode(
              JSON.stringify({
                ...first,
                imageFingerprints: ['fixture-fingerprint:owned-temporal-inversion'],
              }),
            ),
          });
          const initialObservation = new Date(Date.now() - 5 * 86400000).toISOString();
          const seed = await collect(
            invertedSource,
            'owned-inversion-seed',
            [invertedDocument(initialObservation)],

            initialObservation,
          );
          await waitFor(
            'inversion seed reconciled',
            async () =>
              (
                await connection.query<{ last_run_id: string }>(
                  'SELECT last_run_id::text FROM properties.source_work WHERE source_id=$1',
                  [invertedSource],
                )
              )[0]?.last_run_id === seed.runId,
          );
          const invertedIdentity = (
            await connection.query<{ listing_id: string; property_id: string }>(
              "SELECT listing_id::text,property_id::text FROM properties.listing WHERE source_listing_id='OWNED-TEMPORAL-INVERSION'",
            )
          )[0];
          const liveService = (
            source: ListingSource,
            snapshots: RawSnapshotStore = store,
            liveClock = wallClock,
            resumable = false,
          ) =>
            new (resumable ? CollectSourceRun : CollectSourceOnce)(
              source,
              snapshots,
              new PostgresSourceRegisterRepository(connection),
              new PostgresCollectionRunRepository(connection),
              new PostgresTransactionRunner(connection),
              new PostgresUuidV7Generator(connection),
              liveClock,
              new PostgresOutbox(connection),
            );
          let releaseEmpty;
          let enteredEmpty: () => void;
          const emptyEntered = new Promise<void>((resolve) => {
            enteredEmpty = resolve;
          });
          const emptyRelease = new Promise<void>((resolve) => {
            releaseEmpty = resolve;
          });
          const emptyPending = liveService(
            {
              fetchPage: async () => {
                enteredEmpty();
                await emptyRelease;
                return { documents: [], nextCursor: null, exhausted: true };
              },
              parse: (input: RawListingDocument, cancellation: AbortSignal) =>
                parser.parse(input, cancellation),
            },
            store,
            wallClock,
            true,
          ).execute(invertedSource, 'owned-inversion-empty-A', null, AbortSignal.timeout(60000));
          await emptyEntered;
          const emptyBoundary = (
            await connection.query<{ run_id: string; started_at: Date }>(
              "SELECT run_id::text,started_at FROM collection.collection_run WHERE operation_key='owned-inversion-empty-A'",
            )
          )[0];
          let returnedObservation;
          const returnSource = {
            fetchPage: async () => {
              returnedObservation = wallClock.now();
              return {
                documents: [invertedDocument(returnedObservation)],
                nextCursor: null,
                exhausted: true,
              };
            },
            parse: (input: RawListingDocument, cancellation: AbortSignal) =>
              parser.parse(input, cancellation),
          };
          const returnedRun = await liveService(returnSource).execute(
            invertedSource,
            'owned-inversion-return-B',
            null,
            signal(),
          );
          await waitFor(
            'inverted B completion received while A held',
            async () =>
              (
                await connection.query<{ count: number }>(
                  "SELECT count(*)::integer AS count FROM platform.inbox WHERE consumer_name='properties.completed-run' AND event_id=$1",
                  [returnedRun.completedEventId],
                )
              )[0]!.count === 1,
          );
          expect(
            (await get(`listings/${invertedIdentity!.listing_id}`, parseListingResponse)).listing
              .collectionCount,
          ).toBe(1);
          releaseEmpty!();
          const emptyRun = await emptyPending;
          expect(emptyRun.runId).toBe(emptyBoundary!.run_id);
          await waitFor(
            'inverted A then B reconciled',
            async () =>
              (await get(`listings/${invertedIdentity!.listing_id}`, parseListingResponse)).listing
                .collectionCount === 2,
          );
          const emptyCompletedAt = (
            await connection.query<{ completed_at: Date }>(
              'SELECT completed_at FROM collection.collection_run WHERE run_id=$1',
              [emptyRun.runId],
            )
          )[0]!.completed_at.toISOString();
          expect(Date.parse(returnedObservation!) < Date.parse(emptyCompletedAt)).toBeTruthy();
          let invertedResponse = await get(
            `listings/${invertedIdentity!.listing_id}`,
            parseListingResponse,
          );
          expect(
            invertedResponse.listing.history.map((item) => [item.type, item.effectiveAt]),
          ).toStrictEqual([
            ['created', initialObservation],
            ['removed', emptyCompletedAt],

            ['reappeared', returnedObservation],
          ]);
          expect(invertedResponse.listing.lifeline).toStrictEqual([
            { from: initialObservation, to: null },
          ]);
          expect(invertedResponse.metadata.asOf).toBe(emptyCompletedAt);
          expect(
            (
              await connection.query<{ revision: number }>(
                'SELECT revision FROM properties.listing_event WHERE listing_id=$1 ORDER BY revision',
                [invertedIdentity!.listing_id],
              )
            ).map((row) => row.revision),
          ).toStrictEqual([1, 2, 3]);
          // Permanent one-shot failures cannot leave an absence-blocking running boundary.
          const rejectedSource = {
            fetchPage: async () => ({ documents: [], nextCursor: null, exhausted: true }),
            parse: returnSource.parse,
          };
          await expect(
            liveService(rejectedSource).execute(
              invertedSource,
              'owned-once-terminal-rejection',
              null,
              signal(),
            ),
          ).rejects.toThrow();
          let retryFetches = 0;
          await expect(
            liveService({
              ...returnSource,
              fetchPage: async () => {
                retryFetches++;
                return returnSource.fetchPage();
              },
            }).execute(invertedSource, 'owned-once-terminal-rejection', null, signal()),
          ).rejects.toThrow();
          expect(retryFetches).toBe(0);
          await expect(
            liveService(returnSource).execute(
              'synthetic-portal-aurora',
              'owned-once-terminal-rejection',
              null,
              signal(),
            ),
          ).rejects.toThrow();
          const cancellation = new AbortController();
          await expect(
            liveService({
              ...returnSource,
              fetchPage: async () => {
                cancellation.abort();
                throw cancellation.signal.reason;
              },
            }).execute(
              invertedSource,
              'owned-once-terminal-cancellation',
              null,
              cancellation.signal,
            ),
          ).rejects.toThrow();
          const terminalRuns = await connection.query<{
            run_id: string;
            source_id: string;
            status: string;
            completed_at: Date;
            completed_event_id: string;
            manifest_hash: string;
          }>(
            "SELECT run_id::text,source_id,status,completed_at,completed_event_id,manifest_hash FROM collection.collection_run WHERE operation_key IN ('owned-once-terminal-rejection','owned-once-terminal-cancellation') ORDER BY operation_key",
          );
          expect(terminalRuns.length).toBe(2);
          for (const failed of terminalRuns) {
            expect(failed.source_id).toBe(invertedSource);
            expect(failed.status).toBe('failed');
            expect(failed.completed_at).toBe(null);
            expect(failed.completed_event_id).toBe(null);
            expect(failed.manifest_hash).toBe(null);
            expect(
              (
                await connection.query<{ count: number }>(
                  'SELECT count(*)::integer AS count FROM collection.completed_event_evidence WHERE run_id=$1',
                  [failed.run_id],
                )
              )[0]!.count,
            ).toBe(0);
          }
          const transientStore = {
            store: async () => {
              throw new ExternalFailure({
                kind: 'transient',
                operation: 'collection.snapshot.store',
              });
            },
          };
          await expect(
            liveService(returnSource, transientStore).execute(
              invertedSource,
              'owned-once-transient-recovery',
              null,
              signal(),
            ),
          ).rejects.toThrow();
          const transientBoundary = (
            await connection.query<{ run_id: string; started_at: Date; status: string }>(
              "SELECT run_id::text,started_at,status FROM collection.collection_run WHERE operation_key='owned-once-transient-recovery'",
            )
          )[0];
          expect(transientBoundary!.status).toBe('running');
          const recoveredRun = await liveService(returnSource).execute(
            invertedSource,
            'owned-once-transient-recovery',
            null,
            signal(),
          );
          expect(recoveredRun.runId).toBe(transientBoundary!.run_id);
          const recoveredBoundary = (
            await connection.query<{ started_at: Date; status: string }>(
              'SELECT started_at,status FROM collection.collection_run WHERE run_id=$1',
              [recoveredRun.runId],
            )
          )[0];
          expect(recoveredBoundary!.started_at.toISOString()).toBe(
            transientBoundary!.started_at.toISOString(),
          );
          expect(recoveredBoundary!.status).toBe('completed');
          await waitFor(
            'valid run progresses past failed boundaries',
            async () =>
              (await get(`listings/${invertedIdentity!.listing_id}`, parseListingResponse)).listing
                .collectionCount === 3,
          );
          // A cleanup racing an already completed same-key request cannot downgrade success.
          await new PostgresTransactionRunner(connection).runInTransaction(async (tx) => {
            expect(
              (await new PostgresCollectionRunRepository(connection).fail(tx, recoveredRun.runId))
                .status,
            ).toBe('completed');
          }, signal());
          const nextObservation = new Date(Date.now() + 2 * 86400000).toISOString();
          await liveService(
            {
              fetchPage: async () => ({
                documents: [invertedDocument(nextObservation)],
                nextCursor: null,
                exhausted: true,
              }),
              parse: returnSource.parse,
            },
            store,
            { now: () => nextObservation },
          ).execute(invertedSource, 'owned-inversion-subsequent', null, signal());
          await waitFor(
            'subsequent inversion acquisition',
            async () =>
              (await get(`listings/${invertedIdentity!.listing_id}`, parseListingResponse)).listing
                .collectionCount === 4,
          );
          invertedResponse = await get(
            `listings/${invertedIdentity!.listing_id}`,
            parseListingResponse,
          );
          expect(invertedResponse.metadata.asOf).toBe(nextObservation);
          const invertedPropertyResponse = await get(
            `properties/${invertedIdentity!.property_id}`,
            parsePropertyResponse,
          );
          expect(invertedPropertyResponse.property.summary.timeOnMarketDays).toBe(
            Math.floor((Date.parse(nextObservation) - Date.parse(initialObservation)) / 86400000),
          );
          expect(invertedResponse.listing.lifeline).toStrictEqual([
            { from: initialObservation, to: null },
          ]);
          expect(invertedResponse.listing.history.length).toBe(3);
          expect(invertedPropertyResponse.property.listings[0]).toStrictEqual(
            invertedResponse.listing,
          );
          // Real combined command deadlines preserve same-key source/storage recovery.
          const observationSource = 'synthetic-portal-aurora';
          const liveDocument = (
            identity: string,
            observedAt: string,
            price: number,
            description: string,
          ) => ({
            sourceId: observationSource,
            sourceListingId: identity,
            sourceUrl: `https://synthetic.invalid/listings/${identity}`,
            observedAt,
            mediaType: 'application/json' as const,
            bytes: new TextEncoder().encode(
              JSON.stringify({
                ...first,
                askingPriceMinorUnits: price,
                maskedDescription: description,
                imageFingerprints: [`fixture-fingerprint:owned-${identity.toLowerCase()}`],
              }),
            ),
          });
          const timeoutSource = {
            fetchPage: async () => ({
              documents: [
                liveDocument('OWNED-DEADLINE', wallClock.now(), 1000000, 'Deadline recovery.'),
              ],
              nextCursor: null,
              exhausted: true,
            }),
            parse: returnSource.parse,
          };
          for (const dependency of ['source', 'storage']) {
            let entered = false;
            const awaitDeadline = async (cancellation: {
              addEventListener: (arg0: string, arg1: () => void, arg2: { once: boolean }) => void;
            }) => {
              entered = true;
              await new Promise<void>((resolve) =>
                cancellation.addEventListener('abort', resolve, { once: true }),
              );
              // The production source and S3 adapters sanitize command aborts this way.
              throw new ExternalFailure({
                kind: 'cancelled',
                operation: `owned-deadline-${dependency}`,
              });
            };
            const shutdown = new AbortController();
            const deadlineMs = 500;
            const deadlineAt = Date.now() + deadlineMs;
            const combined = AbortSignal.any([shutdown.signal, AbortSignal.timeout(deadlineMs)]);
            const key = `owned-command-deadline-${dependency}`;
            await expect(
              liveService(
                dependency === 'source'
                  ? {
                      ...timeoutSource,
                      fetchPage: (
                        _source: string,
                        _cursor: string | null,
                        cancellation: AbortSignal,
                      ) => awaitDeadline(cancellation),
                    }
                  : timeoutSource,
                dependency === 'storage'
                  ? { store: (_input, cancellation: AbortSignal) => awaitDeadline(cancellation) }
                  : store,
              ).execute(observationSource, key, null, combined, deadlineAt),
            ).rejects.toThrow();
            expect(entered).toBe(true);
            expect(combined.reason.name).toBe('TimeoutError');
            const boundary = (
              await connection.query<{ run_id: string; started_at: Date; status: string }>(
                'SELECT run_id::text,started_at,status FROM collection.collection_run WHERE operation_key=$1',
                [key],
              )
            )[0];
            expect(boundary!.status).toBe('running');
            expect(
              (
                await connection.query<{ count: number }>(
                  'SELECT count(*)::integer AS count FROM collection.parsed_event_evidence evidence JOIN collection.snapshot_observation observation USING (snapshot_id) WHERE observation.run_id=$1',
                  [boundary!.run_id],
                )
              )[0]!.count,
            ).toBe(0);
            expect(
              (
                await connection.query<{ count: number }>(
                  'SELECT count(*)::integer AS count FROM collection.completed_event_evidence WHERE run_id=$1',
                  [boundary!.run_id],
                )
              )[0]!.count,
            ).toBe(0);
            const recovered = await liveService(timeoutSource).execute(
              observationSource,
              key,
              null,
              signal(),
            );
            expect(recovered.runId).toBe(boundary!.run_id);
            const completed = (
              await connection.query<{ started_at: Date; status: string }>(
                'SELECT started_at,status FROM collection.collection_run WHERE run_id=$1',
                [boundary!.run_id],
              )
            )[0];
            expect(completed!.started_at.toISOString()).toBe(boundary!.started_at.toISOString());
            expect(completed!.status).toBe('completed');
          }
          await waitFor(
            'deadline retries materialized exactly once',
            async () =>
              (
                await connection.query<{ count: number }>(
                  "SELECT count(*)::integer AS count FROM properties.listing_acquisition acquisition JOIN properties.listing listing USING (listing_id) WHERE listing.source_listing_id='OWNED-DEADLINE'",
                )
              )[0]!.count === 2,
          );
          // A starts first and fetches later; B observes first but its canonical effects wait for A.
          // Both the existing identity and the newly created identity retain this genuine inversion.
          const observedIdentities = ['OWNED-OBSERVATION-EXISTING', 'OWNED-OBSERVATION-NEW'];
          const observationRun = (source: ListingSource) =>
            liveService(source, store, wallClock, true);
          const seedObservation = wallClock.now();
          await observationRun({
            ...timeoutSource,
            fetchPage: async () => ({
              documents: [
                liveDocument(observedIdentities[0]!, seedObservation, 1000000, 'Seed values.'),
              ],
              nextCursor: null,
              exhausted: true,
            }),
          }).execute(observationSource, 'owned-observation-seed', null, signal());
          await waitFor(
            'observation seed materialized',
            async () =>
              (
                await connection.query<{ listing_id: string }>(
                  'SELECT listing_id FROM properties.listing WHERE source_listing_id=$1',
                  [observedIdentities[0]],
                )
              ).length === 1,
          );
          await waitFor(
            'observation seed assigned before the inverted updates',
            async () =>
              (
                await connection.query<{ processed_revision: number }>(
                  'SELECT assignment.processed_revision FROM properties.listing_assignment assignment JOIN properties.listing listing USING(listing_id) WHERE listing.source_listing_id=$1',
                  [observedIdentities[0]],
                )
              )[0]?.processed_revision === 1,
          );
          let releaseDocuments, enteredDocuments: () => void;
          const documentRelease = new Promise<void>((resolve) => {
            releaseDocuments = resolve;
          });
          const documentEntered = new Promise<void>((resolve) => {
            enteredDocuments = resolve;
          });
          let observationA: string, observationB: string;
          const pendingDocuments = observationRun({
            ...timeoutSource,
            fetchPage: async () => {
              enteredDocuments();
              await documentRelease;
              observationA = wallClock.now();
              return {
                documents: observedIdentities.map((identity) =>
                  liveDocument(identity, observationA, 1300000, 'A later observation.'),
                ),
                nextCursor: null,
                exhausted: true,
              };
            },
          }).execute(observationSource, 'owned-observation-A', null, AbortSignal.timeout(60000));
          await documentEntered;
          const runB = await observationRun({
            ...timeoutSource,
            fetchPage: async () => {
              observationB = wallClock.now();
              return {
                documents: observedIdentities.map((identity) =>
                  liveDocument(identity, observationB, 1200000, 'B earlier observation.'),
                ),
                nextCursor: null,
                exhausted: true,
              };
            },
          }).execute(observationSource, 'owned-observation-B', null, signal());
          await waitFor(
            'document-bearing B completion fenced by A',
            async () =>
              (
                await connection.query<{ event_id: string }>(
                  "SELECT event_id FROM platform.inbox WHERE consumer_name='properties.completed-run' AND event_id=$1",
                  [runB.completedEventId],
                )
              ).length === 1,
          );
          expect(
            (
              await connection.query<{ run_id: string }>(
                'SELECT run_id FROM properties.listing_run_effect WHERE run_id=$1',
                [runB.runId],
              )
            ).length,
          ).toBe(0);
          releaseDocuments!();
          const runA = await pendingDocuments;
          expect(Date.parse(observationB!) < Date.parse(observationA!)).toBeTruthy();
          const observationResponses: {
            listing_id: string;
            property_id: string;
            count: number;
            response?: ListingResponse;
          }[] = [];
          for (const [index, identity] of observedIdentities.entries()) {
            await waitFor(
              `${identity} retains both inverted acquisitions`,
              async () =>
                (
                  await connection.query<{ count: number }>(
                    "SELECT jsonb_array_length(current.state->'acquisitions') AS count FROM properties.listing_current current JOIN properties.listing listing USING (listing_id) WHERE listing.source_listing_id=$1",
                    [identity],
                  )
                )[0]?.count === (index === 0 ? 3 : 2),
            );
            const ids = (
              await connection.query<{ listing_id: string; property_id: string }>(
                'SELECT listing_id::text,property_id::text FROM properties.listing WHERE source_listing_id=$1',
                [identity],
              )
            )[0];
            const detail = await get(`listings/${ids!.listing_id}`, parseListingResponse);
            expect(detail.listing.askingPriceMinorUnits).toBe(1300000);
            expect(
              (detail.listing.description as Extract<ListingDescription, { permission: 'allowed' }>)
                .current,
            ).toBe('A later observation.');
            expect(detail.listing.provenance.runId).toBe(runA.runId);
            expect(detail.listing.lastCollectedAt).toBe(observationA!);
            expect(detail.metadata.asOf).toBe(observationA!);
            expect(
              (
                detail.listing.description as Extract<ListingDescription, { permission: 'allowed' }>
              ).versions
                .slice(-2)
                .map((item) => [item.effectiveAt, item.text]),
            ).toStrictEqual([
              [observationB!, 'B earlier observation.'],
              [observationA!, 'A later observation.'],
            ]);
            expect(
              detail.listing.history.slice(-2).map((item) => [item.type, item.effectiveAt]),
            ).toStrictEqual([
              ['price-changed', observationB!],
              ['description-changed', observationB!],
            ]);
            expect(
              (
                detail!.listing.history.at(-2)! as Extract<
                  ListingHistory,
                  { type: 'price-changed' }
                >
              ).previousMinorUnits,
            ).toBe(1300000);
            const effects = await connection.query<{
              revision: number;
              event: PropertiesEvent<
                | 'properties.listing.created'
                | 'properties.listing.price-changed'
                | 'properties.listing.description-changed'
                | 'properties.listing.removed'
                | 'properties.listing.reappeared'
              >;
            }>(
              'SELECT revision,event FROM properties.listing_event WHERE listing_id=$1 ORDER BY revision',
              [ids!.listing_id],
            );
            expect(effects.map((row) => row.revision)).toStrictEqual(
              Array.from({ length: index === 0 ? 5 : 3 }, (_item, i) => i + 1),
            );
            expect(
              (await get(`properties/${ids!.property_id}`, parsePropertyResponse)).property
                .listings[0],
            ).toStrictEqual(detail.listing);
            const olderSnapshot = (
              await connection.query<{ snapshot_id: string }>(
                'SELECT snapshot_id::text FROM collection.snapshot_observation WHERE run_id=$1 AND source_listing_id=$2',
                [runB.runId, identity],
              )
            )[0]!.snapshot_id;

            await reparse(
              olderSnapshot,
              `owned-inverted-correction-${index}`,
              1100000,
              'Corrected earlier observation.',
            );
            await waitFor('inverted historical correction', async () =>
              (
                (await get(`listings/${ids!.listing_id}`, parseListingResponse)).listing
                  .description as Extract<ListingDescription, { permission: 'allowed' }>
              ).versions.some(
                (item: { text: string }) => item.text === 'Corrected earlier observation.',
              ),
            );
            expect(
              await connection.query<{
                revision: number;
                event: PropertiesEvent<
                  | 'properties.listing.created'
                  | 'properties.listing.price-changed'
                  | 'properties.listing.description-changed'
                  | 'properties.listing.removed'
                  | 'properties.listing.reappeared'
                >;
              }>(
                'SELECT revision,event FROM properties.listing_event WHERE listing_id=$1 ORDER BY revision',
                [ids!.listing_id],
              ),
            ).toStrictEqual(effects);
            observationResponses.push({
              ...ids!,
              count: index === 0 ? 3 : 2,
            });
          }
          const subsequentObservation = wallClock.now();
          await observationRun({
            ...timeoutSource,
            fetchPage: async () => ({
              documents: observedIdentities.map((identity) =>
                liveDocument(identity, subsequentObservation, 1400000, 'Subsequent observation.'),
              ),
              nextCursor: null,
              exhausted: true,
            }),
          }).execute(observationSource, 'owned-observation-subsequent', null, signal());
          for (const item of observationResponses) {
            await waitFor(
              'subsequent canonical observation',
              async () =>
                (await get(`listings/${item.listing_id}`, parseListingResponse)).listing
                  .collectionCount ===
                item.count + 1,
            );
            item.response = await get(`listings/${item.listing_id}`, parseListingResponse);
            expect(
              (
                item.response!.listing.history.at(-2)! as Extract<
                  ListingHistory,
                  { type: 'price-changed' }
                >
              ).previousMinorUnits,
            ).toBe(1200000);
            expect(item.response!.listing.askingPriceMinorUnits).toBe(1400000);
            expect(
              (await get(`properties/${item.property_id}`, parsePropertyResponse)).property
                .listings[0],
            ).toStrictEqual(item.response!.listing);
          }
          await waitFor('resolution catches up with inverted listing revisions', async () => {
            const revisions = await connection.query<{
              processed_revision: string;
              revision: string;
            }>(
              'SELECT assignment.processed_revision::text,(SELECT max(revision)::text FROM properties.listing_event event WHERE event.listing_id=listing.listing_id) AS revision FROM properties.listing listing JOIN properties.listing_assignment assignment USING(listing_id) WHERE listing.source_listing_id=ANY($1::text[])',
              [observedIdentities],
            );
            return (
              revisions.length === 2 &&
              revisions.every((row) => row.processed_revision === row.revision)
            );
          });
          for (const [index, item] of observationResponses.entries()) {
            const originalDrop = item.response!.listing.history.find(
              (effect) =>
                effect.type === 'price-changed' &&
                effect.currentMinorUnits === 1200000 &&
                effect.effectiveAt === observationB,
            )!;
            const rankedDrop = (await reductions()).items.find(
              (row) => row.listingId === item.listing_id,
            )!;
            expect(rankedDrop.previousMinorUnits).toBe(1300000);
            expect(rankedDrop.currentMinorUnits).toBe(1200000);
            expect(rankedDrop.effectiveAt).toBe(observationB!);
            expect(rankedDrop.provenance).toStrictEqual(originalDrop.provenance);
            expect(rankedDrop.provenance.runId).toBe(runB.runId);
            const facts = await connection.query<{
              cause_at: string;
              effect_at: string;
              envelope_at: string | null;
            }>(
              `SELECT cause.event->'payload'->>'effectiveAt' AS cause_at,effect.minimum_effect->>'effectiveAt' AS effect_at,publication.payload->>'effectiveAt' AS envelope_at
               FROM properties.property_minimum_effect effect JOIN properties.listing_event cause ON cause.event_id=effect.cause_event_id
               LEFT JOIN platform.outbox publication ON publication.event_id=effect.publication_event_id
               WHERE cause.listing_id=$1 AND cause.event->>'type'='properties.listing.price-changed' AND cause.event->'payload'->'listing'->>'askingPriceMinorUnits'='1200000'`,
              [item.listing_id],
            );
            expect(facts).toHaveLength(1);
            expect(facts[0]!.cause_at).toBe(observationB!);
            expect(facts[0]!.effect_at).toBe(observationB!);
            if (index === 0) expect(facts[0]!.envelope_at).not.toBeNull();
            if (facts[0]!.envelope_at !== null)
              expect(facts[0]!.envelope_at >= observationA!).toBe(true);
          }
          // Additional identities use an already owned source without widening Collection authority.
          // This source already has January 2027 runs. Shift the live clock beyond that cursor while
          // retaining real elapsed start/observation/completion differences during overlapping fetches.
          const edgeClockOffset = Date.parse('2027-02-10T12:00:00.000Z') - Date.now();
          const edgeClock = { now: () => new Date(Date.now() + edgeClockOffset).toISOString() };
          const edgeDocument = (sourceId: string, identity: string, observedAt: string) => ({
            sourceId,
            sourceListingId: identity,
            sourceUrl: `https://synthetic.invalid/listings/${identity}`,
            observedAt,
            mediaType: 'application/json' as const,
            bytes: new TextEncoder().encode(
              JSON.stringify({
                ...first,
                imageFingerprints: [`fixture-fingerprint:owned-${identity.toLowerCase()}`],
              }),
            ),
          });
          const edgeRun = (
            sourceId: string,
            key: string,
            documents: readonly RawListingDocument[] | (() => readonly RawListingDocument[]),
            runClock = edgeClock,
            onFetch = async () => {},
          ) =>
            liveService(
              {
                fetchPage: async () => {
                  await onFetch();
                  return {
                    documents: typeof documents === 'function' ? documents() : documents,
                    nextCursor: null,
                    exhausted: true,
                  };
                },
                parse: returnSource.parse,
              },
              store,
              runClock,
              true,
            ).execute(sourceId, key, null, AbortSignal.timeout(60000));
          const waitProgress = (
            sourceId: string,
            result: CollectSourceRunResult | CollectionExecutionResult,
          ) =>
            waitFor(
              'edge-case source progress',
              async () =>
                (
                  await connection.query<{ last_run_id: string }>(
                    'SELECT last_run_id::text FROM properties.source_work WHERE source_id=$1',
                    [sourceId],
                  )
                )[0]?.last_run_id === result.runId,
            );
          const edgeResponses: {
            listing_id: string;
            property_id: string;
            sourceId?: string;
            response?: ListingResponse;
            constituents?: { from: string; to: string | null }[];
            exposure?: number;
          }[] = [];
          const absenceSource = 'synthetic-portal-cobalto';
          const absenceIdentities = ['OWNED-ABSENCE-EXISTING', 'OWNED-ABSENCE-NEW'];
          const absenceSeed = new Date(Date.parse(edgeClock.now()) - 5 * 86400000).toISOString();
          await waitProgress(
            absenceSource,
            await edgeRun(absenceSource, 'owned-absence-seed', [
              edgeDocument(absenceSource, absenceIdentities[0]!, absenceSeed),
            ]),
          );
          let releaseAbsence, enterAbsence: () => void;
          const absenceHeld = new Promise<void>((resolve) => {
            releaseAbsence = resolve;
          });
          const absenceEntered = new Promise<void>((resolve) => {
            enterAbsence = resolve;
          });
          let absenceObservation: string;
          const documentA = edgeRun(
            absenceSource,
            'owned-absence-document-A',
            () => {
              absenceObservation = edgeClock.now();
              return absenceIdentities.map((identity) =>
                edgeDocument(absenceSource, identity, absenceObservation),
              );
            },
            edgeClock,
            async () => {
              enterAbsence();
              await absenceHeld;
            },
          );
          await absenceEntered;
          const emptyB = await edgeRun(absenceSource, 'owned-absence-empty-B', []);
          const earlierCompletion = (
            await connection.query<{ completed_at: Date }>(
              'SELECT completed_at FROM collection.collection_run WHERE run_id=$1',
              [emptyB.runId],
            )
          )[0]!.completed_at.toISOString();
          expect(
            (
              await connection.query<{ run_id: string }>(
                'SELECT run_id FROM properties.listing_run_effect WHERE run_id=$1',
                [emptyB.runId],
              )
            ).length,
          ).toBe(0);
          await new Promise<void>((resolve) => setTimeout(resolve, 20));
          releaseAbsence!();
          await documentA;
          await waitProgress(absenceSource, emptyB);
          expect(Date.parse(absenceObservation!) > Date.parse(earlierCompletion)).toBeTruthy();
          for (const [index, identity] of absenceIdentities.entries()) {
            const ids = (
              await connection.query<{ listing_id: string; property_id: string }>(
                'SELECT listing_id::text,property_id::text FROM properties.listing WHERE source_listing_id=$1',
                [identity],
              )
            )[0];
            const detail = await get(`listings/${ids!.listing_id}`, parseListingResponse);
            expect(detail.listing.collectionCount).toBe(index === 0 ? 2 : 1);
            expect(detail.listing.status).toBe(index === 0 ? 'removed' : 'active');
            expect(detail.metadata.asOf).toBe(absenceObservation!);
            if (index === 0) {
              expect(
                detail.listing.history.map((entry) => [entry.type, entry.effectiveAt]),
              ).toStrictEqual([
                ['created', absenceSeed],
                ['removed', earlierCompletion],
              ]);
              expect(detail!.listing.history.at(-1)!.provenance.observedAt).toBe(absenceSeed);
              const event = (
                await connection.query<{
                  event: PropertiesEvent<
                    | 'properties.listing.created'
                    | 'properties.listing.price-changed'
                    | 'properties.listing.description-changed'
                    | 'properties.listing.removed'
                    | 'properties.listing.reappeared'
                  >;
                }>(
                  'SELECT event FROM properties.listing_event WHERE listing_id=$1 AND revision=2',
                  [ids!.listing_id],
                )
              )[0]!.event;
              expect(event.payload.listing.provenance.observedAt).toBe(absenceSeed);
              expect(event.payload.effectiveAt).toBe(earlierCompletion);
            } else
              expect(detail.listing.history.map((entry) => entry.type)).toStrictEqual(['created']);
            expect(
              (
                await connection.query<{ disposition: string }>(
                  'SELECT disposition FROM properties.listing_run_effect WHERE run_id=$1 AND source_listing_id=$2',
                  [emptyB.runId, identity],
                )
              )[0]!.disposition,
            ).toBe('applied');
            expect(
              (await get(`properties/${ids!.property_id}`, parsePropertyResponse)).property
                .listings[0],
            ).toStrictEqual(detail.listing);
            edgeResponses.push({ ...ids!, sourceId: absenceSource });
          }
          const subsequentAbsenceObservation = edgeClock.now();
          await waitProgress(
            absenceSource,
            await edgeRun(
              absenceSource,
              'owned-absence-subsequent',
              absenceIdentities.map((identity) =>
                edgeDocument(absenceSource, identity, subsequentAbsenceObservation),
              ),
            ),
          );
          for (const [index, item] of edgeResponses.entries()) {
            item.response = await get(`listings/${item.listing_id}`, parseListingResponse);
            expect(item.response!.listing.collectionCount).toBe(index === 0 ? 3 : 2);
            expect(item.response!.listing.status).toBe('active');
            expect(item.response!.listing.history.at(-1)!.type).toBe(
              index === 0 ? 'reappeared' : 'created',
            );
            expect(
              (await get(`properties/${item.property_id}`, parsePropertyResponse)).property
                .listings[0],
            ).toStrictEqual(item.response!.listing);
          }
          // Independent synthetic start/completion clocks retain real publication evidence for all runs.
          // Holding Removed(7) lets the later-started return(3) and absence(5) complete first.
          const periodsSource = absenceSource;
          const periodDate = (day: number) =>
            `2027-03-${String(day).padStart(2, '0')}T12:00:00.000Z`;
          const periodIdentity = 'OWNED-CONSTITUENT-PERIODS';
          const periodClock = (ordinal: number, completedDay: number) => {
            let calls = 0;
            return {
              now: () =>
                calls++ === 0
                  ? new Date(Date.parse(periodDate(1)) + ordinal * 1000).toISOString()
                  : periodDate(completedDay),
            };
          };
          const periodRun = (
            ordinal: number,
            observedDay: number | null,
            completedDay: number,
            onFetch?: () => Promise<void>,
          ) =>
            edgeRun(
              periodsSource,
              `owned-period-${ordinal}`,
              observedDay === null
                ? []
                : [edgeDocument(periodsSource, periodIdentity, periodDate(observedDay))],
              periodClock(ordinal, completedDay),
              onFetch,
            );
          await waitProgress(periodsSource, await periodRun(0, 1, 1));
          await waitProgress(periodsSource, await periodRun(1, null, 4));
          await waitProgress(periodsSource, await periodRun(2, 6, 6));
          let releasePeriod, enterPeriod: () => void;
          const periodHeld = new Promise<void>((resolve) => {
            releasePeriod = resolve;
          });
          const periodEntered = new Promise<void>((resolve) => {
            enterPeriod = resolve;
          });
          const removal7 = periodRun(3, null, 7, async () => {
            enterPeriod();
            await periodHeld;
          });
          await periodEntered;
          const return3 = await periodRun(4, 3, 3);
          const removal5 = await periodRun(5, null, 5);
          expect(
            (
              await connection.query<{ run_id: string }>(
                'SELECT run_id FROM properties.listing_run_effect WHERE run_id=$1',
                [return3.runId],
              )
            ).length,
          ).toBe(0);
          releasePeriod!();
          await removal7;
          await waitProgress(periodsSource, removal5);
          const periodIds = (
            await connection.query<{ listing_id: string; property_id: string }>(
              'SELECT listing_id::text,property_id::text FROM properties.listing WHERE source_listing_id=$1',
              [periodIdentity],
            )
          )[0];
          const periodResponse = await get(
            `listings/${periodIds!.listing_id}`,
            parseListingResponse,
          );
          const constituents = [
            { from: periodDate(1), to: periodDate(4) },
            { from: periodDate(6), to: periodDate(7) },
            { from: periodDate(3), to: periodDate(5) },
          ];
          expect(
            (
              await connection.query<{ state: ListingChronologyState }>(
                'SELECT state FROM properties.listing_current WHERE listing_id=$1',
                [periodIds!.listing_id],
              )
            )[0]!.state.lifeline,
          ).toStrictEqual(constituents);
          expect(periodResponse.listing.lifeline).toStrictEqual([
            { from: periodDate(1), to: periodDate(5) },
            { from: periodDate(6), to: periodDate(7) },
          ]);
          expect(
            periodResponse.listing.history.map((entry) => [entry.type, entry.effectiveAt]),
          ).toStrictEqual([
            ['created', periodDate(1)],
            ['removed', periodDate(4)],
            ['reappeared', periodDate(6)],
            ['removed', periodDate(7)],
            ['reappeared', periodDate(3)],
            ['removed', periodDate(5)],
          ]);
          expect(periodResponse.listing.collectionCount).toBe(3);
          expect(periodResponse.metadata.asOf).toBe(periodDate(7));
          const periodProperty = await get(
            `properties/${periodIds!.property_id}`,
            parsePropertyResponse,
          );
          expect(periodProperty.property.summary.timeOnMarketDays).toBe(5);
          expect(periodProperty.property.listings[0]).toStrictEqual(periodResponse.listing);
          const periodEvents = await connection.query<{
            revision: number;
            event: PropertiesEvent<
              | 'properties.listing.created'
              | 'properties.listing.price-changed'
              | 'properties.listing.description-changed'
              | 'properties.listing.removed'
              | 'properties.listing.reappeared'
            >;
          }>(
            'SELECT revision,event FROM properties.listing_event WHERE listing_id=$1 ORDER BY revision',
            [periodIds!.listing_id],
          );
          expect(periodEvents.map((entry) => entry.revision)).toStrictEqual([1, 2, 3, 4, 5, 6]);
          edgeResponses.push({
            ...periodIds!,
            response: periodResponse,
            constituents,
            exposure: 5,
          });
          for (const item of edgeResponses)
            item.response = await get(`listings/${item.listing_id}`, parseListingResponse);
          const originals = await connection.query<{
            event: CollectionSnapshotParsed | CollectionSnapshotCorrected;
          }>('SELECT event FROM collection.parsed_event_evidence ORDER BY event_id');
          const immutableEffects = JSON.stringify(
            await connection.query<{
              event: PropertiesEvent<
                | 'properties.listing.created'
                | 'properties.listing.price-changed'
                | 'properties.listing.description-changed'
                | 'properties.listing.removed'
                | 'properties.listing.reappeared'
              >;
            }>('SELECT event FROM properties.listing_event ORDER BY listing_id,revision'),
          );
          const beforeReplayRanking = await assertRankings();
          await connection.query(
            "DELETE FROM platform.inbox WHERE consumer_name IN ('properties.parsed-listing','properties.completed-run')",
          );
          await compose('restart', 'worker', 'api');
          await compose('up', '--detach', '--wait', 'worker', 'api');
          for (const row of [...originals].reverse())
            await publisher.publish(parseCollectionEvent(row.event), signal());
          const completions = await connection.query<{ event: CollectionRunCompleted }>(
            'SELECT event FROM collection.completed_event_evidence ORDER BY event_id DESC',
          );
          for (const row of completions)
            await publisher.publish(parseCollectionEvent(row.event), signal());
          await waitFor(
            'replayed receipt markers',
            async () =>
              (
                await connection.query<{ count: number }>(
                  "SELECT count(*)::integer AS count FROM platform.inbox WHERE consumer_name='properties.parsed-listing'",
                )
              )[0]!.count === originals.length,
          );
          expect(
            JSON.stringify(
              await connection.query<{
                event: PropertiesEvent<
                  | 'properties.listing.created'
                  | 'properties.listing.price-changed'
                  | 'properties.listing.description-changed'
                  | 'properties.listing.removed'
                  | 'properties.listing.reappeared'
                >;
              }>('SELECT event FROM properties.listing_event ORDER BY listing_id,revision'),
            ),
          ).toBe(immutableEffects);
          expect(await reductions()).toStrictEqual(beforeReplayRanking);
          expect(await get(`listings/${focused!.listing_id}`, parseListingResponse)).toStrictEqual(
            focusedResponse,
          );
          expect(
            await get(`listings/${invertedIdentity!.listing_id}`, parseListingResponse),
          ).toStrictEqual(invertedResponse);
          for (const item of observationResponses) {
            expect(await get(`listings/${item.listing_id}`, parseListingResponse)).toStrictEqual(
              item.response,
            );
            expect(
              (await get(`properties/${item.property_id}`, parsePropertyResponse)).property
                .listings[0],
            ).toStrictEqual(item.response!.listing);
          }
          for (const item of edgeResponses) {
            expect(await get(`listings/${item.listing_id}`, parseListingResponse)).toStrictEqual(
              item.response,
            );
            const property = await get(`properties/${item.property_id}`, parsePropertyResponse);
            expect(property.property.listings[0]).toStrictEqual(item.response!.listing);
            if (item.constituents) {
              expect(
                (
                  await connection.query<{ state: ListingChronologyState }>(
                    'SELECT state FROM properties.listing_current WHERE listing_id=$1',
                    [item.listing_id],
                  )
                )[0]!.state.lifeline,
              ).toStrictEqual(item.constituents);
              expect(property.property.summary.timeOnMarketDays).toBe(item.exposure);
            }
          }
          await connection.query(
            "UPDATE collection.source_register SET listing_text_display_allowed=false WHERE source_id='synthetic-data'",
          );

          for (const [path, parse] of [
            [`listings/${focused!.listing_id}`, parseListingResponse],

            [`properties/${focused!.property_id}`, parsePropertyResponse],
          ] as const) {
            const response = await get(path!, parse);
            expect(
              !/"current"|"versions"|"text"|Owned history journey/.test(JSON.stringify(response)),
            ).toBeTruthy();
            const listing =
              'listing' in response ? response.listing : response.property.listings[0]!;
            expect(listing.description.permission).toBe('denied');
            expect(listing.history).toStrictEqual(focusedResponse.listing.history);
          }
          await expect(
            connection.query(
              'UPDATE properties.listing_acquisition SET observed_at=observed_at WHERE listing_id=$1',
              [focused!.listing_id],
            ),
          ).rejects.toThrow(/immutable/);
          await expect(
            connection.query(
              'UPDATE properties.listing_event SET event=event WHERE listing_id=$1',
              [focused!.listing_id],
            ),
          ).rejects.toThrow(/immutable/);
          await expect(
            connection.query('UPDATE collection.completed_event_evidence SET event=event'),
          ).rejects.toThrow(/immutable/);
          // Source admission is shared by both production entries and canonical selection. An
          // uncommitted running registration cannot be invisible to an advancing selection.
          const admissionSource = absenceSource;
          const admissionOffset = Date.parse('2027-04-10T12:00:00.000Z') - Date.now();
          const admissionClock = {
            now: () => new Date(Date.now() + admissionOffset).toISOString(),
          };
          const admissionResponses: {
            response: ListingResponse;
            listing_id?: string | undefined;
            property_id?: string | undefined;
          }[] = [];
          const makeAdmissionService = (
            Entry: typeof CollectSourceRun | typeof CollectSourceOnce,
            identity: string,
            repository: PostgresCollectionRunRepository,
            entryClock = admissionClock,
            beforeFetch?: () => Promise<void>,
          ) =>
            new Entry!(
              {
                fetchPage: async () => {
                  if (beforeFetch) await beforeFetch();
                  return {
                    documents: [edgeDocument(admissionSource, identity, entryClock.now())],
                    nextCursor: null,
                    exhausted: true,
                  };
                },
                parse: (document: RawListingDocument, cancellation: AbortSignal) =>
                  parser.parse(document, cancellation),
              },
              store,
              new PostgresSourceRegisterRepository(connection),
              repository,
              new PostgresTransactionRunner(connection),
              new PostgresUuidV7Generator(connection),
              entryClock,
              new PostgresOutbox(connection),
            );
          const retainAdmission = async (identity: string, count: number) => {
            await waitFor(
              `${identity} durable acquisitions`,
              async () =>
                (
                  await connection.query<{ count: number }>(
                    "SELECT jsonb_array_length(current.state->'acquisitions') AS count FROM properties.listing_current current JOIN properties.listing listing USING(listing_id) WHERE listing.source_listing_id=$1",
                    [identity],
                  )
                )[0]?.count === count,
            );
            const ids = (
              await connection.query<{ listing_id: string; property_id: string }>(
                'SELECT listing_id::text,property_id::text FROM properties.listing WHERE source_listing_id=$1',
                [identity],
              )
            )[0];
            const response = await get(`listings/${ids!.listing_id}`, parseListingResponse);
            expect(response.listing.collectionCount).toBe(count);
            expect(
              (await get(`properties/${ids!.property_id}`, parsePropertyResponse)).property
                .listings[0],
            ).toStrictEqual(response.listing);
            admissionResponses.push({ ...ids!, response });
          };
          for (const [index, Entry] of [CollectSourceOnce, CollectSourceRun].entries()) {
            const identity = `OWNED-ADMISSION-${index}`;
            const keyA = `owned-admission-A-${index}`;
            let enterRegistration: () => void,
              releaseRegistration,
              enterFetch: () => void,
              releaseFetch;
            const registrationEntered = new Promise<void>((resolve) => {
              enterRegistration = resolve;
            });
            const registrationHeld = new Promise<void>((resolve) => {
              releaseRegistration = resolve;
            });
            const fetchEntered = new Promise<void>((resolve) => {
              enterFetch = resolve;
            });
            const fetchHeld = new Promise<void>((resolve) => {
              releaseFetch = resolve;
            });
            class HeldRegistration extends PostgresCollectionRunRepository {
              override async startOrLoad(transaction: Transaction, input: StartCollectionRunInput) {
                const retained = await super.startOrLoad(transaction, input);
                enterRegistration();
                await registrationHeld;
                return retained;
              }
            }
            const frontier = (
              await connection.query<{ started_at: Date; run_id: string }>(
                'SELECT started_at,run_id::text FROM collection.collection_run WHERE source_id=$1 ORDER BY started_at DESC,run_id DESC LIMIT 1',
                [admissionSource],
              )
            )[0];
            const after = frontier
              ? { startedAt: frontier.started_at.toISOString(), runId: frontier.run_id }
              : null;
            const pendingA = makeAdmissionService(
              Entry,
              identity,
              new HeldRegistration(connection),
              admissionClock,
              async () => {
                enterFetch();
                await fetchHeld;
              },
            ).execute(admissionSource, keyA, null, AbortSignal.timeout(60000));
            await registrationEntered;
            expect(
              (
                await connection.query<{ run_id: string }>(
                  'SELECT run_id FROM collection.collection_run WHERE operation_key=$1',
                  [keyA],
                )
              ).length,
            ).toBe(0);
            let bClockCalls = 0,
              bFetchCalls = 0,
              selectionFinished = false;
            const bClock = {
              now: () => {
                bClockCalls++;
                return admissionClock.now();
              },
            };
            const OtherEntry = Entry === CollectSourceOnce ? CollectSourceRun : CollectSourceOnce;
            const pendingB = makeAdmissionService(
              OtherEntry,
              identity,
              new PostgresCollectionRunRepository(connection),
              bClock,
              async () => {
                bFetchCalls++;
              },
            ).execute(
              admissionSource,
              `owned-admission-B-${index}`,
              null,
              AbortSignal.timeout(60000),
            );
            const selection = new PostgresTransactionRunner(connection).runInTransaction(
              async (transaction) => {
                const result = await new PostgresCollectionFacade(
                  connection,
                  new PostgresSourceRegisterRepository(connection),
                ).nextCompletedRun(transaction, admissionSource, after);
                selectionFinished = true;
                return result;
              },
              signal(),
            );
            await new Promise<void>((resolve) => setTimeout(resolve, 50));
            expect(selectionFinished).toBe(false);
            expect(bClockCalls).toBe(0);
            expect(bFetchCalls).toBe(0);
            await expect(
              new PostgresTransactionRunner(connection).runInTransaction(
                (transaction) =>
                  new PostgresCollectionFacade(
                    connection,
                    new PostgresSourceRegisterRepository(connection),
                  ).nextCompletedRun(transaction, admissionSource, after),
                AbortSignal.timeout(20),
              ),
            ).rejects.toSatisfy((error: { name: string }) => error.name === 'TimeoutError');
            releaseRegistration!();
            await fetchEntered;
            const resultB = await pendingB;
            expect(await selection).toBe(null);
            expect(
              (
                await connection.query<{ run_id: string }>(
                  'SELECT run_id FROM properties.listing_run_effect WHERE run_id=$1',
                  [resultB.runId],
                )
              ).length,
            ).toBe(0);
            releaseFetch!();
            const resultA = await pendingA;
            await waitProgress(admissionSource, resultB);
            const admitted = await connection.query<{
              operation_key: string;
              run_id: string;
              started_at: Date;
            }>(
              'SELECT operation_key,run_id::text,started_at FROM collection.collection_run WHERE operation_key=ANY($1::text[]) ORDER BY started_at,run_id',
              [[keyA, `owned-admission-B-${index}`]],
            );
            expect(admitted.map((row) => row.run_id)).toStrictEqual([resultA.runId, resultB.runId]);
            await retainAdmission(identity, 2);
          }
          // A caller held after a genuine empty lookup must capture its start after B is admitted.
          // The same gate also proves that a same-key completion becomes a successful one-shot replay.
          for (const [index, Entry, sameKey] of [
            [0, CollectSourceOnce, false],
            [1, CollectSourceRun, false],
            [2, CollectSourceOnce, true],
          ] as const) {
            const identity = `OWNED-ADMISSION-LOOKUP-${index}`;
            const keyA = `owned-admission-lookup-A-${index}`;
            const keyB = sameKey ? keyA : `owned-admission-lookup-B-${index}`;
            let enterLookup: () => void, releaseLookup;
            const lookupEntered = new Promise<void>((resolve) => {
              enterLookup = resolve;
            });
            const lookupHeld = new Promise<void>((resolve) => {
              releaseLookup = resolve;
            });
            class HeldLookup extends PostgresCollectionRunRepository {
              override async loadRunByOperationKey(
                key: string | undefined,
                cancellation: AbortSignal | undefined,
              ) {
                const result = await super.loadRunByOperationKey(key!, cancellation);
                enterLookup();
                await lookupHeld;
                return result;
              }
            }
            let aFetchCalls = 0;
            const pendingA = makeAdmissionService(
              Entry,
              identity,
              new HeldLookup(connection),
              admissionClock,
              async () => {
                aFetchCalls++;
              },
            ).execute(admissionSource, keyA, null, AbortSignal.timeout(60000));
            await lookupEntered;
            const resultB = await makeAdmissionService(
              CollectSourceOnce,
              identity,
              new PostgresCollectionRunRepository(connection),
            ).execute(admissionSource, keyB, null, signal());
            await waitProgress(admissionSource, resultB);
            releaseLookup!();
            const resultA = await pendingA;
            if (sameKey) {
              expect(resultA).toStrictEqual({
                ...resultB,
                replayed: true,
              });
              expect(aFetchCalls).toBe(0);
              expect(
                (
                  await connection.query<{ event_id: string }>(
                    'SELECT event_id FROM collection.completed_event_evidence WHERE run_id=$1',
                    [resultA.runId],
                  )
                ).length,
              ).toBe(1);
            } else {
              await waitProgress(admissionSource, resultA);
              const ordered = await connection.query<{ run_id: string }>(
                'SELECT run_id::text FROM collection.collection_run WHERE operation_key=ANY($1::text[]) ORDER BY started_at,run_id',
                [[keyA, keyB]],
              );
              expect(ordered.map((row) => row.run_id)).toStrictEqual([
                resultB.runId,
                resultA.runId,
              ]);
            }
            await retainAdmission(identity, sameKey ? 1 : 2);
          }
          // Force equal start milliseconds and an initially smaller UUID through the actual generator
          // seam. Admission chooses another authentic UUID; dates and completed publications stay intact.
          const tiedIdentity = 'OWNED-ADMISSION-TIED';
          const tiedDate = '2027-04-11T12:00:00.000Z';
          const tiedClock = { now: () => tiedDate };
          const tiedA = await makeAdmissionService(
            CollectSourceRun,
            tiedIdentity,
            new PostgresCollectionRunRepository(connection),
            tiedClock,
          ).execute(admissionSource, 'owned-admission-tied-A', null, signal());
          await waitProgress(admissionSource, tiedA);
          const realIdentifiers = new PostgresUuidV7Generator(connection);
          let generated = 0;
          const tiedB = await new CollectSourceOnce(
            {
              fetchPage: async () => ({
                documents: [edgeDocument(admissionSource, tiedIdentity, tiedDate)],
                nextCursor: null,
                exhausted: true,
              }),
              parse: (document, cancellation: AbortSignal) => parser.parse(document, cancellation),
            },
            store,
            new PostgresSourceRegisterRepository(connection),
            new PostgresCollectionRunRepository(connection),
            new PostgresTransactionRunner(connection),
            {
              generate: async (transaction) =>
                generated++ === 0
                  ? parseUuidV7('00000000-0000-7000-8000-000000000000')
                  : realIdentifiers.generate(transaction),
            },
            tiedClock,
            new PostgresOutbox(connection),
          ).execute(admissionSource, 'owned-admission-tied-B', null, signal());
          expect(tiedB.runId > tiedA.runId).toBeTruthy();
          expect(generated >= 5).toBeTruthy();
          const tiedRuns = await connection.query<{ started_at: Date }>(
            'SELECT started_at FROM collection.collection_run WHERE run_id=ANY($1::uuid[])',
            [[tiedA.runId, tiedB.runId]],
          );
          expect(tiedRuns.every((row) => row.started_at.toISOString() === tiedDate)).toBeTruthy();
          await waitProgress(admissionSource, tiedB);
          await retainAdmission(tiedIdentity, 2);
          // Later completed source runs can legitimately remove earlier scenario listings. Capture
          // the final current state only after all admissions, independently of the old campaign above.
          for (const item of admissionResponses)
            item.response = await get(`listings/${item.listing_id}`, parseListingResponse);
          const admissionEffects = JSON.stringify(
            await connection.query<{
              event: PropertiesEvent<
                | 'properties.listing.created'
                | 'properties.listing.price-changed'
                | 'properties.listing.description-changed'
                | 'properties.listing.removed'
                | 'properties.listing.reappeared'
              >;
            }>('SELECT event FROM properties.listing_event ORDER BY listing_id,revision'),
          );
          const beforeAdmissionReplayRanking = await assertRankings();
          const admissionOriginals = await connection.query<{
            event: CollectionSnapshotParsed | CollectionSnapshotCorrected;
          }>('SELECT event FROM collection.parsed_event_evidence ORDER BY event_id DESC');
          const admissionCompletions = await connection.query<{ event: CollectionRunCompleted }>(
            'SELECT event FROM collection.completed_event_evidence ORDER BY event_id DESC',
          );
          await connection.query(
            "DELETE FROM platform.inbox WHERE consumer_name IN ('properties.parsed-listing','properties.completed-run')",
          );
          await compose('restart', 'worker', 'api');
          await compose('up', '--detach', '--wait', 'worker', 'api');
          for (const row of admissionCompletions)
            await publisher.publish(parseCollectionEvent(row.event), signal());
          for (const row of admissionOriginals)
            await publisher.publish(parseCollectionEvent(row.event), signal());
          await waitFor(
            'admission replay receipt markers',
            async () =>
              (
                await connection.query<{ count: number }>(
                  "SELECT count(*)::integer AS count FROM platform.inbox WHERE consumer_name='properties.parsed-listing'",
                )
              )[0]!.count === admissionOriginals.length,
          );
          expect(
            JSON.stringify(
              await connection.query<{
                event: PropertiesEvent<
                  | 'properties.listing.created'
                  | 'properties.listing.price-changed'
                  | 'properties.listing.description-changed'
                  | 'properties.listing.removed'
                  | 'properties.listing.reappeared'
                >;
              }>('SELECT event FROM properties.listing_event ORDER BY listing_id,revision'),
            ),
          ).toBe(admissionEffects);
          expect(await reductions()).toStrictEqual(beforeAdmissionReplayRanking);
          for (const item of admissionResponses) {
            expect(await get(`listings/${item.listing_id}`, parseListingResponse)).toStrictEqual(
              item.response,
            );
            expect(
              (await get(`properties/${item.property_id}`, parsePropertyResponse)).property
                .listings[0],
            ).toStrictEqual(item.response!.listing);
          }
          // A latest eligible correction changes scope only; immutable price effect remains original.
          const focusedBeforeMove = (await reductions()).items.find(
            (item) => item.propertyId === focused!.property_id,
          );
          const newestFocused = (
            await connection.query<{ snapshot_id: string }>(
              "SELECT snapshot_id::text FROM collection.snapshot_observation WHERE source_listing_id='OWNED-FIVE-TYPES' ORDER BY observed_at DESC,snapshot_id DESC LIMIT 1",
            )
          )[0];
          instant = '2040-01-01T12:00:00.000Z';
          await reparse(
            newestFocused!.snapshot_id,
            'ranking-current-geography',
            400000,
            'Owned moved geography correction.',
            { neighborhood: 'Vila Mariana', street: 'Rua Cen\u00E1rio Um' },
          );
          await waitFor('corrected ranking geography', async () =>
            (await reductions('sao-paulo-vila-mariana')).items.some(
              (item) => item.propertyId === focused!.property_id,
            ),
          );
          const moved = (await reductions()).items.find(
            (item) => item.propertyId === focused!.property_id,
          );
          expect({ ...moved, place: focusedBeforeMove!.place }).toStrictEqual(focusedBeforeMove);
          expect(
            !(await reductions('sao-paulo-bela-vista')).items.some(
              (item) => item.propertyId === focused!.property_id,
            ),
          ).toBeTruthy();
          expect(
            (await reductions()).metadata.asOf < instant,
            'Correction receipt time cannot advance authentic asOf.',
          ).toBeTruthy();
          // Genuine focused acquisitions cover exact percentage ties and canonical equal-date drops
          // amid date regressions, a later increase, an unchanged observation and final removal.
          const rankIdentities = ['OWNED-RANK-TIE-A', 'OWNED-RANK-TIE-B', 'OWNED-RANK-DATED'];
          for (const [index, [day, amount]] of [
            [1, 1000000],
            [9, 500000],
            [12, 450000],
            [10, 400000],
            [12, 380000],
            [13, 800000],
          ].entries()) {
            const documents = rankIdentities.map((identity, position) => ({
              sourceId: 'synthetic-data',
              sourceListingId: identity,
              sourceUrl: `https://synthetic.invalid/listings/${identity.toLowerCase()}`,
              observedAt: `2038-01-${String(position === 2 ? day : index + 1).padStart(
                2,
                '0',
              )}T12:00:00.000Z`,
              mediaType: 'application/json' as const,
              bytes: new TextEncoder().encode(
                JSON.stringify({
                  ...first,
                  askingPriceMinorUnits: position === 2 ? amount : index === 0 ? 1000000 : 800000,
                  imageFingerprints: [`fixture-fingerprint:owned-${identity.toLowerCase()}`],
                }),
              ),
            }));
            await collect(
              'synthetic-data',
              `owned-ranking-${index}`,
              documents,
              `2039-01-0${index + 1}T12:00:00.000Z`,
            );
          }
          await collect('synthetic-data', 'owned-ranking-removal', [], '2039-01-07T12:00:00.000Z');
          await waitFor(
            'genuine ranking scenarios removed',
            async () =>
              (
                await connection.query<{ count: number }>(
                  "SELECT count(*)::integer AS count FROM properties.listing_current current JOIN properties.listing listing USING(listing_id) WHERE listing.source_listing_id=ANY($1::text[]) AND current.state->>'status'='removed'",
                  [rankIdentities],
                )
              )[0]!.count === 3,
          );
          const rankRows = (await reductions()).items.filter(
            (item: { provenance: { sourceListingId: string } }) =>
              rankIdentities.includes(item.provenance.sourceListingId),
          );
          expect(rankRows.length).toBe(3);
          const tied = rankRows.filter(
            (item: { provenance: { sourceListingId: string } }) =>
              item.provenance.sourceListingId !== 'OWNED-RANK-DATED',
          );
          expect(
            tied.every((item: { reductionPercent: number }) => item.reductionPercent === 20),
          ).toBeTruthy();
          expect(tied.map((item) => item.propertyId)).toStrictEqual(
            tied.map((item) => item.propertyId).sort(),
          );
          const dated = rankRows.find(
            (item: { provenance: { sourceListingId: string } }) =>
              item.provenance.sourceListingId === 'OWNED-RANK-DATED',
          );
          expect(dated!.effectiveAt).toBe('2038-01-12T12:00:00.000Z');
          expect(dated!.previousMinorUnits).toBe(400000);
          expect(dated!.currentMinorUnits).toBe(380000);
          expect((await reductions()).metadata.asOf).toBe('2039-01-07T12:00:01.000Z');
          const beforeDatabaseRestart = await assertRankings();
          await compose('stop', 'postgres');
          const failedRead = await requestHttp(
            `http://127.0.0.1:${api}/api/v1/places/sao-paulo/largest-reductions`,
            { signal: signal() },
          );
          expect(failedRead.status).toBe(500);
          const failedBody = (await failedRead.json()) as { error: { requestId: string } };
          expect(failedBody.error.requestId).toBeTruthy();
          expect(!JSON.stringify(failedBody).includes(fixture.password)).toBeTruthy();
          expect(!('items' in failedBody)).toBeTruthy();
          await compose('up', '--detach', '--wait', 'postgres');
          expect(await reductions()).toStrictEqual(beforeDatabaseRestart);
          console.log(
            'Properties history passed: 39 genuine catalog runs, 115 acquisitions, exactly 18 immutable catalog market events, five-type journey, acquisition dates/provenance/revisions/lifelines, historical/current highest-order corrections, correction-first receipt/completion-first missing-original recovery, both-entry transactional admission races, tied starts, authentic one-shot replay, restart/replay and current privacy.',
          );
        } catch (error) {
          await compose('logs', '--no-color', '--tail', '100', 'worker', 'api', 'migrations')
            .then(({ stdout, stderr }) => process.stderr.write(`${stdout}${stderr}`))
            .catch(() => undefined);
          throw error;
        }
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
                await publisher?.close();
              },
              async () => {
                store?.destroy();
              },
              async () => {
                await connection?.close();
              },
              async () => {
                await compose('down', '--volumes', '--remove-orphans');
              },
              async () => {
                for (const [command, format] of [
                  ['ps', '{{.ID}}'],
                  ['volume', '{{.Name}}'],
                ] as const) {
                  const args = command === 'ps' ? ['ps', '--all'] : ['volume', 'ls'];
                  const remaining = await run('docker', [
                    ...args,
                    '--filter',
                    `label=com.docker.compose.project=${project}`,
                    '--format',
                    format!,
                  ]);
                  expect(remaining.stdout.trim(), 'The exact campaign retained resources.').toBe(
                    '',
                  );
                }
              },
              async () => {
                console.log(`Cleaned exact campaign project ${project}.`);
              },
            );
          },
        );
      }
    }
  });
});
