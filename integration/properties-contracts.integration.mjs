import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:net';
import { promisify } from 'node:util';
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

const run = promisify(execFile);
const project = `rei-properties-${process.pid}-${randomUUID().slice(0, 8)}`;
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
async function compose(...args) {
  return run('docker', ['compose', '--file', 'compose.yaml', '--project-name', project, ...args], {
    cwd: new URL('..', import.meta.url),
    env: environment,
    timeout: 240000,
    maxBuffer: 10 * 1024 * 1024,
  });
}
async function releasePorts() {
  await Promise.all(reservations.map((server) => new Promise((resolve) => server.close(resolve))));
}
const base = `http://127.0.0.1:${apiPort}`;
let requests = 0;
async function get(path, parser) {
  const response = await fetch(`${base}/api/v1/${path}`, { signal: AbortSignal.timeout(5000) });
  requests++;
  assert.equal(response.status, 200, path);
  const body = parser(await response.json());
  assert.equal(body.metadata.dataMode, 'synthetic-stub');
  if (parser === parseReductionsResponse) {
    assert.equal(body.metadata.fixtureVersion, 'persisted-synthetic-reductions-v1');
    assert(Number.isFinite(Date.parse(body.metadata.asOf)));
  } else assert.equal(body.metadata.asOf, '2026-10-01T12:00:00.000Z');
  return body;
}
const failureIds = new Set();
async function error(path, status, prefixed = true) {
  const response = await fetch(`${base}${prefixed ? '/api/v1' : ''}/${path}`, {
    headers: { 'x-request-id': 'client-controlled' },
    signal: AbortSignal.timeout(5000),
  });
  requests++;
  assert.equal(response.status, status, path);
  assert.match(response.headers.get('content-type') ?? '', /^application\/json/, path);
  const body = await response.json();
  assert.deepEqual(Object.keys(body), ['error']);
  assert.deepEqual(Object.keys(body.error).sort(), ['code', 'message', 'requestId']);
  assert.equal(body.error.code, status === 400 ? 'bad_request' : 'not_found');
  assert.equal(
    body.error.message,
    status === 400
      ? 'The request could not be processed.'
      : 'The requested resource was not found.',
  );
  assert.equal(body.error.requestId, response.headers.get('x-request-id'));
  assert.notEqual(body.error.requestId, 'client-controlled');
  assert(!failureIds.has(body.error.requestId));
  failureIds.add(body.error.requestId);
}
async function unchangedCounts(connection) {
  const rows = await connection.query(
    'SELECT (SELECT count(*) FROM collection.collection_run)::integer AS runs, (SELECT count(*) FROM collection.raw_object)::integer AS snapshots, (SELECT count(*) FROM platform.outbox)::integer AS events',
  );
  return rows[0];
}
let connection;
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
  assert.equal(roots.items[0].propertyCount, 5);
  const zones = await get('places/sao-paulo/children', parsePlacesResponse);
  assert.equal(zones.items.length, 5);
  const neighborhoods = await get('places/sao-paulo-centro/children', parsePlacesResponse);
  const placeId = neighborhoods.items[0].id;
  const place = await get(`places/${placeId}`, parsePlaceResponse);
  assert.deepEqual(
    place.place.breadcrumbs.map((crumb) => crumb.id),
    ['brazil', 'sao-paulo-state', 'sao-paulo', 'sao-paulo-centro', placeId],
  );
  const search = await get(`properties?placeId=${placeId}`, parseSearchResponse);
  assert.equal(search.totalItems, 1);
  const property = await get(`properties/${search.items[0].id}`, parsePropertyResponse);
  assert.equal(property.property.listings.length, 3);
  assert.equal(property.property.summary.askingPrice.minorUnits, 78000000);
  assert.equal(property.property.sale.status, 'not-recorded');
  assert.equal(property.property.priceChanges.length, 2);
  assert.equal(property.property.preparedEvidence.productionMatchScore, null);
  assert.equal(property.property.preparedEvidence.illustrativeProbability, 0.95);
  assert.equal(property.property.preparedEvidence.probabilityBasis, 'prepared-not-calibrated');
  assert(
    property.property.preparedEvidence.reasons.some(
      (reason) => reason.type === 'published-neighborhood-disagreement',
    ),
  );
  assert(property.property.sourceAgreement.find((entry) => entry.field === 'propertyType').agrees);
  assert.deepEqual(
    property.property.featureAgreement.find((entry) => entry.feature === 'balcony'),
    {
      feature: 'balcony',
      reportingCount: 3,
      reportingPercent: 100,
      listingIds: property.property.listings.map((listing) => listing.id),
      sourceIds: property.property.listings.map((listing) => listing.source.sourceId),
    },
  );
  assert.deepEqual(
    property.property.priceChanges.map((change) => change.changePercent),
    [-200 / 82, -2.5],
  );
  let picker = roots;
  for (const [kind, id] of [
    ['country', 'brazil'],
    ['state', 'sao-paulo-state'],
    ['city', 'sao-paulo'],
    ['zone', 'sao-paulo-centro'],
    ['neighborhood', 'sao-paulo-bela-vista'],
    ['street-block', 'sao-paulo-bela-vista-fictional-block'],
  ]) {
    const current = picker.items.find((place) => place.id === id);
    assert.equal(current.kind, kind);
    assert.deepEqual((await get(`places/${id}`, parsePlaceResponse)).place, current);
    assert.equal(
      (await get(`properties?placeId=${id}`, parseSearchResponse)).totalItems,
      current.propertyCount,
    );
    if (kind === 'street-block') {
      assert.equal(current.breadcrumbs.length, 6);
      assert.deepEqual(current.block, {
        streetName: 'Rua Cenário Um',
        fromNumber: 100,
        toNumber: 199,
        origin: 'prepared-fixture',
      });
      assert.deepEqual(current.coordinates, { latitude: -23.55, longitude: -46.63 });
      assert.equal(property.property.summary.place.id, id);
      assert(property.property.listings.every((listing) => listing.place.id === id));
    } else {
      assert.equal(current.coordinates, null);
      assert.equal(current.block, null);
    }
    picker = await get(`places/${id}/children`, parsePlacesResponse);
  }
  assert.deepEqual(picker.items, []);
  for (const grouped of property.property.listings) {
    const listing = await get(`listings/${grouped.id}`, parseListingResponse);
    assert.deepEqual(listing.listing, grouped);
  }
  const reductions = await get(`places/${placeId}/largest-reductions`, parseReductionsResponse);
  assert.deepEqual(reductions.items, []);
  assert.equal(reductions.totalItems, 0);
  assert.equal(reductions.nextCursor, null);
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
  ];
  for (const [query, count] of filterCases) {
    const page = await get(`properties?${query}`, parseSearchResponse);
    assert.equal(page.totalItems, count, query);
    if (query.startsWith('pageSize=1.')) assert.equal(page.items.length, 1);
    if (!count) assert.equal(page.medianPricePerSquareMeter, null);
  }
  for (const sort of PROPERTY_SORTS) {
    const full = await get(`properties?sort=${sort}`, parseSearchResponse);
    const ids = [];
    let cursor;
    do {
      const page = await get(
        `properties?sort=${sort}&pageSize=1${cursor ? `&cursor=${cursor}` : ''}`,
        parseSearchResponse,
      );
      assert.equal(page.totalItems, 5);
      assert.equal(page.medianPricePerSquareMeter, full.medianPricePerSquareMeter);
      ids.push(page.items[0].id);
      cursor = page.nextCursor;
    } while (cursor);
    assert.deepEqual(
      ids,
      full.items.map((item) => item.id),
    );
    assert.equal(new Set(ids).size, 5);
  }
  const vm = await get(`properties/${syntheticReadId(4)}`, parsePropertyResponse);
  assert.equal(
    vm.property.listings.find((listing) => listing.source.sourceListingId === 'COB-VM-001').lifeline
      .length,
    2,
  );
  for (const path of [
    `listings/${SUPPLEMENTARY_LISTING_IDS.deniedText}`,
    `properties/${SUPPLEMENTARY_PROPERTY_IDS.deniedText}`,
  ]) {
    const denied = await get(
      path,
      path.startsWith('listings') ? parseListingResponse : parsePropertyResponse,
    );
    assert(
      !/quiet bedrooms|renovated living room|"text"|"current"|"versions"|excerpt/.test(
        JSON.stringify(denied),
      ),
    );
  }
  const expired = await get(
    `listings/${SUPPLEMENTARY_LISTING_IDS.expiredSnapshot}`,
    parseListingResponse,
  );
  assert.equal(expired.listing.snapshot.availability, 'expired');
  assert.match(expired.listing.provenance.contentHash, /^sha256:/);
  const inactive = await get(
    `properties/${SUPPLEMENTARY_PROPERTY_IDS.noActiveListings}`,
    parsePropertyResponse,
  );
  assert.equal(inactive.property.summary.askingPrice, null);
  assert.equal(inactive.property.summary.bedrooms, null);
  assert.equal(inactive.property.sale.status, 'not-recorded');
  assert.equal(
    (await get('places/sao-paulo-oeste/largest-reductions', parseReductionsResponse)).totalItems,
    0,
  );
  assert.deepEqual(
    (await get(`places/${placeId}-fictional-block/children`, parsePlacesResponse)).items,
    [],
  );
  const allReductions = await get('places/sao-paulo/largest-reductions', parseReductionsResponse);
  assert.deepEqual(allReductions.items, []);
  assert.equal(allReductions.totalItems, 0);
  for (const pageSize of [1, 20]) {
    const page = await get(
      `places/sao-paulo/largest-reductions?pageSize=${pageSize}`,
      parseReductionsResponse,
    );
    assert.equal(page.totalItems, 0);
    assert.deepEqual(page.items, []);
    assert.equal(page.nextCursor, null);
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
  await error(`properties?pageSize=1&placeId=sao-paulo-centro&cursor=${page.nextCursor}`, 400);
  await error(`places/sao-paulo/largest-reductions?pageSize=1&cursor=${page.nextCursor}`, 400);
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
  assert.deepEqual(
    await unchangedCounts(connection),
    before,
    'Read journey changed collection or outbox state',
  );
  console.log(
    `Properties contracts integration passed (${requests} real HTTP requests; collection and outbox unchanged).`,
  );
} finally {
  await connection?.close();
  await compose('down', '--volumes', '--remove-orphans');
}
