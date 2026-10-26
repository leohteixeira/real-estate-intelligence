import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { execa } from 'execa';
import { expect, test, vi } from 'vitest';
import { chromium, type Browser } from 'playwright';
import { preparedPropertyId } from './support/property-reads.ts';
import type { RawListingDocument } from '../packages/application/dist/index.js';
import {
  CollectSourceRun,
  ReconcilePropertyResolution,
  ConsumeMarketListing,
  ConsumeParsedListing,
  ReconcileListingHistory,
  ReparseSnapshot,
} from '../packages/application/dist/index.js';
import {
  parseListingResponse,
  parsePropertyResponse,
  parseReductionsResponse,
  parseSearchResponse,
} from '../packages/contracts/dist/index.js';
import {
  INITIAL_RESOLUTION_CONFIGURATION,
  parsePropertiesEventV2,
  type PropertiesEvent,
  type PropertiesEventV2,
  type CollectedListing,
  type ListingChronologyState,
} from '../packages/domain/dist/index.js';
import {
  DatabaseConnection,
  PostgresCollectionRunRepository,
  PostgresOutbox,
  PostgresSnapshotLifecycle,
  PostgresSourceRegisterRepository,
  PostgresTransactionRunner,
  PostgresUuidV7Generator,
  RabbitMqEventBroker,
  S3RawSnapshotStore,
  SYNTHETIC_SAO_PAULO_DATASET,
  SyntheticListingSource,
  PostgresPropertyResolutionRepository,
  PostgresMarketPriceFacts,
  PostgresInbox,
  PostgresCollectionFacade,
  PostgresLocationsFacade,
  PostgresPropertyRepository,
  PostgresListingHistoryRepository,
  PostgresListingSuppression,
  PostgresSnapshotReparseRepository,
} from '../packages/infrastructure/dist/index.js';
import { allocatePorts, cleanupAll, preserveCleanup, withCampaign } from './support/fixture.ts';
import { requestHttp } from './support/http.ts';

test('entity resolution preserves genuine acquisition lineage and converges through causal membership', async () => {
  await withCampaign(async ({ command }) => {
    const run = command;
    const project = `rei-property-resolution-${process.pid}-${randomUUID().slice(0, 8)}`;
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
    const [postgres, rabbit, management, minio, minioConsole, api, web, reference] =
      await Promise.all(Array.from({ length: 8 }, reservePort));
    expect(
      new Set([postgres, rabbit, management, minio, minioConsole, api, web, reference]).size,
    ).toBe(8);
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
      WEB_PORT: String(web),
      COMPOSE_PARALLEL_LIMIT: '1',
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
    let browser: Browser | undefined;
    {
      let cleanupPrimary1: unknown;
      let cleanupPrimaryThrown1 = false;
      try {
        try {
          console.log(`Starting isolated property resolution campaign ${project}.`);
          for (const service of ['migrations', 'worker', 'api', 'web'])
            await compose('build', service);
          await compose(
            'up',
            '--detach',
            '--wait',
            'postgres',
            'rabbitmq',
            'minio',
            'migrations',
            'worker',
            'api',
            'web',
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
              undefined,
              new PostgresListingSuppression(connection),
            );
            const result = await service.execute(sourceId, key, null, signal());
            expect(result.status, key).toBe('completed');
            expect(result.observedCount, key).toBe(documents.length);
            expect(result.parsedCount, key).toBe(documents.length);
            expect(result.failedCount, key).toBe(0);
            return result;
          };
          // Normal startup never serves the prepared catalog, even before the first collection.
          const emptySearch = await get('properties', parseSearchResponse);
          expect(emptySearch).toMatchObject({
            metadata: { fixtureVersion: 'persisted-synthetic-search-v1' },
            items: [],
            totalItems: 0,
            medianPricePerSquareMeter: null,
            nextCursor: null,
          });
          const baseline = SYNTHETIC_SAO_PAULO_DATASET.runs[0]!;
          const collectCycle = async (cycle: (typeof SYNTHETIC_SAO_PAULO_DATASET.runs)[number]) => {
            for (const [index, source] of SYNTHETIC_SAO_PAULO_DATASET.sources.entries()) {
              await collect(
                source.sourceId,
                `resolution-${cycle.runKey}-${source.sourceId}`,
                cycle.observations
                  .filter((item) => item.sourceId === source.sourceId)
                  .map((item) => ({
                    ...item,
                    mediaType: 'application/json' as const,
                    bytes: new TextEncoder().encode(JSON.stringify(item.listing)),
                  })),
                cycle.observedAt,
                (index + 1) * 1000,
              );
            }
          };
          await collectCycle(baseline);
          await waitFor('five current properties with all nine members', async () => {
            const rows = await connection.query<{ size: number }>(
              'SELECT count(*)::integer AS size FROM properties.listing_assignment GROUP BY property_id ORDER BY count(*) DESC',
            );
            return JSON.stringify(rows.map((row) => row.size)) === JSON.stringify([3, 2, 2, 1, 1]);
          });
          const identities = await connection.query<{
            listing_id: string;
            property_id: string;
            source_listing_id: string;
          }>(
            'SELECT listing_id::text,property_id::text,source_listing_id FROM properties.listing ORDER BY source_id,source_listing_id',
          );
          const immutable = await connection.query<{ listing_id: string; property_id: string }>(
            'SELECT listing_id::text,property_id::text FROM properties.listing ORDER BY listing_id',
          );
          for (const identity of identities) {
            const listing = (await get(`listings/${identity.listing_id}`, parseListingResponse))
              .listing;
            const detail = (await get(`properties/${identity.property_id}`, parsePropertyResponse))
              .property;
            expect(detail.listings.find((member) => member.id === identity.listing_id)).toEqual(
              listing,
            );
            expect(detail.preparedEvidence.kind).toBe('deterministic-rule');
            expect(detail.summary.activeListingCount).toBe(
              detail.listings.filter((member) => member.status === 'active').length,
            );
            if (identity.source_listing_id === 'COB-BV-001') {
              expect(listing.publishedNeighborhood).toBe('Vila Mariana');
              expect(detail.listings).toHaveLength(3);
              expect(
                detail.sourceAgreement.find((row) => row.field === 'neighborhood')?.agrees,
              ).toBe(false);
            }
          }
          const baselineSearch = await get('properties', parseSearchResponse);
          expect(baselineSearch.totalItems).toBe(5);
          expect(new Set(baselineSearch.items.map((item) => item.id)).size).toBe(5);
          const currentSearch = async () => get('properties', parseSearchResponse);
          const assertSearchAgreesWithDetail = async (expectedCount: number) => {
            const response = await currentSearch();
            expect(response.totalItems).toBe(expectedCount);
            expect(response.items).toHaveLength(expectedCount);
            for (const item of response.items) {
              const detail = (await get(`properties/${item.id}`, parsePropertyResponse)).property;
              expect(item).toEqual({
                ...detail.summary,
                belowMedianPercent: item.belowMedianPercent,
              });
              expect(item.neighborhoodComparison).toBeNull();
            }
            return response;
          };
          await assertSearchAgreesWithDetail(5);
          const browserEnvironment = { ...process.env };
          delete browserEnvironment.DISPLAY;
          browser = await chromium.launch({
            executablePath: chromium.executablePath(),
            chromiumSandbox: true,
            env: browserEnvironment,
            args: [
              '--ozone-platform=headless',
              '--disable-vulkan-surface',
              '--use-gl=angle',
              '--use-angle=swiftshader-webgl',
            ],
            ignoreDefaultArgs: ['--enable-unsafe-swiftshader'],
          });
          const groupedId = (
            await get(
              `properties/${identities.find((item) => item.source_listing_id === 'AUR-BV-001')!.property_id}`,
              parsePropertyResponse,
            )
          ).property.summary.id;
          const captures = new URL(
            `../apps/web/.impeccable/review/runtime/${project}/`,
            import.meta.url,
          );
          await mkdir(captures, { recursive: true });
          for (const width of [390, 1440])
            for (const locale of ['pt-BR', 'en'] as const) {
              const context = await browser.newContext({
                viewport: { width, height: width === 390 ? 1842 : 1207 },
                reducedMotion: 'reduce',
              });
              try {
                await context.addInitScript(
                  (language) => localStorage.setItem('rei.locale', language),
                  locale,
                );
                await context.route('**/*', async (route) => {
                  const url = new URL(route.request().url());
                  if (
                    url.origin !== `http://127.0.0.1:${web}` ||
                    (url.pathname.startsWith('/api/') && route.request().method() !== 'GET')
                  )
                    throw new Error('Property journey attempted an external or mutating request.');
                  await route.continue();
                });
                const page = await context.newPage();
                const pageErrors: string[] = [];
                page.on('pageerror', (error) => pageErrors.push(error.message));
                const detailRead = page.waitForResponse(
                  (response) =>
                    new URL(response.url()).pathname === `/api/v1/properties/${groupedId}`,
                );
                await page.goto(`http://127.0.0.1:${web}/properties/${groupedId}`);
                const loadedDetail = await detailRead;
                expect(loadedDetail.status()).toBe(200);
                await loadedDetail.finished();
                try {
                  await expect.poll(() => page.locator('.property-source').count()).toBe(3);
                  expect(pageErrors).toEqual([]);
                } catch (error) {
                  await page.screenshot({
                    path: new URL(`failed-real-${width}-${locale}.png`, captures).pathname,
                    fullPage: true,
                  });
                  console.error(
                    JSON.stringify({
                      width,
                      locale,
                      url: page.url(),
                      status: loadedDetail.status(),
                      pageErrors,
                      body: (await page.locator('body').innerText()).slice(0, 4000),
                    }),
                  );
                  throw error;
                }
                const evidence = page.locator('.property-evidence');
                expect(await evidence.textContent()).toContain(
                  locale === 'en' ? 'not statistically calibrated' : 'sem calibração estatística',
                );
                expect(await evidence.locator('.property-probability').textContent()).toContain(
                  locale === 'en' ? 'Match rule score' : 'Pontuação de correspondência',
                );
                expect(await evidence.textContent()).toContain(
                  locale === 'en' ? 'Rule evidence label' : 'Rótulo da evidência de regras',
                );
                expect(await evidence.textContent()).not.toContain(
                  locale === 'en'
                    ? 'Received prepared-evidence label'
                    : 'Rótulo recebido da evidência preparada',
                );
                const summary = evidence.locator('summary');
                await summary.focus();
                await page.keyboard.press('Enter');
                expect(await evidence.locator('details').getAttribute('open')).not.toBeNull();
                for (const member of (await get(`properties/${groupedId}`, parsePropertyResponse))
                  .property.listings)
                  expect(await page.locator(`#property-listing-${member.id}`).count()).toBe(1);
                expect(
                  await page.evaluate(
                    () => document.documentElement.scrollWidth <= window.innerWidth,
                  ),
                ).toBe(true);
                await page.evaluate(() => document.fonts.ready);
                await page.screenshot({
                  path: new URL(`real-${width}-${locale}.png`, captures).pathname,
                  fullPage: true,
                });
                await page.goto(`http://127.0.0.1:${web}/properties/${preparedPropertyId(1)}`);
                await expect.poll(() => page.locator('.property-source').count()).toBe(3);
                expect(await page.locator('.property-evidence').textContent()).toContain(
                  locale === 'en' ? 'Prepared example' : 'Exemplo preparado',
                );
                expect(
                  await page.evaluate(
                    () => document.documentElement.scrollWidth <= window.innerWidth,
                  ),
                ).toBe(true);
                await page.evaluate(() => document.fonts.ready);
                await page.screenshot({
                  path: new URL(`prepared-${width}-${locale}.png`, captures).pathname,
                  fullPage: true,
                });
              } finally {
                await context.close();
              }
            }
          // Reuse only the fixed authored reference entries; no additional product scenario.
          const referenceBrowser = browser;
          const referenceBase = `http://127.0.0.1:${reference}`;
          const referenceServer = execa(
            'pnpm',
            [
              '--filter',
              '@rei/web',
              'exec',
              'vite',
              '--host',
              '127.0.0.1',
              '--port',
              String(reference),
              '--strictPort',
            ],
            { cwd: new URL('..', import.meta.url), reject: false },
          );
          await preserveCleanup(
            async () => {
              await waitFor(
                'fixed artboard reference server',
                async () => {
                  try {
                    return (
                      (
                        await requestHttp(
                          `${referenceBase}/test-fixtures/artboards/Property.dc.html`,
                          { signal: signal() },
                        )
                      ).status === 200
                    );
                  } catch {
                    return false;
                  }
                },
                30000,
              );
              for (const [file, width, height] of [
                ['Property.dc.html', 390, 1842],
                ['DesktopProperty.dc.html', 1440, 1207],
              ] as const) {
                const context = await referenceBrowser.newContext({
                  viewport: { width, height },
                  reducedMotion: 'reduce',
                });
                try {
                  const external: string[] = [];
                  await context.route('**/*', async (route) => {
                    if (new URL(route.request().url()).origin !== referenceBase) {
                      external.push(route.request().url());
                      await route.abort();
                    } else await route.continue();
                  });
                  const page = await context.newPage();
                  await page.goto(`${referenceBase}/test-fixtures/artboards/${file}`);
                  await page.evaluate(() => document.fonts.ready);
                  await page.screenshot({
                    path: new URL(`reference-${width}.png`, captures).pathname,
                    fullPage: false,
                  });
                  expect(external).toEqual([]);
                  await writeFile(
                    new URL(`reference-${width}.json`, captures),
                    JSON.stringify(
                      {
                        file,
                        width,
                        height,
                        sourceHash: createHash('sha256')
                          .update(
                            await readFile(
                              new URL(`../docs/design/canvas/project/${file}`, import.meta.url),
                            ),
                          )
                          .digest('hex'),
                      },
                      null,
                      2,
                    ),
                  );
                } finally {
                  await context.close();
                }
              }
            },
            async () => {
              referenceServer.kill('SIGTERM');
              await referenceServer;
            },
          );
          console.log(`Captured affected Property surfaces at ${captures.pathname}.`);
          await browser.close();
          browser = undefined;
          const comparisonRows = await connection.query<{
            evidence: {
              probability: number;
              rawProbability: number;
              decision: string;
              incompatibilities: string[];
            };
            safe: string;
          }>('SELECT evidence,evidence::text AS safe FROM properties.match_comparison');
          expect(comparisonRows).toHaveLength(36);
          expect(
            comparisonRows.filter((row) => row.evidence.decision === 'automatic'),
          ).toHaveLength(5);
          expect(
            comparisonRows.every(
              (row) =>
                !row.safe.includes('maskedDescription') && !row.safe.includes('imageFingerprints'),
            ),
          ).toBe(true);
          const generic = await connection.query<{
            evidence: { probability: number; incompatibilities: string[] };
          }>(
            `SELECT comparison.evidence FROM properties.match_comparison comparison JOIN properties.listing left_listing ON left_listing.listing_id=comparison.left_listing_id JOIN properties.listing right_listing ON right_listing.listing_id=comparison.right_listing_id WHERE (left_listing.source_listing_id='AUR-BV-001' AND right_listing.source_listing_id='AUR-PN-001') OR (right_listing.source_listing_id='AUR-BV-001' AND left_listing.source_listing_id='AUR-PN-001')`,
          );
          expect(generic[0]!.evidence.probability).toBe(0);
          expect(generic[0]!.evidence.incompatibilities).toContain('street');
          const transactions = new PostgresTransactionRunner(connection),
            outbox = new PostgresOutbox(connection),
            identifiers = new PostgresUuidV7Generator(connection);
          const resolver = () =>
            new ReconcilePropertyResolution(
              new PostgresPropertyResolutionRepository(connection, outbox, identifiers),
              transactions,
            );
          await compose('stop', 'worker');
          expect(await resolver().execute(signal())).toBe(0);
          await Promise.all([resolver().execute(signal()), resolver().execute(signal())]);
          expect(await resolver().execute(signal())).toBe(0);
          // Executed configuration, including a lower version under another identity, is authoritative.
          for (const configuration of [
            { ...INITIAL_RESOLUTION_CONFIGURATION, id: 'owned-config-a', version: 2 },
            { ...INITIAL_RESOLUTION_CONFIGURATION, id: 'owned-config-b', version: 1 },
          ]) {
            const configured = new ReconcilePropertyResolution(
              new PostgresPropertyResolutionRepository(connection, outbox, identifiers),
              transactions,
              configuration,
            );
            expect(await configured.execute(signal())).toBe(0);
            expect(await configured.execute(signal())).toBe(0);
            for (const identity of identities) {
              const evidence = (
                await get(`properties/${identity.property_id}`, parsePropertyResponse)
              ).property.preparedEvidence;
              expect(evidence.kind).toBe('deterministic-rule');
              if (evidence.kind !== 'deterministic-rule')
                throw new Error('Expected actual rule evidence.');
              expect(evidence.configurationId).toBe(configuration.id);
              expect(evidence.configurationVersion).toBe(configuration.version);
            }
          }
          expect(await resolver().execute(signal())).toBe(0);
          await compose('up', '--detach', '--wait', 'worker');
          for (const cycle of SYNTHETIC_SAO_PAULO_DATASET.runs.slice(1)) await collectCycle(cycle);
          await waitFor('all 115 acquisitions and 18 immutable listing facts', async () => {
            const acquisitions = await connection.query<{ count: number }>(
              'SELECT count(*)::integer AS count FROM properties.listing_acquisition',
            );
            const events = await connection.query<{ count: number }>(
              'SELECT count(*)::integer AS count FROM properties.listing_event',
            );
            return acquisitions[0]?.count === 115 && events[0]?.count === 18;
          });
          await waitFor('resolution consumes genuine latest revisions', async () => {
            const rows = await connection.query<{ count: number }>(
              'SELECT count(*)::integer AS count FROM properties.listing_assignment assignment JOIN properties.listing_current current ON current.listing_id=assignment.listing_id WHERE assignment.processed_revision<>current.revision',
            );
            return rows[0]?.count === 0;
          });
          expect(
            await connection.query(
              'SELECT listing_id::text,property_id::text FROM properties.listing ORDER BY listing_id',
            ),
          ).toEqual(immutable);
          const listingBytes = await connection.query<{ event_id: string; event: PropertiesEvent }>(
            'SELECT event_id::text,event FROM properties.listing_event ORDER BY event_id',
          );
          await compose('stop', 'worker');
          const onlineReductions = await get(
            'places/brazil/largest-reductions',
            parseReductionsResponse,
          );
          const searchDigest = async () => {
            const tables = await connection.query<{ tablename: string }>(
              "SELECT tablename FROM pg_tables WHERE schemaname='properties' ORDER BY tablename",
            );
            const digests = [];
            for (const { tablename } of tables) {
              if (!/^[a-z_]+$/.test(tablename))
                throw new Error('Unexpected owned Properties table.');
              digests.push([
                tablename,
                await connection.query(
                  `SELECT md5(COALESCE(jsonb_agg(to_jsonb(row) ORDER BY to_jsonb(row)::text)::text,'')) AS digest FROM properties.${tablename} row`,
                ),
              ]);
            }
            return digests;
          };
          const beforeSearch = await searchDigest();
          const catalog = await assertSearchAgreesWithDetail(5);
          const propertyIdFor = (...members: string[]) =>
            identities
              .filter((item) => members.includes(item.source_listing_id))
              .map((item) => item.property_id)
              .sort()[0]!;
          const bv = propertyIdFor('AUR-BV-001', 'BRI-BV-001', 'COB-BV-001');
          const sn = propertyIdFor('AUR-SN-001', 'BRI-SN-001');
          const vm = propertyIdFor('BRI-VM-001', 'COB-VM-001');
          const tt = propertyIdFor('COB-TT-001');
          const pn = propertyIdFor('AUR-PN-001');
          const detail = (await get(`properties/${bv}`, parsePropertyResponse)).property;
          expect(detail.listings.map((listing) => listing.source.sourceListingId)).toEqual([
            'AUR-BV-001',
            'BRI-BV-001',
            'COB-BV-001',
          ]);
          const minimum = detail.listings[0]!;
          expect(detail.listings.every((listing) => listing.status === 'active')).toBe(true);
          expect(detail.summary.askingPrice).toEqual({
            minorUnits: 78000000,
            currency: 'BRL',
            listingId: minimum.id,
            provenance: minimum.provenance,
          });
          expect(minimum.provenance).toMatchObject({
            sourceId: 'synthetic-portal-aurora',
            sourceListingId: 'AUR-BV-001',
            sourceUrl: 'https://aurora.synthetic.invalid/listings/AUR-BV-001',
            observedAt: '2026-10-01T12:00:00.000Z',
          });
          expect(detail.sale).toEqual({ status: 'not-recorded' });
          expect(detail.summary.timeOnMarketDays).toBe(365);
          expect(detail.priceChanges).toMatchObject([
            {
              effectiveAt: '2026-01-01T12:00:00.000Z',
              previousMinorUnits: 82000000,
              currentMinorUnits: 80000000,
              provenance: { sourceListingId: 'AUR-BV-001' },
            },
            {
              effectiveAt: '2026-07-01T12:00:00.000Z',
              previousMinorUnits: 80000000,
              currentMinorUnits: 78000000,
              provenance: { sourceListingId: 'AUR-BV-001' },
            },
          ]);
          expect(detail.priceChanges[0]!.changePercent).toBeCloseTo(-2.4390243902439024);
          expect(detail.priceChanges[1]!.changePercent).toBe(-2.5);
          expect(
            detail.sourceAgreement.map(({ field, agrees, values }) => ({
              field,
              agrees,
              values: values.map((value) => value.value),
            })),
          ).toEqual([
            {
              field: 'propertyType',
              agrees: true,
              values: ['apartment', 'apartment', 'apartment'],
            },
            { field: 'areaSquareMeters', agrees: true, values: [82, 82, 82] },
            { field: 'bedrooms', agrees: true, values: [2, 2, 2] },
            { field: 'bathrooms', agrees: true, values: [2, 2, 2] },
            { field: 'parkingSpaces', agrees: true, values: [1, 1, 1] },
            {
              field: 'neighborhood',
              agrees: false,
              values: ['Bela Vista', 'Bela Vista', 'Vila Mariana'],
            },
          ]);
          for (const agreement of detail.sourceAgreement)
            expect(
              agreement.values.map(({ listingId, sourceId }) => ({ listingId, sourceId })),
            ).toEqual(
              detail.listings.map((listing) => ({
                listingId: listing.id,
                sourceId: listing.source.sourceId,
              })),
            );
          expect(detail.featureAgreement).toEqual(
            ['balcony', 'elevator'].map((feature) => ({
              feature,
              reportingCount: 3,
              reportingPercent: 100,
              listingIds: detail.listings.map((listing) => listing.id),
              sourceIds: detail.listings.map((listing) => listing.source.sourceId),
            })),
          );
          expect(detail.preparedEvidence).toMatchObject({
            kind: 'deterministic-rule',
            probabilityBasis: 'deterministic-uncalibrated',
            listingIds: detail.listings.map((listing) => listing.id),
            configurationId: INITIAL_RESOLUTION_CONFIGURATION.id,
            configurationVersion: INITIAL_RESOLUTION_CONFIGURATION.version,
          });
          expect(detail.preparedEvidence.productionMatchScore).toBeGreaterThanOrEqual(0.9);
          expect(detail.preparedEvidence.reasons).toHaveLength(15);
          expect(detail.preparedEvidence.reasons).toEqual(
            expect.arrayContaining([
              expect.objectContaining({
                type: 'rule-comparison',
                feature: 'images',
                available: true,
                score: 1,
              }),
              expect.objectContaining({
                type: 'rule-comparison',
                feature: 'coordinates',
                available: false,
                score: null,
              }),
            ]),
          );
          const priceOrder = [sn, vm, bv, tt, pn];
          expect(catalog.items.map((item) => item.id)).toEqual(priceOrder);
          expect(catalog.items.map((item) => item.pricePerSquareMeter)).toEqual([
            885135, 918519, 951220, 958333, 993902,
          ]);
          expect(catalog.items.map((item) => item.askingPrice!.minorUnits)).toEqual([
            65500000, 124000000, 78000000, 92000000, 81500000,
          ]);
          expect(catalog.items.map((item) => item.timeOnMarketDays)).toEqual([
            365, 365, 365, 365, 365,
          ]);
          expect(catalog.medianPricePerSquareMeter).toBe(951220);
          expect(catalog.metadata.asOf).toBe('2026-10-01T12:00:00.000Z');
          expect(catalog.items.map((item) => item.belowMedianPercent)).toEqual([
            (66085 / 951220) * 100,
            (32701 / 951220) * 100,
            0,
            (-7113 / 951220) * 100,
            (-42682 / 951220) * 100,
          ]);
          const searchQueries: readonly [string, readonly string[], number | null][] = [
            ['propertyType=house', [vm], 918519],
            ['minAskingPrice=78000000&maxAskingPrice=78000000', [bv], 951220],
            ['minPricePerSquareMeter=951220&maxPricePerSquareMeter=951220', [bv], 951220],
            ['minArea=82&maxArea=82', [bv, pn], 972561],
            ['minBedrooms=3', [sn, vm, tt], 918519],
            ['minBathrooms=3', [vm], 918519],
            ['minParkingSpaces=2', [vm, tt], 938426],
            ['timeOnMarket=up-to-30', [], null],
            ['timeOnMarket=31-to-90', [], null],
            ['timeOnMarket=over-90', priceOrder, 951220],
            ['timeOnMarket=over-180', priceOrder, 951220],
            ['priceReduced=true', [sn, vm, bv, tt], 934870],
            ['priceReduced=false', [pn], 993902],
            ['returnedToMarket=true', [vm], 918519],
            ['returnedToMarket=false', [sn, bv, tt, pn], 954777],
            ['multipleListings=true', [sn, vm, bv], 918519],
            ['multipleListings=false', [tt, pn], 976118],
            ['returnedToMarket=true&priceReduced=false&multipleListings=true', [], null],
            [
              'minArea=82&maxArea=82&minBedrooms=2&minBathrooms=2&minParkingSpaces=1&priceReduced=false&returnedToMarket=false&multipleListings=false',
              [pn],
              993902,
            ],
            ['maxAskingPrice=1', [], null],
            ['placeId=unknown-place', [], null],
            ['placeId=sao-paulo-bela-vista-avenida-exemplo-fictional-block', [], null],
          ];
          for (const [query, ids, median] of searchQueries) {
            const response = await get(`properties?${query}`, parseSearchResponse);
            expect(
              response.items.map((item) => item.id),
              query,
            ).toEqual(ids);
            expect(response.totalItems, query).toBe(ids.length);
            expect(response.medianPricePerSquareMeter, query).toBe(median);
          }
          for (const [scope, ids] of [
            ['brazil', priceOrder],
            ['sao-paulo-state', priceOrder],
            ['sao-paulo', priceOrder],
            ['sao-paulo-centro', [bv]],
            ['sao-paulo-bela-vista', [bv]],
            ['sao-paulo-bela-vista-fictional-block', [bv]],
          ] as const) {
            const response = await get(`properties?placeId=${scope}`, parseSearchResponse);
            expect(response.items.map((item) => item.id)).toEqual(ids);
            expect(response.placeCounts.find((item) => item.placeId === scope)!.totalItems).toBe(
              ids.length,
            );
          }
          const filteredCounts = await get('properties?priceReduced=false', parseSearchResponse);
          expect(
            filteredCounts.placeCounts.find((item) => item.placeId === 'sao-paulo')!.totalItems,
          ).toBe(1);
          expect(
            filteredCounts.placeCounts.find((item) => item.placeId === 'sao-paulo-centro')!
              .totalItems,
          ).toBe(0);
          for (const [sort, ids] of [
            ['furthest-below-median', priceOrder],
            ['lowest-price-per-square-meter', priceOrder],
            ['longest-on-market', [...priceOrder].sort()],
            ['most-recent', [...priceOrder].sort()],
          ] as const) {
            expect(
              (await get(`properties?sort=${sort}`, parseSearchResponse)).items.map(
                (item) => item.id,
              ),
            ).toEqual(ids);
            const seen = [];
            let cursor: string | null = null;
            do {
              const page: ReturnType<typeof parseSearchResponse> = await get(
                `properties?sort=${sort}&pageSize=2${cursor ? `&cursor=${cursor}` : ''}`,
                parseSearchResponse,
              );
              expect(page.totalItems).toBe(5);
              expect(page.medianPricePerSquareMeter).toBe(951220);
              seen.push(...page.items.map((item) => item.id));
              cursor = page.nextCursor;
            } while (cursor);
            expect(seen).toEqual(ids);
          }
          const firstPage = await get('properties?pageSize=1', parseSearchResponse);
          const normalizedPage = await get(
            `properties?sort=furthest-below-median&placeId=sao-paulo&pageSize=1&cursor=${firstPage.nextCursor}`,
            parseSearchResponse,
          );
          expect(normalizedPage.items[0]!.id).toBe(vm);
          for (const query of [
            'cursor=bad',
            'placeId=BAD',
            'minArea=2&maxArea=1',
            `pageSize=1&priceReduced=false&cursor=${firstPage.nextCursor}`,
            `pageSize=1&sort=most-recent&cursor=${firstPage.nextCursor}`,
          ]) {
            const response = await requestHttp(
              `http://127.0.0.1:${api}/api/v1/properties?${query}`,
            );
            expect(response.status).toBe(400);
            expect(JSON.stringify(await response.json())).not.toMatch(
              /stack|password|Invalid read query/,
            );
          }
          expect(await searchDigest()).toEqual(beforeSearch);
          // Fixed catalog oracle: original listing prices alone would incorrectly use 68m in Santana.
          const catalogDrops = [
            {
              members: ['COB-TT-001'],
              source: 'COB-TT-001',
              previous: 95000000,
              current: 92000000,
              at: '2026-09-01T12:00:00.000Z',
            },
            {
              members: ['AUR-BV-001', 'BRI-BV-001', 'COB-BV-001'],
              source: 'AUR-BV-001',
              previous: 80000000,
              current: 78000000,
              at: '2026-07-01T12:00:00.000Z',
            },
            {
              members: ['AUR-SN-001', 'BRI-SN-001'],
              source: 'BRI-SN-001',
              previous: 67000000,
              current: 65500000,
              at: '2026-02-01T12:00:00.000Z',
            },
            {
              members: ['BRI-VM-001', 'COB-VM-001'],
              source: 'COB-VM-001',
              previous: 126000000,
              current: 124000000,
              at: '2026-06-01T12:00:00.000Z',
            },
          ];
          expect(onlineReductions.totalItems, JSON.stringify(onlineReductions.items)).toBe(4);
          expect(onlineReductions.metadata.asOf).toBe('2026-10-01T12:00:00.000Z');
          for (const [index, expected] of catalogDrops.entries()) {
            const actual = onlineReductions.items[index]!;
            const cause = listingBytes.find(
              ({ event }) =>
                'listing' in event.payload &&
                event.payload.listing.sourceListingId === expected.source &&
                event.payload.effectiveAt === expected.at,
            )!.event;
            if (!('listing' in cause.payload)) throw new Error('Expected authentic listing cause.');
            expect(actual).toMatchObject({
              propertyId: identities
                .filter((item) => expected.members.includes(item.source_listing_id))
                .map((item) => item.property_id)
                .sort()[0],
              listingId: identities.find((item) => item.source_listing_id === expected.source)!
                .listing_id,
              effectiveAt: expected.at,
              previousMinorUnits: expected.previous,
              currentMinorUnits: expected.current,
              reductionPercent: ((expected.previous - expected.current) / expected.previous) * 100,
              provenance: cause.payload.listing.provenance,
            });
          }
          console.log(
            `Verified independent catalog minimum oracle: ${JSON.stringify(onlineReductions.items.map(({ listingId, previousMinorUnits, currentMinorUnits, effectiveAt }) => ({ listingId, previousMinorUnits, currentMinorUnits, effectiveAt })))}`,
          );
          // Recreate only1004-derived state to prove delayed first resolution preserves D037.
          await connection.query(
            'TRUNCATE properties.listing_assignment,properties.match_comparison,properties.resolution_configuration,properties.resolution_property_state,properties.property_minimum_effect',
          );
          await connection.query(
            "DELETE FROM platform.outbox WHERE event_type LIKE 'properties.property.%' OR event_type='properties.match.queued-for-review'",
          );
          const unassigned = await currentSearch();
          expect(unassigned.totalItems).toBe(9);
          expect(unassigned.items.map((item) => item.id).sort()).toEqual(
            identities.map((item) => item.property_id).sort(),
          );
          await resolver().execute(signal());
          expect(await currentSearch()).toEqual(catalog);
          expect(await get('places/brazil/largest-reductions', parseReductionsResponse)).toEqual(
            onlineReductions,
          );
          expect(
            (
              await connection.query<{ count: number }>(
                "SELECT count(*)::integer AS count FROM platform.outbox WHERE event_type='properties.property.asking-price-changed'",
              )
            )[0]!.count,
          ).toBe(0);
          expect(
            (
              await connection.query<{ count: number }>(
                'SELECT count(*)::integer AS count FROM properties.property_minimum_effect WHERE publication_event_id IS NULL',
              )
            )[0]!.count,
          ).toBeGreaterThan(0);
          expect(
            await connection.query(
              'SELECT event_id::text,event FROM properties.listing_event ORDER BY event_id',
            ),
          ).toEqual(listingBytes);
          const propertyEvents = await connection.query<{ event: PropertiesEventV2 }>(
            `SELECT jsonb_build_object('eventId',event_id,'type',event_type,'version',event_version,'aggregateId',aggregate_id,'occurredAt',to_char(occurred_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'traceContext',trace_context,'payload',payload) AS event FROM platform.outbox WHERE event_type LIKE 'properties.property.%' ORDER BY occurred_at,event_id`,
          );
          for (const { event } of propertyEvents)
            expect(parsePropertiesEventV2(event)).toEqual(event);
          await compose('stop', 'worker');
          expect(await resolver().execute(signal())).toBe(0);
          // The immutable acquisition lineage survives even a refused transaction.
          await expect(
            transactions.runInTransaction(async (transaction) => {
              const repository = new PostgresPropertyResolutionRepository(
                connection,
                outbox,
                identifiers,
              );
              const inputs = await repository.load(transaction, 200);
              expect(inputs).toHaveLength(9);
              throw new Error('owned rollback');
            }, signal()),
          ).rejects.toThrow('owned rollback');
          expect(
            await connection.query(
              'SELECT listing_id::text,property_id::text FROM properties.listing ORDER BY listing_id',
            ),
          ).toEqual(immutable);
          expect(
            await connection.query(
              'SELECT event_id::text,event FROM properties.listing_event ORDER BY event_id',
            ),
          ).toEqual(listingBytes);
          const reductions = await get('places/brazil/largest-reductions', parseReductionsResponse);
          expect(new Set(reductions.items.map((item) => item.propertyId)).size).toBe(
            reductions.items.length,
          );
          // Rebuild only the owned Market projection from genuine reverse-first events.
          await connection.query(
            'TRUNCATE market.listing_price_current,market.listing_price_evidence,market.price_event_evidence,market.listing_price_identity,market.listing_state_evidence,market.listing_state_current,market.listing_assignment_evidence,market.listing_assignment_current,market.property_price_current',
          );
          await connection.query(
            "DELETE FROM platform.inbox WHERE consumer_name='market.listing-price-facts'",
          );
          // Replay true v1 listing facts after higher assignment revisions and in reverse order.
          const market = new ConsumeMarketListing(
            new PostgresMarketPriceFacts(connection),
            transactions,
            new PostgresInbox(connection),
          );
          for (const { event } of [...propertyEvents].reverse())
            await market.execute(event, signal());
          for (const { event } of [...listingBytes].reverse())
            await market.execute(event, signal());
          for (const { event } of listingBytes) await market.execute(event, signal());
          expect(await resolver().execute(signal())).toBe(0);
          const expectedMarket = await connection.query(
            'SELECT listing_id::text,property_id::text,assignment_revision::text AS revision FROM properties.listing_assignment ORDER BY listing_id',
          );
          expect(
            await connection.query(
              'SELECT listing_id::text,property_id::text,revision::text FROM market.listing_assignment_current ORDER BY listing_id',
            ),
          ).toEqual(expectedMarket);
          expect(
            await connection.query(
              'SELECT listing_id::text,revision::text FROM market.listing_state_current ORDER BY listing_id',
            ),
          ).toEqual(
            await connection.query(
              'SELECT listing_id::text,revision::text FROM properties.listing_current ORDER BY listing_id',
            ),
          );
          // A fresh genuine acquisition keeps the snapshot available for owned parser corrections.
          await compose('up', '--detach', '--wait', 'worker');
          const sourceId = 'synthetic-portal-aurora';
          const freshAt = '2027-01-01T12:00:00.000Z';
          const fresh = SYNTHETIC_SAO_PAULO_DATASET.runs
            .at(-1)!
            .observations.filter((item) => item.sourceId === sourceId);
          await collect(
            sourceId,
            'resolution-fresh-correction',
            fresh.map((item) => ({
              ...item,
              observedAt: freshAt,
              mediaType: 'application/json' as const,
              bytes: new TextEncoder().encode(JSON.stringify(item.listing)),
            })),
            freshAt,
          );
          const target = identities.find((item) => item.source_listing_id === 'AUR-BV-001')!;
          await waitFor(
            'fresh acquisition before owned correction',
            async () =>
              (
                await connection.query<{ state: ListingChronologyState }>(
                  'SELECT state FROM properties.listing_current WHERE listing_id=$1',
                  [target.listing_id],
                )
              )[0]!.state.acquisitions.at(-1)!.original.payload.source.observedAt === freshAt,
          );
          await compose('stop', 'worker');
          await resolver().execute(signal());
          const collection = new PostgresCollectionFacade(
            connection,
            new PostgresSourceRegisterRepository(connection),
          );
          const locations = new PostgresLocationsFacade(connection);
          const properties = new PostgresPropertyRepository(connection);
          const historyRepository = new PostgresListingHistoryRepository(connection);
          const history = new ReconcileListingHistory(
            collection,
            locations,
            properties,
            historyRepository,
            transactions,
            outbox,
            identifiers,
            (text) => `sha256:${createHash('sha256').update(text).digest('hex')}`,
            outbox,
          );
          const consumer = new ConsumeParsedListing(
            collection,
            locations,
            properties,
            transactions,
            new PostgresInbox(connection),
            historyRepository,
          );
          const correct = async (key: string, changes: Partial<CollectedListing>) => {
            const snapshot = (
              await connection.query<{ state: ListingChronologyState }>(
                'SELECT state FROM properties.listing_current WHERE listing_id=$1',
                [target.listing_id],
              )
            )[0]!.state.acquisitions.at(-1)!.original.payload.snapshot.snapshotId;
            const produced = await new ReparseSnapshot(
              {
                parse: async (document, cancellation) => ({
                  ...(await parser.parse(document, cancellation)),
                  ...changes,
                }),
              },
              store,
              new PostgresSnapshotReparseRepository(connection),
              transactions,
              identifiers,
              clock,
              outbox,
            ).execute(snapshot, key, key, null, signal());
            const event = (
              await connection.query<{ event: unknown }>(
                'SELECT event FROM collection.parsed_event_evidence WHERE event_id=$1',
                [produced.eventId],
              )
            )[0]!.event;
            await consumer.execute(event, signal());
            await waitFor('authenticated correction applied', async () => {
              await history.execute(100, signal());
              return (
                (
                  await connection.query<{ state: ListingChronologyState }>(
                    'SELECT state FROM properties.listing_current WHERE listing_id=$1',
                    [target.listing_id],
                  )
                )[0]!.state.acquisitions.at(-1)!.corrected?.eventId === produced.eventId
              );
            });
          };
          const observeImages = async (key: string, at: string, images: readonly string[]) => {
            // Fingerprints belong to acquired bytes: parser corrections cannot replace them.
            // Preserve the complete Aurora manifest so this evidence change removes no sibling.
            await collect(
              sourceId,
              key,
              fresh.map((item) => ({
                ...item,
                observedAt: at,
                mediaType: 'application/json' as const,
                bytes: new TextEncoder().encode(
                  JSON.stringify({
                    ...item.listing,
                    ...(item.sourceListingId === 'AUR-BV-001' ? { imageFingerprints: images } : {}),
                  }),
                ),
              })),
              at,
            );
            await waitFor('complete authentic evidence acquisition applied', async () => {
              await history.execute(100, signal());
              const members = await connection.query<{ state: ListingChronologyState }>(
                'SELECT state FROM properties.listing_current current JOIN properties.listing listing USING(listing_id) WHERE listing.source_id=$1',
                [sourceId],
              );
              return (
                members.length === fresh.length &&
                members.every(
                  (member) =>
                    member.state.acquisitions.at(-1)!.original.payload.source.observedAt === at,
                )
              );
            });
            await resolver().execute(signal());
            const acquired = (
              await connection.query<{ state: ListingChronologyState }>(
                'SELECT state FROM properties.listing_current WHERE listing_id=$1',
                [target.listing_id],
              )
            )[0]!.state.acquisitions.at(-1)!.original.payload.listing;
            expect(acquired.imageFingerprints).toEqual(images);
            expect(acquired.askingPriceMinorUnits).toBe(78000000);
          };
          const beforeCorrectionFacts = await connection.query(
            'SELECT event_id::text,event FROM properties.listing_event ORDER BY event_id',
          );
          const minimumCount = async () =>
            (
              await connection.query<{ count: number }>(
                'SELECT count(*)::integer AS count FROM properties.property_minimum_effect',
              )
            )[0]!.count;
          const previousMinimumCount = await minimumCount();
          await correct('resolution-incompatible-type', {
            propertyType: 'house',
            askingPriceMinorUnits: 100000,
          });
          const snapshotResolution = async () =>
            JSON.stringify(
              await connection.query(
                "SELECT 'assignment' AS kind,to_jsonb(row) AS value FROM properties.listing_assignment row UNION ALL SELECT 'comparison',to_jsonb(row) FROM properties.match_comparison row UNION ALL SELECT 'revision',to_jsonb(row) FROM properties.resolution_property_state row UNION ALL SELECT 'minimum',to_jsonb(row) FROM properties.property_minimum_effect row UNION ALL SELECT 'publication',to_jsonb(row) FROM platform.outbox row ORDER BY kind,value",
              ),
            );
          const beforeFailure = await snapshotResolution();
          const failingResolver = new ReconcilePropertyResolution(
            new PostgresPropertyResolutionRepository(
              connection,
              {
                append: async (transaction, events) => {
                  await outbox.append(transaction, events);
                  throw new Error('owned failure after resolution and outbox writes');
                },
              },
              identifiers,
            ),
            transactions,
          );
          await expect(failingResolver.execute(signal())).rejects.toThrow(
            'owned failure after resolution and outbox writes',
          );
          expect(await snapshotResolution()).toBe(beforeFailure);
          await resolver().execute(signal());
          expect(
            (
              await connection.query<{ count: number }>(
                'SELECT count(DISTINCT property_id)::integer AS count FROM properties.listing_assignment',
              )
            )[0]!.count,
          ).toBe(6);
          await assertSearchAgreesWithDetail(6);
          expect(await minimumCount()).toBe(previousMinimumCount);
          expect(
            await connection.query(
              'SELECT event_id::text,event FROM properties.listing_event ORDER BY event_id',
            ),
          ).toEqual(beforeCorrectionFacts);
          await observeImages('resolution-acquire-sparse-images', '2027-01-01T12:01:00.000Z', [
            'fixture-fingerprint:resolution-owned-sparse',
          ]);
          await correct('resolution-exact-review-boundary', {
            propertyType: 'apartment',
            maskedDescription: '.',
            areaSquareMeters: 20.5,
          });
          await resolver().execute(signal());
          expect(
            (
              await connection.query<{ count: number }>(
                "SELECT count(*)::integer AS count FROM properties.match_comparison WHERE (evidence->>'probability')::numeric=0.50 AND evidence->>'decision'='review'",
              )
            )[0]!.count,
          ).toBe(2);
          const boundaryReviews = (
            await connection.query<{ count: number }>(
              "SELECT count(*)::integer AS count FROM platform.outbox WHERE event_type='properties.match.queued-for-review'",
            )
          )[0]!.count;
          await correct('resolution-below-review-boundary', {
            propertyType: 'apartment',
            maskedDescription: '.',
            areaSquareMeters: 20.49,
          });
          await resolver().execute(signal());
          expect(
            (
              await connection.query<{ count: number }>(
                "SELECT count(*)::integer AS count FROM platform.outbox WHERE event_type='properties.match.queued-for-review'",
              )
            )[0]!.count,
          ).toBe(boundaryReviews);
          const sparse = {
            propertyType: 'apartment' as const,
            maskedDescription: '.',
          };
          await correct('resolution-sparse-review', sparse);
          await resolver().execute(signal());
          const reviews = async () =>
            (
              await connection.query<{ count: number }>(
                "SELECT count(*)::integer AS count FROM platform.outbox WHERE event_type='properties.match.queued-for-review'",
              )
            )[0]!.count;
          const reviewCount = await reviews();
          expect(reviewCount).toBeGreaterThan(0);
          await correct('resolution-same-review-price-only', {
            ...sparse,
            askingPriceMinorUnits: 200000,
          });
          expect(await resolver().execute(signal())).toBe(0);
          expect(await reviews()).toBe(reviewCount);
          await observeImages(
            'resolution-acquire-full-images',
            '2027-01-01T12:02:00.000Z',
            fresh.find((item) => item.sourceListingId === 'AUR-BV-001')!.listing.imageFingerprints,
          );
          await correct('resolution-exact-automatic-boundary', {
            maskedDescription: 'Entirely disjoint words.',
          });
          await resolver().execute(signal());
          expect(
            (
              await connection.query<{ count: number }>(
                "SELECT count(*)::integer AS count FROM properties.match_comparison WHERE (evidence->>'probability')::numeric=0.90 AND evidence->>'decision'='automatic'",
              )
            )[0]!.count,
          ).toBeGreaterThan(0);
          await correct('resolution-restore-full-evidence', {});
          await resolver().execute(signal());
          expect(await minimumCount()).toBe(previousMinimumCount);
          expect(
            await connection.query(
              'SELECT event_id::text,event FROM properties.listing_event ORDER BY event_id',
            ),
          ).toEqual(beforeCorrectionFacts);
          expect(await resolver().execute(signal())).toBe(0);
          await assertSearchAgreesWithDetail(5);
          // Block an actual history transaction after its listing/outbox writes and before commit.
          // The independent resolver must wait on the same PostgreSQL write guard and then see it.
          const beforeRacePrice = (await currentSearch()).items.find(
            (item) => item.id === bv,
          )!.askingPrice;
          const raceAt = '2027-01-02T12:00:00.000Z';
          await collect(
            sourceId,
            'resolution-history-race',
            fresh.map((item) => ({
              ...item,
              observedAt: raceAt,
              mediaType: 'application/json' as const,
              bytes: new TextEncoder().encode(
                JSON.stringify({
                  ...item.listing,
                  ...(item.sourceListingId === 'AUR-BV-001'
                    ? { askingPriceMinorUnits: 1000000 }
                    : {}),
                }),
              ),
            })),
            raceAt,
          );
          let releaseHistory!: () => void;
          const released = new Promise<void>((resolve) => {
            releaseHistory = resolve;
          });
          let entered = false;
          const blockedOutbox = {
            append: async (
              transaction: Parameters<typeof outbox.append>[0],
              events: Parameters<typeof outbox.append>[1],
            ) => {
              await outbox.append(transaction, events);
              if (events.some((event) => event.type === 'properties.listing.price-changed')) {
                entered = true;
                await released;
              }
            },
          };
          const blockedHistory = new ReconcileListingHistory(
            collection,
            locations,
            properties,
            historyRepository,
            transactions,
            blockedOutbox,
            identifiers,
            (text) => `sha256:${createHash('sha256').update(text).digest('hex')}`,
            outbox,
          );
          const historyWork = (async () => {
            for (let iteration = 0; iteration < 20; iteration++) {
              await blockedHistory.execute(100, signal());
              if (entered) return;
            }
            throw new Error('History did not reach the owned write barrier.');
          })();
          let resolutionWork: Promise<number> | undefined;
          try {
            await waitFor('history transaction reached real write barrier', () => entered);
            expect(
              (await currentSearch()).items.find((item) => item.id === bv)!.askingPrice,
            ).toEqual(beforeRacePrice);
            resolutionWork = resolver().execute(signal());
            await waitFor(
              'resolver waits on PostgreSQL advisory lock',
              async () =>
                (
                  await connection.query<{ count: number }>(
                    "SELECT count(*)::integer AS count FROM pg_stat_activity WHERE wait_event='advisory' AND query LIKE '%pg_advisory_xact_lock%'",
                  )
                )[0]!.count > 0,
            );
          } finally {
            releaseHistory();
          }
          await historyWork;
          await resolutionWork;
          await waitFor('all race listing revisions consumed', async () => {
            await history.execute(100, signal());
            await resolver().execute(signal());
            return (
              (
                await connection.query<{ state: ListingChronologyState }>(
                  'SELECT state FROM properties.listing_current WHERE listing_id=$1',
                  [target.listing_id],
                )
              )[0]!.state.acquisitions.at(-1)!.original.payload.source.observedAt === raceAt
            );
          });
          expect(await minimumCount()).toBe(previousMinimumCount + 1);
          const raceAssignment = (
            await connection.query<{ processed_revision: number; revision: number }>(
              'SELECT assignment.processed_revision,current.revision FROM properties.listing_assignment assignment JOIN properties.listing_current current USING(listing_id) WHERE listing_id=$1',
              [target.listing_id],
            )
          )[0]!;
          expect(raceAssignment.processed_revision).toBe(raceAssignment.revision);
          const applyRun = async (
            source: string,
            key: string,
            at: string,
            observations: readonly (typeof fresh)[number][],
          ) => {
            await collect(
              source,
              key,
              observations.map((item) => ({
                ...item,
                observedAt: at,
                mediaType: 'application/json' as const,
                bytes: new TextEncoder().encode(JSON.stringify(item.listing)),
              })),
              at,
            );
            for (let iteration = 0; iteration < 20; iteration++) {
              await history.execute(100, signal());
              await resolver().execute(signal());
              const outstanding = await transactions.runInTransaction(
                async (transaction) =>
                  collection.nextCompletedRun(
                    transaction,
                    source,
                    (await historyRepository.nextSources(100, signal())).find(
                      (work) => work.sourceId === source,
                    )!.after,
                  ),
                signal(),
              );
              if (outstanding === null) return;
            }
            throw new Error('Owned history run did not finish within its bounded effects.');
          };
          const brisa = SYNTHETIC_SAO_PAULO_DATASET.runs
            .at(-1)!
            .observations.filter((item) => item.sourceId === 'synthetic-portal-brisa')
            .map((item) => ({
              ...item,
              listing: {
                ...item.listing,
                ...(item.sourceListingId === 'BRI-BV-001'
                  ? { askingPriceMinorUnits: item.listing.askingPriceMinorUnits - 100000 }
                  : {}),
              },
            }));
          const countBeforeNonMinimum = await minimumCount();
          await applyRun(
            'synthetic-portal-brisa',
            'resolution-nonminimum-change',
            '2027-01-03T12:00:00.000Z',
            brisa,
          );
          expect(await minimumCount()).toBe(countBeforeNonMinimum);
          await applyRun(
            'synthetic-portal-brisa',
            'resolution-nonminimum-removal',
            '2027-01-03T13:00:00.000Z',
            brisa.filter((item) => item.sourceListingId !== 'BRI-BV-001'),
          );
          expect(await minimumCount()).toBe(countBeforeNonMinimum);
          expect(
            (await get('places/brazil/largest-reductions', parseReductionsResponse)).metadata.asOf,
          ).toBe('2027-01-03T13:00:01.000Z');
          const auroraLow = fresh.map((item) => ({
            ...item,
            listing: {
              ...item.listing,
              ...(item.sourceListingId === 'AUR-BV-001' ? { askingPriceMinorUnits: 1000000 } : {}),
            },
          }));
          await applyRun(
            sourceId,
            'resolution-minimum-removal',
            '2027-01-04T12:00:00.000Z',
            auroraLow.filter((item) => item.sourceListingId !== 'AUR-BV-001'),
          );
          expect(await minimumCount()).toBe(countBeforeNonMinimum + 1);
          expect(
            (await get(`listings/${target.listing_id}`, parseListingResponse)).listing.status,
          ).toBe('removed');
          await assertSearchAgreesWithDetail(5);
          await applyRun(
            sourceId,
            'resolution-minimum-return',
            '2027-01-05T12:00:00.000Z',
            auroraLow,
          );
          expect(await minimumCount()).toBe(countBeforeNonMinimum + 2);
          expect(
            (await get(`listings/${target.listing_id}`, parseListingResponse)).listing.status,
          ).toBe('active');
          const afterReturn = await assertSearchAgreesWithDetail(5);
          expect(afterReturn.items.find((item) => item.id === bv)!.askingPrice).toMatchObject({
            minorUnits: 1000000,
            listingId: target.listing_id,
          });
          const allPropertyEvents = await connection.query<{ event: PropertiesEventV2 }>(
            `SELECT jsonb_build_object('eventId',event_id,'type',event_type,'version',event_version,'aggregateId',aggregate_id,'occurredAt',to_char(occurred_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'traceContext',trace_context,'payload',payload) AS event FROM platform.outbox WHERE event_type LIKE 'properties.property.%' ORDER BY occurred_at,event_id`,
          );
          const allListingEvents = await connection.query<{ event: PropertiesEvent }>(
            'SELECT event FROM properties.listing_event ORDER BY event_id',
          );
          for (const { event } of [...allPropertyEvents].reverse())
            await market.execute(event, signal());
          for (const { event } of [...allListingEvents].reverse())
            await market.execute(event, signal());
          expect(
            await connection.query(
              'SELECT listing_id::text,property_id::text,revision::text FROM market.listing_assignment_current ORDER BY listing_id',
            ),
          ).toEqual(
            await connection.query(
              'SELECT listing_id::text,property_id::text,assignment_revision::text AS revision FROM properties.listing_assignment ORDER BY listing_id',
            ),
          );
          expect(await resolver().execute(signal())).toBe(0);
          await compose('up', '--detach', '--wait', 'worker');
          await waitFor('restart remains five grouped properties', async () => {
            const rows = await connection.query<{ count: number }>(
              'SELECT count(DISTINCT property_id)::integer AS count FROM properties.listing_assignment',
            );
            return rows[0]?.count === 5;
          });
          await compose('stop', 'worker');
          const beforeRestart = await currentSearch();
          await compose('restart', 'api');
          await waitFor(
            'restarted API serves committed search',
            async () => {
              try {
                return (await requestHttp(`http://127.0.0.1:${api}/health`)).status === 200;
              } catch {
                return false;
              }
            },
            30000,
          );
          expect(await currentSearch()).toEqual(beforeRestart);
          await compose('stop', 'postgres');
          const failedSearch = await requestHttp(`http://127.0.0.1:${api}/api/v1/properties`);
          expect(failedSearch.status).toBe(500);
          expect(JSON.stringify(await failedSearch.json())).not.toMatch(
            /stack|postgres:|password|synthetic-sao-paulo-v1/,
          );
          await compose('up', '--detach', '--wait', 'postgres');
          await waitFor(
            'database recovery preserves committed search',
            async () => {
              try {
                return (
                  (await requestHttp(`http://127.0.0.1:${api}/api/v1/properties`)).status === 200
                );
              } catch {
                return false;
              }
            },
            30000,
          );
          expect(await currentSearch()).toEqual(beforeRestart);
        } catch (error) {
          await compose(
            'logs',
            '--no-color',
            '--tail',
            '100',
            'worker',
            'api',
            'migrations',
            'postgres',
          )
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
                await browser?.close();
              },
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
