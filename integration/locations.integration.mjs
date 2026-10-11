import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:net';
import { promisify } from 'node:util';
import {
  parsePlaceResponse,
  parsePlacesResponse,
  parseReductionsResponse,
  parseSearchResponse,
} from '../packages/contracts/dist/index.js';
import {
  DatabaseConnection,
  PostgresTransactionRunner,
  PostgresLocationsFacade,
  SYNTHETIC_SAO_PAULO_DATASET,
  SYNTHETIC_READ_METADATA,
  syntheticPlaces,
  supplementaryPlaces,
} from '../packages/infrastructure/dist/index.js';

const run = promisify(execFile);
const project = `rei-locations-${process.pid}-${randomUUID().slice(0, 8)}`;
const reservations = [];
async function port() {
  const server = createServer();
  reservations.push(server);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  assert(address && typeof address !== 'string');
  return address.port;
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
const compose = (...args) =>
  run('docker', ['compose', '--file', 'compose.yaml', '--project-name', project, ...args], {
    cwd: new URL('..', import.meta.url),
    env: environment,
    timeout: 240000,
    maxBuffer: 10 * 1024 * 1024,
  });
let requests = 0;
async function get(path, parser) {
  const response = await fetch(`http://127.0.0.1:${apiPort}/api/v1/${path}`, {
    signal: AbortSignal.timeout(5000),
  });
  requests++;
  assert.equal(response.status, 200, path);
  const body = parser(await response.json());
  if (parser === parseReductionsResponse) {
    assert.equal(body.metadata.fixtureVersion, 'persisted-synthetic-reductions-v1');
    assert.equal(body.metadata.dataMode, 'synthetic-stub');
  } else assert.deepEqual(body.metadata, SYNTHETIC_READ_METADATA);
  return body;
}
async function error(path, status, prefixed = true) {
  const response = await fetch(`http://127.0.0.1:${apiPort}/${prefixed ? 'api/v1/' : ''}${path}`, {
    signal: AbortSignal.timeout(5000),
    headers: { 'x-request-id': 'client-controlled' },
  });
  requests++;
  assert.equal(response.status, status, path);
  const body = await response.json();
  assert.deepEqual(Object.keys(body), ['error']);
  assert.equal(
    body.error.code,
    status === 400 ? 'bad_request' : status === 404 ? 'not_found' : 'internal_error',
  );
  assert.equal(body.error.requestId, response.headers.get('x-request-id'));
  assert.notEqual(body.error.requestId, 'client-controlled');
  assert(!/postgres|password|SELECT|stack/.test(JSON.stringify(body)));
}
let connection;
try {
  await Promise.all(reservations.map((server) => new Promise((resolve) => server.close(resolve))));
  // Compiled CommonJS composition must work in either import order, not only AppModule's order.
  for (const order of [
    ['properties', 'locations'],
    ['locations', 'properties'],
  ]) {
    await run(
      process.execPath,
      [
        '-r',
        './apps/api/node_modules/reflect-metadata',
        '-e',
        `
      const assert = require('node:assert/strict');
      const modules = ${JSON.stringify(order)}.map(context => require('./apps/api/dist/' + context + '/' + context + '.module.js')[context === 'properties' ? 'PropertiesModule' : 'LocationsModule']);
      for (const module of modules) assert(Reflect.getMetadata('imports', module).every(Boolean), 'Undefined module import from a circular barrel');
    `,
      ],
      { cwd: new URL('..', import.meta.url), timeout: 10000 },
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
    connection.query(
      'SELECT place_id::text, public_id, uuid_extract_version(place_id)::integer AS version FROM locations.place ORDER BY sibling_order,public_id',
    );
  const before = await identity();
  assert.equal(before.length, 20);
  assert(before.every((row) => row.version === 7));
  const expected = [...syntheticPlaces(), ...supplementaryPlaces()];
  const root = await get('places', parsePlacesResponse);
  assert.deepEqual(
    root.items,
    expected.filter((place) => place.parentId === null),
  );
  const visited = [];
  async function traverse(place) {
    visited.push(place.id);
    assert.deepEqual((await get(`places/${place.id}`, parsePlaceResponse)).place, place);
    const children = (await get(`places/${place.id}/children`, parsePlacesResponse)).items;
    assert.deepEqual(
      children,
      expected.filter((entry) => entry.parentId === place.id),
    );
    for (const child of children) await traverse(child);
  }
  for (const place of root.items) await traverse(place);
  assert.equal(new Set(visited).size, 20);
  await error('places/unknown-place', 404);
  await error('places/unknown-place/children', 404);
  await error('places/brazil?private=ignored', 400);
  await error('places/BRAZIL', 400);
  await error('places', 404, false);
  for (const place of expected) {
    assert.deepEqual((await facade.getPlace(place.id)).place, place);
    assert.deepEqual(
      await facade.registeredScopeIds(place.id),
      expected
        .filter((child) => child.breadcrumbs.some((crumb) => crumb.id === place.id))
        .map((child) => child.id)
        .sort(),
    );
    const empty = await get(`places/${place.id}/largest-reductions`, parseReductionsResponse);
    assert.deepEqual(empty.items, []);
    assert.equal(empty.totalItems, 0);
    assert.equal(empty.nextCursor, null);
    for (const neighbor of place.adjacentPlaceIds)
      assert((await facade.getPlace(neighbor)).place.adjacentPlaceIds.includes(place.id));
  }
  assert.equal(await facade.registeredScopeIds('unknown-place'), null);
  for (const block of supplementaryPlaces()) {
    assert.equal(block.propertyCount, 0);
    const search = await get(`properties?placeId=${block.id}`, parseSearchResponse);
    assert.equal(search.totalItems, 0);
    assert.deepEqual(search.items, []);
    assert.equal(
      (await get(`places/${block.id}/largest-reductions`, parseReductionsResponse)).totalItems,
      0,
    );
    await error(`places/${block.id}/largest-reductions?cursor=bad`, 400);
  }
  const addresses = [
    ...SYNTHETIC_SAO_PAULO_DATASET.listings.map((listing) => ({
      reference: listing.reference.sourceListingId,
      ...listing.listing.location,
    })),
    {
      reference: 'SYN-SP-0001',
      city: 'São Paulo',
      stateCode: 'SP',
      neighborhood: 'Bela Vista',
      street: 'Avenida Exemplo',
    },
  ];
  assert.equal(addresses.length, 10);
  // All production pool leases must be held before any lookup starts. A nested checkout
  // exhausts this pool deterministically; the correct resolver uses its own BEGIN lease.
  const transactions = new PostgresTransactionRunner(connection);
  let entered = 0;
  let releaseBarrier;
  const barrier = new Promise((resolve) => {
    releaseBarrier = resolve;
  });
  const saturated = await Promise.all(
    addresses.map(({ reference, ...address }) =>
      transactions.runInTransaction(async (transaction) => {
        entered++;
        if (entered === addresses.length) releaseBarrier();
        await barrier;
        const resolved = await facade.resolveFixtureAddress(address, transaction);
        assert(resolved, reference);
        assert.equal(resolved.breadcrumbs.length, 6);
        return { reference, resolved };
      }, AbortSignal.timeout(10000)),
    ),
  );
  assert.equal(entered, 10);
  for (const { reference, resolved } of saturated) {
    const original = addresses.find((entry) => entry.reference === reference);
    assert.deepEqual(
      resolved,
      await facade.resolvePublishedAddress({
        city: original.city,
        stateCode: original.stateCode,
        neighborhood: original.neighborhood,
        street: original.street,
      }),
    );
  }
  for (const { reference, ...address } of addresses) {
    const resolved = await facade.resolvePublishedAddress(address);
    assert(resolved, reference);
    const detail = (await get(`places/${resolved.place.id}`, parsePlaceResponse)).place;
    assert.equal(detail.block.streetName, address.street);
    assert.equal(detail.breadcrumbs[4].name.ptBR, address.neighborhood);
    const zone = SYNTHETIC_SAO_PAULO_DATASET.places.find(
      (place) => place.neighborhood === address.neighborhood,
    ).zone;
    assert.equal(detail.breadcrumbs[3].name.ptBR, `Zona ${zone}`);
    assert.equal(detail.breadcrumbs.length, 6);
    assert.deepEqual(resolved.breadcrumbs, detail.breadcrumbs);
    if (reference === 'COB-BV-001')
      assert.equal(detail.id, 'sao-paulo-vila-mariana-rua-cenario-um-fictional-block');
    for (const number of [100, 199])
      assert.equal(
        (await facade.resolvePublishedAddress({ ...address, number })).place.id,
        detail.id,
      );
    for (const number of [0, 99, 200, Number.MAX_SAFE_INTEGER])
      assert.equal(await facade.resolvePublishedAddress({ ...address, number }), null);
  }
  const address = {
    city: ' SAO  PAULO ',
    stateCode: 'sp',
    neighborhood: '  Béla  Vista ',
    street: 'AV.  Exémplo',
  };
  assert.equal(
    (await facade.resolvePublishedAddress(address)).place.id,
    'sao-paulo-bela-vista-avenida-exemplo-fictional-block',
  );
  assert.equal(
    (await facade.resolvePublishedAddress({ ...address, street: 'R. Cenario Um' })).place.id,
    'sao-paulo-bela-vista-fictional-block',
  );
  for (const invalid of [
    { ...address, complement: 'private' },
    { ...address, unitNumber: '10' },
    { ...address, number: 1.1 },
    { ...address, number: -1 },
    { ...address, street: 'Rua Um, 100' },
  ])
    await assert.rejects(facade.resolvePublishedAddress(invalid), /Invalid published/);
  for (const unknown of [
    { ...address, street: 'Exemplo' },
    { ...address, neighborhood: 'Unknown' },
    { ...address, stateCode: 'RJ' },
  ])
    assert.equal(await facade.resolvePublishedAddress(unknown), null);
  // Scoped transactions exercise real SQL integrity and ambiguity without retaining test rows.
  async function rollback(work) {
    const client = await connection.leaseClient();
    try {
      await client.query('BEGIN');
      await work(client);
    } finally {
      await client.query('ROLLBACK');
      client.release();
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
      await assert.rejects(client.query(sql));
    });
  const trimWhitespace = [
    '\u0009',
    '\u000a',
    '\u000b',
    '\u000c',
    '\u000d',
    '\u0020',
    '\u00a0',
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
    '\u200a',
    '\u2028',
    '\u2029',
    '\u202f',
    '\u205f',
    '\u3000',
    '\ufeff',
  ];
  for (const column of ['name_en', 'name_pt_br', 'street_name']) {
    for (const whitespace of [...trimWhitespace, trimWhitespace.join('')]) {
      assert.equal(whitespace.trim(), '');
      await rollback(async (client) => {
        await assert.rejects(
          client.query(`UPDATE locations.place SET ${column}=$1 WHERE public_id=$2`, [
            whitespace,
            'sao-paulo-bela-vista-fictional-block',
          ]),
        );
      });
    }
    await rollback(async (client) => {
      await assert.rejects(
        client.query(`UPDATE locations.place SET ${column}=$1 WHERE public_id=$2`, [
          'x'.repeat(201),
          'sao-paulo-bela-vista-fictional-block',
        ]),
      );
    });
    await rollback(async (client) => {
      const value = `${trimWhitespace.join('')}${'x'.repeat(200)}${trimWhitespace.join('')}`;
      await client.query(`UPDATE locations.place SET ${column}=$1 WHERE public_id=$2`, [
        value,
        'sao-paulo-bela-vista-fictional-block',
      ]);
      const scoped = new PostgresLocationsFacade({ query: (...args) => client.query(...args) });
      const detail = (await scoped.getPlace('sao-paulo-bela-vista-fictional-block')).place;
      assert.equal(
        column === 'street_name'
          ? detail.block.streetName
          : column === 'name_en'
            ? detail.name.en
            : detail.name.ptBR,
        value,
      );
    });
  }
  assert.deepEqual(
    (await get('places/sao-paulo-bela-vista-fictional-block', parsePlaceResponse)).place,
    expected.find((place) => place.id === 'sao-paulo-bela-vista-fictional-block'),
  );
  await rollback(async (client) => {
    await assert.rejects(
      client.query(
        "UPDATE locations.place SET from_number=100.5 WHERE public_id='sao-paulo-bela-vista-fictional-block'",
      ),
    );
  });
  await rollback(async (client) => {
    await client.query(`INSERT INTO locations.place (public_id,kind,name_en,name_pt_br,normalized_name,parent_id,parent_kind,sibling_order,prepared_property_count,street_name,normalized_street,from_number,to_number,block_origin)
      SELECT 'owned-second-block',kind,'Owned second block','Quarteirão de teste','owned second block',parent_id,parent_kind,20,0,street_name,normalized_street,200,299,block_origin FROM locations.place WHERE public_id='sao-paulo-bela-vista-avenida-exemplo-fictional-block'`);
    const transactional = new PostgresLocationsFacade({
      query: (...args) => client.query(...args),
    });
    assert.equal(await transactional.resolvePublishedAddress(address), null);
    assert.equal(
      (await transactional.resolvePublishedAddress({ ...address, number: 200 })).place.id,
      'owned-second-block',
    );
    await client.query(
      "UPDATE locations.place SET from_number=100 WHERE public_id='owned-second-block'",
    );
    assert.equal(await transactional.resolvePublishedAddress({ ...address, number: 150 }), null);
  });
  const columns = await connection.query(
    "SELECT column_name FROM information_schema.columns WHERE table_schema='locations'",
  );
  assert(
    !columns.some((column) => /unit|complement|query|address_number/.test(column.column_name)),
  );
  const fks = await connection.query(
    "SELECT c.confrelid::regclass::text AS target FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace WHERE n.nspname='locations' AND c.contype='f'",
  );
  assert(fks.every((row) => row.target.startsWith('locations.')));
  await compose('run', '--rm', 'migrations');
  assert.deepEqual(await identity(), before);
  await compose('restart', 'api');
  await compose('up', '--detach', '--wait', 'api');
  assert.deepEqual(await get('places', parsePlacesResponse), root);
  assert.deepEqual(await identity(), before);
  // A missing database table must surface an error; prepared memory is never a fallback.
  await connection.query('ALTER TABLE locations.place RENAME TO owned_place_unavailable');
  try {
    await error('places', 500);
    await assert.rejects(facade.roots());
  } finally {
    await connection.query('ALTER TABLE locations.owned_place_unavailable RENAME TO place');
  }
  assert.deepEqual(await get('places', parsePlacesResponse), root);
  console.log(
    `Locations integration passed (${requests} real HTTP requests, 20 persisted places, 10 addresses, 10 synchronized transaction leases, all ECMAScript trim whitespace constraints, ambiguity, migration replay, restart and fail-closed reads).`,
  );
} catch (failure) {
  await compose('logs', '--no-color', '--tail', '80', 'api', 'migrations')
    .then(({ stdout, stderr }) => process.stderr.write(`${stdout}${stderr}`))
    .catch(() => undefined);
  throw failure;
} finally {
  await connection?.close();
  await compose('down', '--volumes', '--remove-orphans');
  const containers = await run('docker', [
    'ps',
    '--all',
    '--filter',
    `label=com.docker.compose.project=${project}`,
    '--format',
    '{{.ID}}',
  ]);
  const volumes = await run('docker', [
    'volume',
    'ls',
    '--filter',
    `label=com.docker.compose.project=${project}`,
    '--format',
    '{{.Name}}',
  ]);
  assert.equal(containers.stdout.trim(), '', 'Owned containers remain');
  assert.equal(volumes.stdout.trim(), '', 'Owned volumes remain');
}
