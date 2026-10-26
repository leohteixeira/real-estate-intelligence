import { randomUUID } from 'node:crypto';
import { expect, test } from 'vitest';
import type { PlaceMarketResponse } from '../packages/contracts/dist/index.js';
import {
  parsePlaceMarketNeighboursResponse,
  parsePlaceMarketResponse,
  parsePlaceMarketSeriesResponse,
} from '../packages/contracts/dist/index.js';
import {
  DatabaseConnection,
  supplementaryPlaces,
  SYNTHETIC_READ_METADATA,
  SYNTHETIC_SAO_PAULO_DATASET,
  syntheticPlaces,
} from '../packages/infrastructure/dist/index.js';
import { allocatePorts, cleanupAll, preserveCleanup, withCampaign } from './support/fixture.ts';
import { requestHttp } from './support/http.ts';
test('market-contracts preserves its complete real-service campaign', async () => {
  await withCampaign(async ({ command }) => {
    const run = command;
    const project = `rei-market-${process.pid}-${randomUUID().slice(0, 8)}`;
    async function port() {
      const [selected] = await allocatePorts(1);
      expect(Number.isInteger(selected)).toBeTruthy();
      return selected;
    }
    const postgresPort = await port();
    const apiPort = await port();
    const fixture = {
      user: 'rei_market_fixture',
      password: 'rei-market-owned-fixture',
      database: 'rei_market_fixture',
    };
    const environment = {
      ...process.env,
      COMPOSE_FILE: 'compose.yaml',
      COMPOSE_PROJECT_NAME: project,
      COMPOSE_PROFILES: '',
      COMPOSE_DISABLE_ENV_FILE: '1',
      COMPOSE_ENV_FILES: '',
      NODE_ENV: 'test',
      POSTGRES_DB: fixture.database,
      POSTGRES_USER: fixture.user,
      POSTGRES_PASSWORD: fixture.password,
      POSTGRES_PORT: String(postgresPort),
      API_PORT: String(apiPort),
      OTEL_EXPORTER_OTLP_ENDPOINT: '',
    };
    const compose = (...args: string[]) =>
      run('docker', ['compose', '--file', 'compose.yaml', '--project-name', project, ...args], {
        cwd: new URL('..', import.meta.url),
        env: environment,
        timeout: 240000,
        maxBuffer: 10 * 1024 * 1024,
      });
    const parsers = [
      ['', parsePlaceMarketResponse],
      ['/neighbours', parsePlaceMarketNeighboursResponse],
      ['/monthly-series', parsePlaceMarketSeriesResponse],
    ] as const;
    let requests = 0;
    async function get<
      T extends (value: unknown) => { metadata: unknown; basis: string; evaluatedAt: string },
    >(id: string, suffix: string, parser: T) {
      const response = await requestHttp(
        `http://127.0.0.1:${apiPort}/api/v1/places/${id}/market${suffix}`,
        {
          signal: AbortSignal.timeout(5000),
        },
      );
      requests++;
      expect(response.status, `${id}${suffix}`).toBe(200);
      const value = parser(await response.json());
      expect(value.metadata).toStrictEqual(SYNTHETIC_READ_METADATA);
      expect(value.basis).toBe('event-fed-place-figures');
      expect(Date.now() - Date.parse(value.evaluatedAt)).toBeLessThan(5000);
      return value as ReturnType<T>;
    }
    async function error(
      id: string,
      suffix: string,
      query: string,
      status: number,
      prefixed = true,
    ) {
      const response = await requestHttp(
        `http://127.0.0.1:${apiPort}/${prefixed ? 'api/v1/' : ''}places/${id}/market${suffix}${query}`,
        {
          signal: AbortSignal.timeout(5000),
          headers: { 'x-request-id': 'client-controlled' },
        },
      );
      requests++;
      expect(response.status).toBe(status);
      expect(response.headers.get('content-type')).toMatch(/application\/json/);
      const requestId = response.headers.get('x-request-id');
      expect(requestId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
      );
      expect(await response.json()).toStrictEqual({
        error: {
          code: status === 400 ? 'bad_request' : status === 404 ? 'not_found' : 'internal_error',
          message:
            status === 400
              ? 'The request could not be processed.'
              : status === 404
                ? 'The requested resource was not found.'
                : 'An unexpected error occurred.',
          requestId,
        },
      });
    }
    let connection: DatabaseConnection;
    function stableOverview(body: PlaceMarketResponse) {
      return {
        ...body,
        evaluatedAt: 'live',
        figures: Object.fromEntries(
          Object.entries(body.figures).map(([key, value]) => [
            key,
            { ...value, computedAt: 'live', freshness: { ...value.freshness, ageSeconds: 0 } },
          ]),
        ),
        parentMedian: body.parentMedian
          ? {
              ...body.parentMedian,
              median: {
                ...body.parentMedian.median,
                computedAt: 'live',
                freshness: { ...body.parentMedian.median.freshness, ageSeconds: 0 },
              },
            }
          : null,
      };
    }
    async function state() {
      // Test-only snapshots of every owned table: detect updates as well as inserts/deletes.
      const tables = await connection.query<{ table_schema: string; table_name: string }>(
        "SELECT table_schema,table_name FROM information_schema.tables WHERE table_schema IN ('properties','collection','platform','locations','market') AND table_type='BASE TABLE' ORDER BY table_schema,table_name",
      );
      const result = [];
      for (const { table_schema: schema, table_name: table } of tables) {
        expect(schema).toMatch(/^[a-z_]+$/);
        expect(table).toMatch(/^[a-z_]+$/);
        const rows = await connection.query<{ count: number; digest: string }>(
          `SELECT count(*)::integer AS count,md5(COALESCE(string_agg(to_jsonb(record)::text,'' ORDER BY to_jsonb(record)::text),'')) AS digest FROM "${schema}"."${table}" record`,
        );
        result.push({ schema, table, ...rows[0] });
      }
      return result;
    }
    {
      let cleanupPrimary3: unknown;
      let cleanupPrimaryThrown3 = false;
      try {
        try {
          console.log(`Starting isolated Market campaign ${project}.`);
          await compose('up', '--detach', '--build', '--wait', 'postgres', 'migrations', 'api');
          const url = new URL(`postgres://127.0.0.1:${postgresPort}/${fixture.database}`);
          url.username = fixture.user;
          url.password = fixture.password;
          connection = new DatabaseConnection(url.toString());
          const before = await state();
          expect(
            before!.find((row) => row.schema === 'locations' && row.table === 'place')!.count,
          ).toBe(20);
          expect(
            before.filter((row) => row.schema === 'properties').every((row) => row.count === 0),
          ).toBeTruthy();
          expect(
            before!.find((row) => row.schema === 'platform' && row.table === 'outbox')!.count,
          ).toBe(0);
          const expected = [...syntheticPlaces(), ...supplementaryPlaces()];
          expect(expected.length).toBe(20);
          for (const place of expected) {
            const overview = await get(place.id, '', parsePlaceMarketResponse);
            expect(overview.place).toStrictEqual({
              id: place.id,
              kind: place.kind,
              name: place.name,
            });
            expect(overview.counts.properties).toBe(0);
            expect(overview.parentMedian?.place.id ?? null).toBe(place.parentId);
            expect(overview.figures.medianAskingPricePerSquareMeter).toMatchObject({
              state: 'insufficient-data',
              value: null,
              recordCount: 0,
              sources: [],
              freshness: {
                status: 'untracked',
                latestCollectionCompletedAt: null,
                ageSeconds: expect.any(Number),
              },
            });
            expect(overview.figures.recordedSalePricePerSquareMeter.state).toBe('not-recorded');
            expect(overview.figures.recordedSalePricePerSquareMeter.value).toBe(null);
            const neighbours = await get(
              place.id,
              '/neighbours',
              parsePlaceMarketNeighboursResponse,
            );
            expect(neighbours.items.map((item) => item.place.id)).toStrictEqual(
              place.adjacentPlaceIds,
            );
            const series = await get(place.id, '/monthly-series', parsePlaceMarketSeriesResponse);
            expect(series.comparisonPlace?.id ?? null).toBe(place.parentId);
            expect(series.points.map((point) => point.month)).toStrictEqual(
              Array.from({ length: 12 }, (_, index) => {
                const date = new Date(series.evaluatedAt);
                date.setUTCDate(1);
                date.setUTCMonth(date.getUTCMonth() - 11 + index);
                return date.toISOString().slice(0, 7);
              }),
            );
            if (place.propertyCount === 0) {
              expect(overview.counts).toStrictEqual({
                properties: 0,
                activeListings: 0,
                sources: 0,
              });
              expect(
                Object.values(overview.figures).every((figure) => figure.value === null),
              ).toBeTruthy();
              expect(
                series.points.every(
                  (point) => point.median.value === null && point.parentMedian?.value === null,
                ),
              ).toBeTruthy();
            }
            const clean = structuredClone(overview);
            Reflect.set(overview.metadata, 'fixtureVersion', 'caller mutation');
            if (overview.figures.medianAskingPricePerSquareMeter.value) {
              Reflect.set(overview.figures.medianAskingPricePerSquareMeter.value, 'minorUnits', 1);
              Reflect.set(
                overview!.figures.medianAskingPricePerSquareMeter.sources[0]!,
                'label',
                'caller mutation',
              );
            }
            expect(stableOverview(await get(place.id, '', parsePlaceMarketResponse))).toStrictEqual(
              stableOverview(clean),
            );
            Reflect.set(series!.points[0]!.median, 'state', 'caller mutation');
            expect(
              (await get(place.id, '/monthly-series', parsePlaceMarketSeriesResponse)).points![0]!
                .median.state,
            ).toBe('insufficient-data');
          }
          const city = await get('sao-paulo', '', parsePlaceMarketResponse);
          expect(city.counts).toStrictEqual({ properties: 0, activeListings: 0, sources: 0 });
          expect(city.figures.medianAskingPricePerSquareMeter.value).toBeNull();
          const pinheiros = await get('sao-paulo-pinheiros', '', parsePlaceMarketResponse);
          expect(pinheiros!.parentMedian!.place.id).toBe('sao-paulo-oeste');
          expect(pinheiros.figures.askingPriceMovement.value).toBeNull();
          expect(pinheiros.figures.priceReductions.value).toBeNull();
          for (const [suffix] of parsers) {
            await error('unknown-place', suffix, '', 404);
            for (const id of ['BRAZIL', 'with%20space', 'a'.repeat(201)])
              await error(id, suffix, '', 400);
            for (const query of ['?x=1', '?x=1&x=2', '?x[y]=1', '?__proto__[private]=1'])
              await error('brazil', suffix, query, 400);
            await error('brazil', suffix, '', 404, false);
          }
          for (const [suffix, parser] of parsers) {
            const body = await get('brazil', suffix, parser);
            expect(() => parser({ ...body, private: true })).toThrow(TypeError);
            expect(() => parser({ ...body, evaluatedAt: 'bad date' })).toThrow(TypeError);
          }
          for (const mutation of [
            (body: PlaceMarketResponse) => {
              Reflect.set(body.figures.askingPriceMovement.freshness, 'status', 'stale');
            },
            (body: PlaceMarketResponse) => {
              Reflect.set(body.figures.askingPriceMovement.freshness, 'ageSeconds', 1);
            },
            (body: PlaceMarketResponse) => {
              Reflect.set(body.figures.askingPriceMovement, 'sources', [
                {
                  id: 'invalid',
                  label: 'invalid',
                  url: 'https://real.example.com',
                  collectedAt: body.evaluatedAt,
                },
              ]);
            },
            (body: PlaceMarketResponse) => {
              Reflect.set(body.figures.medianAskingPricePerSquareMeter, 'value', {
                minorUnits: Number.MAX_SAFE_INTEGER + 1,
                currency: 'BRL',
              });
            },
            (body: PlaceMarketResponse) => {
              Reflect.set(body.figures.recordedSalePricePerSquareMeter, 'value', 0);
            },
          ]) {
            const body = await get('brazil', '', parsePlaceMarketResponse);
            mutation(body!);
            expect(() => parsePlaceMarketResponse(body)).toThrow(TypeError);
          }
          const chart = await get('brazil', '/monthly-series', parsePlaceMarketSeriesResponse);
          Reflect.set(chart!.points[1]!, 'month', chart!.points[0]!.month);
          expect(() => parsePlaceMarketSeriesResponse(chart)).toThrow(TypeError);
          // Live series cannot claim prepared completion or stale fixture semantics.
          const stale = await get('brazil', '/monthly-series', parsePlaceMarketSeriesResponse);
          Reflect.set(stale.points.at(-1)!.median.freshness, 'status', 'stale');
          expect(() => parsePlaceMarketSeriesResponse(stale)).toThrow(TypeError);
          expect(await state(), 'GETs changed persisted state').toStrictEqual(before);
          await connection.query('ALTER TABLE locations.place RENAME TO owned_place_unavailable');
          {
            let cleanupPrimary1: unknown;
            let cleanupPrimaryThrown1 = false;
            try {
              for (const [suffix] of parsers) await error('brazil', suffix, '', 500);
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
                  await cleanupAll(async () => {
                    await connection.query(
                      'ALTER TABLE locations.owned_place_unavailable RENAME TO place',
                    );
                  });
                },
              );
            }
          }
          expect(await state(), 'Failure journey changed persisted state').toStrictEqual(before);
          const dataset = SYNTHETIC_SAO_PAULO_DATASET;
          expect([
            dataset.properties.length,
            dataset.listings.length,
            dataset.sources.length,
            dataset.runs.length,
          ]).toStrictEqual([5, 9, 3, 13]);
          expect(Object.isFrozen(dataset)).toBeTruthy();
          console.log(
            `Market integration passed (${requests} real HTTP requests, 20 persisted scopes, exact figures/parents/adjacency/series, strict errors and parser rejection, detached results and unchanged table snapshots).`,
          );
        } catch (failure) {
          await compose('logs', '--no-color', '--tail', '80', 'api', 'migrations')
            .then(({ stdout, stderr }) => process.stderr.write(`${stdout}${stderr}`))
            .catch(() => undefined);
          throw failure;
        }
      } catch (error) {
        cleanupPrimary3 = error;
        cleanupPrimaryThrown3 = true;
        throw error;
      } finally {
        await preserveCleanup(
          async () => {
            if (cleanupPrimaryThrown3) throw cleanupPrimary3;
          },
          async () => {
            await cleanupAll(async () => {
              {
                let cleanupPrimary2: unknown;
                let cleanupPrimaryThrown2 = false;
                try {
                  await connection?.close();
                } catch (error) {
                  cleanupPrimary2 = error;
                  cleanupPrimaryThrown2 = true;
                  throw error;
                } finally {
                  await preserveCleanup(
                    async () => {
                      if (cleanupPrimaryThrown2) throw cleanupPrimary2;
                    },
                    async () => {
                      await cleanupAll(
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
                            expect(
                              remaining.stdout.trim(),
                              `Owned ${command} resources remain`,
                            ).toBe('');
                          }
                        },
                      );
                    },
                  );
                }
              }
            });
          },
        );
      }
    }
  });
});
