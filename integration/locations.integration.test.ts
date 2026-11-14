import { randomUUID } from 'node:crypto';
import { expect, test } from 'vitest';
import {
  parsePlaceResponse,
  parsePlacesResponse,
  parseReductionsResponse,
  parseSearchResponse,
} from '../packages/contracts/dist/index.js';
import {
  DatabaseConnection,
  PostgresLocationsFacade,
  PostgresTransactionRunner,
  supplementaryPlaces,
  SYNTHETIC_READ_METADATA,
  SYNTHETIC_SAO_PAULO_DATASET,
  syntheticPlaces,
} from '../packages/infrastructure/dist/index.js';
import { allocatePorts, cleanupAll, preserveCleanup, withCampaign } from './support/fixture.ts';
import { requestHttp } from './support/http.ts';
test('locations preserves its complete real-service campaign', async () => {
  await withCampaign(async ({ command }) => {
    const run = command;
    const project = `rei-locations-${process.pid}-${randomUUID().slice(0, 8)}`;
    async function port() {
      const [selected] = await allocatePorts(1);
      expect(Number.isInteger(selected)).toBeTruthy();
      return selected;
    }
    const postgresPort = await port();
    const apiPort = await port();
    const fixture = {
      user: 'rei_locations_fixture',
      password: 'rei-locations-owned-fixture',
      database: 'rei_locations_fixture',
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
    let requests = 0;
    async function get<
      T extends (value: unknown) => {
        metadata: { dataMode: string; fixtureVersion: string; asOf: string };
      },
    >(path: string, parser: T) {
      const response = await requestHttp(`http://127.0.0.1:${apiPort}/api/v1/${path}`, {
        signal: AbortSignal.timeout(5000),
      });
      requests++;
      expect(response.status, path).toBe(200);
      const body = parser(await response.json());
      if (Object.is(parser, parseReductionsResponse)) {
        expect(body.metadata.fixtureVersion).toBe('persisted-synthetic-reductions-v1');
        expect(body.metadata.dataMode).toBe('synthetic-stub');
      } else if (Object.is(parser, parseSearchResponse)) {
        // Search reads persisted Properties, so its metadata carries the live read time.
        expect(body.metadata.fixtureVersion).toBe('persisted-synthetic-search-v1');
        expect(body.metadata.dataMode).toBe('synthetic-stub');
      } else expect(body.metadata).toStrictEqual(SYNTHETIC_READ_METADATA);
      return body as ReturnType<T>;
    }
    async function error(path: string, status: number, prefixed = true) {
      const response = await requestHttp(
        `http://127.0.0.1:${apiPort}/${prefixed ? 'api/v1/' : ''}${path}`,
        {
          signal: AbortSignal.timeout(5000),
          headers: { 'x-request-id': 'client-controlled' },
        },
      );
      requests++;
      expect(response.status, path).toBe(status);
      const body = (await response.json()) as {
        error: { code: string; message: string; requestId: string };
      };
      expect(Object.keys(body)).toStrictEqual(['error']);
      expect(body.error.code).toBe(
        status === 400 ? 'bad_request' : status === 404 ? 'not_found' : 'internal_error',
      );
      expect(body.error.requestId).toBe(response.headers.get('x-request-id'));
      expect(body.error.requestId).not.toBe('client-controlled');
      expect(!/postgres|password|SELECT|stack/.test(JSON.stringify(body))).toBeTruthy();
    }
    let connection: DatabaseConnection;
    {
      let cleanupPrimary3: unknown;
      let cleanupPrimaryThrown3 = false;
      try {
        try {
          // Compiled CommonJS composition must work in either import order, not only AppModule's order.
          for (const order of [
            ['properties', 'locations'],
            ['locations', 'properties'],
          ] as const) {
            const probe = await run(
              process.execPath,
              ['integration/fixtures/import-order-probe.ts', JSON.stringify(order)],
              {
                cwd: new URL('..', import.meta.url),
                timeout: 10000,
              },
            );
            const modules = JSON.parse(probe.stdout) as Array<{
              context: string;
              importsDefined: boolean;
            }>;
            expect(modules.map((module) => module.context)).toStrictEqual(order);
            for (const module of modules)
              expect(module.importsDefined, 'Undefined module import from a circular barrel').toBe(
                true,
              );
          }
          console.log(`Starting isolated Locations campaign ${project}.`);
          await compose('up', '--detach', '--build', '--wait', 'postgres', 'migrations', 'api');
          const url = new URL(`postgres://127.0.0.1:${postgresPort}/${fixture.database}`);
          url.username = fixture.user;
          url.password = fixture.password;
          connection = new DatabaseConnection(url.toString());
          const facade = new PostgresLocationsFacade(connection);
          const identity = () =>
            connection.query<{ place_id: string; public_id: string; version: number }>(
              'SELECT place_id::text, public_id, uuid_extract_version(place_id)::integer AS version FROM locations.place ORDER BY sibling_order,public_id',
            );
          const before = await identity();
          expect(before.length).toBe(20);
          expect(before.every((row: { version: number }) => row.version === 7)).toBeTruthy();
          const expected = [...syntheticPlaces(), ...supplementaryPlaces()];
          const root = await get('places', parsePlacesResponse);
          expect(root.items).toStrictEqual(expected.filter((place) => place.parentId === null));
          const visited: Array<string | null> = [];
          async function traverse(place: { id: string | null }) {
            visited.push(place.id);
            expect((await get(`places/${place.id}`, parsePlaceResponse)).place).toStrictEqual(
              place,
            );
            const children = (await get(`places/${place.id}/children`, parsePlacesResponse)).items;
            expect(children).toStrictEqual(expected.filter((entry) => entry.parentId === place.id));
            for (const child of children) await traverse(child);
          }
          for (const place of root.items) await traverse(place);
          expect(new Set(visited).size).toBe(20);
          await error('places/unknown-place', 404);
          await error('places/unknown-place/children', 404);
          await error('places/brazil?private=ignored', 400);
          await error('places/BRAZIL', 400);
          await error('places', 404, false);
          for (const place of expected) {
            expect((await facade.getPlace(place.id))!.place!).toStrictEqual(place);
            expect(await facade.registeredScopeIds(place.id)).toStrictEqual(
              expected
                .filter((child) => child.breadcrumbs.some((crumb) => crumb.id === place.id))
                .map((child) => child.id)
                .sort(),
            );
            const empty = await get(
              `places/${place.id}/largest-reductions`,
              parseReductionsResponse,
            );
            expect(empty.items).toStrictEqual([]);
            expect(empty.totalItems).toBe(0);
            expect(empty.nextCursor).toBe(null);
            for (const neighbor of place.adjacentPlaceIds)
              expect(
                (await facade.getPlace(neighbor))!.place!.adjacentPlaceIds.includes(place.id),
              ).toBeTruthy();
          }
          expect(await facade.registeredScopeIds('unknown-place')).toBe(null);
          for (const block of supplementaryPlaces()) {
            expect(block.propertyCount).toBe(0);
            const search = await get(`properties?placeId=${block.id}`, parseSearchResponse);
            expect(search.totalItems).toBe(0);
            expect(search.items).toStrictEqual([]);
            expect(
              (await get(`places/${block.id}/largest-reductions`, parseReductionsResponse))
                .totalItems,
            ).toBe(0);
            await error(`places/${block.id}/largest-reductions?cursor=bad`, 400);
          }
          const addresses = [
            ...SYNTHETIC_SAO_PAULO_DATASET.listings.map((listing) => ({
              reference: listing.reference.sourceListingId,
              ...listing.listing.location,
            })),
            {
              reference: 'SYN-SP-0001',
              city: 'S\u00E3o Paulo',
              stateCode: 'SP',
              neighborhood: 'Bela Vista',
              street: 'Avenida Exemplo',
            },
          ];
          expect(addresses.length).toBe(10);
          // All production pool leases must be held before any lookup starts. A nested checkout
          // exhausts this pool deterministically; the correct resolver uses its own BEGIN lease.
          const transactions = new PostgresTransactionRunner(connection);
          let entered = 0;
          let releaseBarrier: () => void;
          const barrier = new Promise<void>((resolve) => {
            releaseBarrier = resolve;
          });
          const saturated = await Promise.all(
            addresses.map(({ reference, ...address }) =>
              transactions.runInTransaction(async (transaction) => {
                entered++;
                if (entered === addresses.length) releaseBarrier();
                await barrier;
                const resolved = await facade.resolveFixtureAddress(address, transaction);
                expect(resolved, reference).toBeTruthy();
                expect(resolved!.breadcrumbs.length).toBe(6);
                return { reference, resolved };
              }, AbortSignal.timeout(10000)),
            ),
          );
          expect(entered).toBe(10);
          for (const { reference, resolved } of saturated) {
            const original = addresses.find((entry) => entry.reference === reference);
            expect(resolved).toStrictEqual(
              await facade.resolvePublishedAddress({
                city: original!.city,
                stateCode: original!.stateCode,
                neighborhood: original!.neighborhood,
                street: original!.street,
              }),
            );
          }
          for (const { reference, ...address } of addresses) {
            const resolved = await facade.resolvePublishedAddress(address);
            expect(resolved, reference).toBeTruthy();
            const detail = (await get(`places/${resolved!.place.id}`, parsePlaceResponse)).place;
            expect(detail!.block!.streetName).toBe(address.street);
            expect(detail!.breadcrumbs[4]!.name.ptBR).toBe(address.neighborhood);
            const zone = SYNTHETIC_SAO_PAULO_DATASET!.places.find(
              (place) => place.neighborhood === address.neighborhood,
            )!.zone;
            expect(detail!.breadcrumbs[3]!.name.ptBR).toBe(`Zona ${zone}`);
            expect(detail.breadcrumbs.length).toBe(6);
            expect(resolved!.breadcrumbs).toStrictEqual(detail.breadcrumbs);
            if (reference === 'COB-BV-001')
              expect(detail.id).toBe('sao-paulo-vila-mariana-rua-cenario-um-fictional-block');
            for (const number of [100, 199])
              expect(
                (await facade.resolvePublishedAddress({ ...address, number }))!.place!.id,
              ).toBe(detail.id);
            for (const number of [0, 99, 200, Number.MAX_SAFE_INTEGER])
              expect(await facade.resolvePublishedAddress({ ...address, number })).toBe(null);
          }
          const address = {
            city: ' SAO  PAULO ',
            stateCode: 'sp',
            neighborhood: '  B\u00E9la  Vista ',
            street: 'AV.  Ex\u00E9mplo',
          };
          expect((await facade.resolvePublishedAddress(address))!.place!.id).toBe(
            'sao-paulo-bela-vista-avenida-exemplo-fictional-block',
          );
          expect(
            (await facade.resolvePublishedAddress({ ...address, street: 'R. Cenario Um' }))!.place!
              .id,
          ).toBe('sao-paulo-bela-vista-fictional-block');
          for (const invalid of [
            { ...address, complement: 'private' },
            {
              ...address,
              unitNumber: '10',
            },
            { ...address, number: 1.1 },
            { ...address, number: -1 },
            { ...address, street: 'Rua Um, 100' },
          ])
            await expect(facade.resolvePublishedAddress(invalid)).rejects.toThrow(
              /Invalid published/,
            );
          for (const unknown of [
            {
              ...address,
              street: 'Exemplo',
            },
            { ...address, neighborhood: 'Unknown' },
            { ...address, stateCode: 'RJ' },
          ])
            expect(await facade.resolvePublishedAddress(unknown)).toBe(null);
          // Scoped transactions exercise real SQL integrity and ambiguity without retaining test rows.
          async function rollback(
            work: (client: Awaited<ReturnType<DatabaseConnection['leaseClient']>>) => Promise<void>,
          ) {
            const client = await connection.leaseClient();
            {
              let cleanupPrimary1: unknown;
              let cleanupPrimaryThrown1 = false;
              try {
                await client.query('BEGIN');
                await work(client);
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
                        await client.query('ROLLBACK');
                      },
                      async () => {
                        client.release();
                      },
                    );
                  },
                );
              }
            }
          }
          const malformed = [
            "UPDATE locations.place SET parent_id=(SELECT place_id FROM locations.place WHERE public_id='sao-paulo'),parent_kind='city' WHERE public_id='sao-paulo-bela-vista'",
            "UPDATE locations.place SET parent_kind='zone',parent_id=(SELECT place_id FROM locations.place WHERE public_id='sao-paulo') WHERE public_id='sao-paulo-bela-vista'",
            "UPDATE locations.place SET parent_id=place_id WHERE public_id='sao-paulo-bela-vista'",
            "UPDATE locations.place SET parent_id=NULL WHERE public_id='sao-paulo-bela-vista'",
            "UPDATE locations.place SET from_number=200 WHERE public_id='sao-paulo-bela-vista-fictional-block'",
            "UPDATE locations.place SET from_number=NULL WHERE public_id='sao-paulo-bela-vista-fictional-block'",
            "UPDATE locations.place SET to_number=9007199254740992 WHERE public_id='sao-paulo-bela-vista-fictional-block'",
            "UPDATE locations.place SET latitude=91 WHERE public_id='sao-paulo-bela-vista-fictional-block'",
            "UPDATE locations.place SET longitude=NULL WHERE public_id='sao-paulo-bela-vista-fictional-block'",
            "UPDATE locations.place SET street_name='Invalid' WHERE public_id='sao-paulo-bela-vista'",
            "UPDATE locations.place SET public_id='brazil' WHERE public_id='sao-paulo'",
            'UPDATE locations.neighborhood_adjacency SET second_id=first_id',
            "UPDATE locations.neighborhood_adjacency SET kind='city'",
            "UPDATE locations.neighborhood_adjacency SET first_id=(SELECT place_id FROM locations.place WHERE public_id='brazil')",
            "UPDATE locations.place SET kind='zone',parent_kind='city',parent_id=(SELECT place_id FROM locations.place WHERE public_id='sao-paulo') WHERE public_id='sao-paulo-bela-vista'",
          ];
          for (const sql of malformed)
            await rollback(async (client) => {
              await expect(client.query(sql)).rejects.toThrow();
            });
          const trimWhitespace = [
            '\t',
            '\n',
            '\v',
            '\f',
            '\r',
            ' ',
            '\u00A0',
            '\u1680',
            '\u2000',
            '\u2001',
            '\u2002',
            '\u2003',
            '\u2004',
            '\u2005',
            '\u2006',
            '\u2007',
            '\u2008',
            '\u2009',
            '\u200A',
            '\u2028',
            '\u2029',
            '\u202F',
            '\u205F',
            '\u3000',
            '\uFEFF',
          ];
          for (const column of ['name_en', 'name_pt_br', 'street_name']) {
            for (const whitespace of [...trimWhitespace, trimWhitespace.join('')]) {
              expect(whitespace.trim()).toBe('');
              await rollback(async (client) => {
                await expect(
                  client.query(
                    `UPDATE locations.place SET ${column}=$1 WHERE public_id=$2`,

                    [whitespace, 'sao-paulo-bela-vista-fictional-block'],
                  ),
                ).rejects.toThrow();
              });
            }
            await rollback(async (client) => {
              await expect(
                client.query(`UPDATE locations.place SET ${column}=$1 WHERE public_id=$2`, [
                  'x'.repeat(201),
                  'sao-paulo-bela-vista-fictional-block',
                ]),
              ).rejects.toThrow();
            });
            await rollback(async (client) => {
              const value = `${trimWhitespace.join('')}${'x'.repeat(200)}${trimWhitespace.join('')}`;
              await client.query(`UPDATE locations.place SET ${column}=$1 WHERE public_id=$2`, [
                value,
                'sao-paulo-bela-vista-fictional-block',
              ]);
              const scoped = new PostgresLocationsFacade(
                new Proxy(connection, {
                  get(target, name) {
                    if (name === 'query')
                      return async <TRow extends object>(
                        statement: string,
                        parameters?: readonly unknown[],
                      ) => [...(await client.query<TRow>(statement, parameters))];
                    return Reflect.get(target, name, target);
                  },
                }),
              );
              const detail = (await scoped.getPlace('sao-paulo-bela-vista-fictional-block'))!
                .place!;
              expect(
                column === 'street_name'
                  ? detail!.block!.streetName
                  : column === 'name_en'
                    ? detail.name.en
                    : detail.name.ptBR,
              ).toBe(value);
            });
          }
          expect(
            (await get('places/sao-paulo-bela-vista-fictional-block', parsePlaceResponse)).place,
          ).toStrictEqual(
            expected.find((place) => place.id === 'sao-paulo-bela-vista-fictional-block'),
          );
          await rollback(async (client) => {
            await expect(
              client.query(
                "UPDATE locations.place SET from_number=100.5 WHERE public_id='sao-paulo-bela-vista-fictional-block'",
              ),
            ).rejects.toThrow();
          });
          await rollback(async (client) => {
            await client.query<{
              kind: string;
              parent_id: string;
              parent_kind: string;
              street_name: string;
              normalized_street: string;
              block_origin: string;
            }>(`INSERT INTO locations.place (public_id,kind,name_en,name_pt_br,normalized_name,parent_id,parent_kind,sibling_order,prepared_property_count,street_name,normalized_street,from_number,to_number,block_origin)
      SELECT 'owned-second-block',kind,'Owned second block','Quarteirão de teste','owned second block',parent_id,parent_kind,20,0,street_name,normalized_street,200,299,block_origin FROM locations.place WHERE public_id='sao-paulo-bela-vista-avenida-exemplo-fictional-block'`);
            const transactional = new PostgresLocationsFacade(
              new Proxy(connection, {
                get(target, name) {
                  if (name === 'query')
                    return async <TRow extends object>(
                      statement: string,
                      parameters?: readonly unknown[],
                    ) => [...(await client.query<TRow>(statement, parameters))];
                  return Reflect.get(target, name, target);
                },
              }),
            );
            expect(await transactional.resolvePublishedAddress(address)).toBe(null);
            expect(
              (await transactional.resolvePublishedAddress({
                ...address,
                number: 200,
              }))!.place!.id,
            ).toBe('owned-second-block');
            await client.query(
              "UPDATE locations.place SET from_number=100 WHERE public_id='owned-second-block'",
            );
            expect(await transactional.resolvePublishedAddress({ ...address, number: 150 })).toBe(
              null,
            );
          });
          const columns = await connection.query<{ column_name: string }>(
            "SELECT column_name FROM information_schema.columns WHERE table_schema='locations'",
          );
          expect(
            !columns.some((column) =>
              /unit|complement|query|address_number/.test(column.column_name),
            ),
          ).toBeTruthy();
          const fks = await connection.query<{ target: string }>(
            "SELECT c.confrelid::regclass::text AS target FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace WHERE n.nspname='locations' AND c.contype='f'",
          );
          expect(fks.every((row) => row.target.startsWith('locations.'))).toBeTruthy();
          await compose('run', '--rm', 'migrations');
          expect(await identity()).toStrictEqual(before);
          await compose('restart', 'api');
          await compose('up', '--detach', '--wait', 'api');
          expect(await get('places', parsePlacesResponse)).toStrictEqual(root);
          expect(await identity()).toStrictEqual(before);
          // A missing database table must surface an error; prepared memory is never a fallback.
          await connection.query('ALTER TABLE locations.place RENAME TO owned_place_unavailable');
          {
            let cleanupPrimary2: unknown;
            let cleanupPrimaryThrown2 = false;
            try {
              await error('places', 500);
              await expect(facade.roots()).rejects.toThrow();
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
                  await cleanupAll(async () => {
                    await connection.query(
                      'ALTER TABLE locations.owned_place_unavailable RENAME TO place',
                    );
                  });
                },
              );
            }
          }
          expect(await get('places', parsePlacesResponse)).toStrictEqual(root);
          console.log(
            `Locations integration passed (${requests} real HTTP requests, 20 persisted places, 10 addresses, 10 synchronized transaction leases, all ECMAScript trim whitespace constraints, ambiguity, migration replay, restart and fail-closed reads).`,
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
            await cleanupAll(
              async () => {
                await connection?.close();
              },
              async () => {
                await compose('down', '--volumes', '--remove-orphans');
              },
              async () => {
                const containers = await run('docker', [
                  'ps',
                  '--all',
                  '--filter',
                  `label=com.docker.compose.project=${project}`,
                  '--format',
                  '{{.ID}}',
                ]);
                expect(containers.stdout.trim(), 'Owned containers remain').toBe('');
              },
              async () => {
                const volumes = await run('docker', [
                  'volume',
                  'ls',
                  '--filter',
                  `label=com.docker.compose.project=${project}`,
                  '--format',
                  '{{.Name}}',
                ]);
                expect(volumes.stdout.trim(), 'Owned volumes remain').toBe('');
              },
            );
          },
        );
      }
    }
  });
});
