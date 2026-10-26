import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import {
  parseEnabledSourcesResponse,
  parseListingResponse,
  parsePropertyResponse,
  parseSearchResponse,
} from '../../packages/contracts/dist/index.js';
import { SYNTHETIC_SAO_PAULO_DATASET as catalog } from '../../packages/infrastructure/dist/collection/synthetic-sao-paulo.dataset.js';
import { requestHttp } from '../support/http.ts';

const base = 'https://leohteixeira.com/real-estate-intelligence';
const output = process.argv[2];
if (!output) throw new Error('Supply an evidence JSON output path.');
const captures: { path: string; observedAt: string; body: unknown }[] = [];
async function read<T>(path: string, parse: (value: unknown) => T): Promise<T> {
  const response = await requestHttp(`${base}/api/v1/${path}`);
  if (response.status !== 200) throw new Error(`${path}: HTTP ${response.status}`);
  const body = await response.json();
  captures.push({ path, observedAt: new Date().toISOString(), body });
  return parse(body);
}
const sources = await read('collection/sources', parseEnabledSourcesResponse);
const search = await read('properties?pageSize=20', parseSearchResponse);
if (search.totalItems !== 5 || search.items.length !== 5 || search.nextCursor !== null)
  throw new Error('Expected five persisted groups in one complete search page.');
if (search.metadata.fixtureVersion !== 'persisted-synthetic-search-v1')
  throw new Error('Search must identify persisted synthetic data.');
// Snapshot-bound acceptance: Story 2.12 records these native runs and the removal clock.
const scheduledRuns: Readonly<Record<string, string>> = {
  'synthetic-portal-aurora': '01a179c8-06d9-72dd-a956-124d420b3572',
  'synthetic-portal-brisa': '01a179c8-a447-7bfa-be78-d7db82f51ab7',
  'synthetic-portal-cobalto': '01a179c8-f2a3-7c04-89ec-75a1f0e16202',
};
const properties = [];
for (const item of search.items)
  properties.push((await read(`properties/${item.id}`, parsePropertyResponse)).property);
const listings = [];
for (const property of properties)
  for (const embedded of property.listings)
    listings.push((await read(`listings/${embedded.id}`, parseListingResponse)).listing);
await writeFile(
  output,
  JSON.stringify({ base, sources, search, properties, listings, captures }, null, 2),
);
if (listings.length !== 9 || new Set(listings.map((listing) => listing.id)).size !== 9)
  throw new Error('Expected exactly nine distinct persisted listings.');
const grouped = properties.filter((property) => property.listings.length === 3);
if (grouped.length !== 1) throw new Error('Expected one three-listing group.');
const group = grouped[0]!;
if (
  group.listings
    .map((listing) => listing.source.sourceListingId)
    .sort()
    .join(',') !== 'AUR-BV-001,BRI-BV-001,COB-BV-001'
)
  throw new Error('Three-listing group does not match catalog identities.');
if (
  group.preparedEvidence.kind !== 'deterministic-rule' ||
  (group.preparedEvidence.productionMatchScore ?? 0) < 0.9 ||
  group.preparedEvidence.reasons.length === 0 ||
  group.summary.askingPrice?.minorUnits !== 78_000_000 ||
  group.summary.askingPrice.provenance.sourceListingId !== 'AUR-BV-001' ||
  group.sale.status !== 'not-recorded'
)
  throw new Error('Missing genuine rule evidence, asking minimum, provenance or sale disclaimer.');
if (
  group.priceChanges
    .map((change) => `${change.effectiveAt}:${change.currentMinorUnits}`)
    .join(',') !== '2026-01-01T12:00:00.000Z:80000000,2026-07-01T12:00:00.000Z:78000000'
)
  throw new Error('Property reductions differ from original January/July catalog changes.');
for (const listing of listings) {
  const observations = catalog.runs.flatMap((run) =>
    run.observations.filter((row) => row.sourceListingId === listing.source.sourceListingId),
  );
  const first = observations[0]!;
  const last = observations.at(-1)!;
  const owner = properties.find((property) => property.summary.id === listing.propertyId);
  if (!owner?.listings.some((embedded) => JSON.stringify(embedded) === JSON.stringify(listing)))
    throw new Error('Listing and property endpoints disagree about current membership/detail.');
  if (
    listing.collectionCount !== observations.length + 1 ||
    listing.provenance.runId !== scheduledRuns[listing.source.sourceId] ||
    listing.firstCollectedAt !== first.observedAt ||
    listing.lastCollectedAt !== last.observedAt ||
    listing.askingPriceMinorUnits !== last.listing.askingPriceMinorUnits ||
    listing.provenance.sourceListingId !== last.sourceListingId ||
    listing.provenance.sourceId !== last.sourceId ||
    listing.provenance.sourceUrl !== last.sourceUrl ||
    listing.provenance.observedAt !== last.observedAt ||
    listing.snapshot.availability !== 'available'
  )
    throw new Error(`Catalog acquisition/provenance mismatch: ${listing.source.sourceListingId}`);
  const source = sources.sources.find((item) => item.sourceId === listing.source.sourceId);
  if (
    !source?.permissions.listingTextDisplayAllowed ||
    listing.description.permission !== 'allowed'
  )
    throw new Error('Authorized synthetic description was denied or source rights differ.');
  if (listing.description.current !== last.listing.maskedDescription)
    throw new Error('Permitted current description differs from catalog.');
  const priceRows = observations.filter(
    (row, index) =>
      index === 0 ||
      row.listing.askingPriceMinorUnits !== observations[index - 1]!.listing.askingPriceMinorUnits,
  );
  const descriptionRows = observations.filter(
    (row, index) =>
      index === 0 ||
      row.listing.maskedDescription !== observations[index - 1]!.listing.maskedDescription,
  );
  const expectedPrices = priceRows.slice(1).map((row, index) => ({
    effectiveAt: row.observedAt,
    previousMinorUnits: priceRows[index]!.listing.askingPriceMinorUnits,
    currentMinorUnits: row.listing.askingPriceMinorUnits,
  }));
  const actualPrices = listing.history
    .filter((event) => event.type === 'price-changed')
    .map(({ effectiveAt, previousMinorUnits, currentMinorUnits }) => ({
      effectiveAt,
      previousMinorUnits,
      currentMinorUnits,
    }));
  const expectedVersions = descriptionRows.map((row) => ({
    effectiveAt: row.observedAt,
    text: row.listing.maskedDescription,
    contentHash: `sha256:${createHash('sha256').update(row.listing.maskedDescription!).digest('hex')}`,
  }));
  const expectedDescriptions = expectedVersions.slice(1).map((row, index) => ({
    effectiveAt: row.effectiveAt,
    beforeHash: expectedVersions[index]!.contentHash,
    afterHash: row.contentHash,
  }));
  const actualDescriptions = listing.history
    .filter((event) => event.type === 'description-changed')
    .map(({ effectiveAt, beforeHash, afterHash }) => ({ effectiveAt, beforeHash, afterHash }));
  if (
    JSON.stringify(actualPrices) !== JSON.stringify(expectedPrices) ||
    JSON.stringify(actualDescriptions) !== JSON.stringify(expectedDescriptions) ||
    JSON.stringify(listing.description.versions) !== JSON.stringify(expectedVersions)
  )
    throw new Error(
      'Original price/description history or permitted versions differ from catalog.',
    );
  if (
    listing.fieldEffectiveAt.askingPrice !== priceRows.at(-1)!.observedAt ||
    listing.fieldEffectiveAt.description !== descriptionRows.at(-1)!.observedAt ||
    listing.fieldEffectiveAt.attributes !== first.observedAt
  )
    throw new Error('Field-effective dates differ from original catalog transitions.');
  const expectedHistoryCount =
    1 +
    expectedPrices.length +
    expectedDescriptions.length +
    (listing.source.sourceListingId === 'COB-VM-001' ? 2 : 0);
  if (
    listing.history.length !== expectedHistoryCount ||
    listing.history[0]?.type !== 'created' ||
    listing.history[0].effectiveAt !== first.observedAt
  )
    throw new Error('Creation/history count differs; scheduled no-op must not invent events.');
}
const returned = listings.find((listing) => listing.source.sourceListingId === 'COB-VM-001')!;
if (
  returned.history
    .filter((event) => event.type === 'removed' || event.type === 'reappeared')
    .map((event) => `${event.type}:${event.effectiveAt}`)
    .join(',') !== 'removed:2026-10-26T19:54:27.864Z,reappeared:2026-06-01T12:00:00.000Z'
)
  throw new Error('Missing authentic removal/reappearance history.');
console.log(
  JSON.stringify({
    result: 'passed',
    groups: 5,
    listings: 9,
    propertyId: group.summary.id,
    captures: captures.length,
    output,
  }),
);
