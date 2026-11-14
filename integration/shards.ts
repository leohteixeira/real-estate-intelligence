// CI shard plan for the owned real-service suite (see docs/testing/integration.md).
//
// The complete serial suite needs hours on a hosted runner, so CI runs one matrix job per shard.
// Every job has its own Docker daemon and runs its files serially: many campaigns assert that the
// daemon's other containers and volumes are untouched, which only a private daemon can promise,
// so the suite is spread over more jobs rather than over parallel workers inside one job.
// integration/support/shards.test.ts proves that every discovered file, and every
// web-accessibility partition, belongs to exactly one shard.
//
// This file stays erasable TypeScript without imports: scripts/integration-shards.mjs loads it
// with plain Node before anything is installed or built.
//
// Balance: the slowest shard decides how long CI takes. A job spends about two minutes preparing
// a `web-read` shard and about three preparing a `full` one, so `full` shards carry about 240 s of
// campaigns and accessibility shards about 310 s. The numbers beside each shard are campaign
// seconds measured on hosted runners; rebalance from a real run when a shard drifts above the
// others. GitHub runs at most 40 jobs of one account at a time: 36 shards plus the three other
// long jobs stay just below that, and more shards would queue instead of saving time.

/** `full` builds every fixture image; `web-read` only what a read-only web stack starts. */
type ImageProfile = 'full' | 'web-read';

/** One serial Vitest invocation. At most one of the three name filters is set. */
interface IntegrationRun {
  readonly files: readonly string[];
  /** Vitest --testNamePattern over the partitioned accessibility campaign. */
  readonly testNamePattern?: string;
  /** Half of a long file: the tests whose title contains this text ... */
  readonly only?: string;
  /** ... and, in another shard, every test whose title does not. */
  readonly except?: string;
}

interface IntegrationShard {
  readonly runs: readonly IntegrationRun[];
  readonly images: ImageProfile;
}

const campaign = (name: string) => `integration/${name}.integration.test.ts`;
const files = (...names: string[]): IntegrationRun => ({
  files: names.map((name) => (name.includes('/') ? name : campaign(name))),
});
const only = (name: string, title: string): IntegrationRun => ({
  files: [campaign(name)],
  only: title,
});
const except = (name: string, title: string): IntegrationRun => ({
  files: [campaign(name)],
  except: title,
});
const shard = (...runs: IntegrationRun[]): IntegrationShard => ({ runs, images: 'full' });
/** Exact partition names: the pattern is anchored on both sides of each name. */
const accessibility = (...partitions: string[]): IntegrationShard => ({
  runs: [
    {
      files: [campaign('web-accessibility')],
      testNamePattern: `partition: (${partitions.join('|')})( |$)`,
    },
  ],
  images: 'web-read',
});
const partitions = (prefix: string, ...suffixes: number[]) =>
  suffixes.map((suffix) => `${prefix}-${suffix}`);
/** The four read families that pair up to about 280 s per locale and width. */
const reads = (locale: string, width: number) =>
  ['subreads', 'variants', 'details', 'discovery'].map((family) => `${family}-${locale}-${width}`);

export const integrationShards = {
  // The two longest files are split by test title; shards.test.ts proves the halves complementary.
  // 232 s: the saver scenario 206, resilience 26.
  'ask-checkpoints-saver': shard(
    only('ask-checkpoints', 'fresh Node saver'),
    files('collection-resilience'),
  ),
  // 231 s: the other six checkpoint scenarios 203, headless 28.
  'ask-checkpoints': shard(except('ask-checkpoints', 'fresh Node saver'), files('ask-headless')),
  // 235 s: the six explained campaigns 180, contracts 35, market contracts 20.
  'ask-model-campaigns': shard(
    only('ask-model-explanation', 'explained campaign'),
    files('ask-contracts', 'market-contracts'),
  ),
  // 239 s: the other eight model scenarios 193, quotas 27, properties contracts 19.
  'ask-model': shard(
    except('ask-model-explanation', 'explained campaign'),
    files('ask-demo-quotas', 'properties-contracts'),
  ),
  // 231 s: delivery 208, snapshot lifecycle 23.
  'ask-delivery': shard(files('ask-delivery', 'snapshot-lifecycle')),
  // 248 s: intent 167, run-executor 54, reparse 27.
  'ask-intent': shard(files('ask-intent-decision', 'run-executor', 'snapshot-reparse')),
  // 223 s: place 213, RabbitMQ healthcheck 10.
  'web-place': shard(files('web-place', 'rabbitmq-healthcheck')),
  // 226 s: ingestion 170, property 56.
  'properties-ingestion': shard(files('properties-ingestion', 'web-property')),
  // 234 s: history 153, text-price 81.
  'properties-history': shard(files('properties-history', 'ask-text-price-run')),
  // 236 s: resolution 104, audit 95, trace 37.
  'property-resolution': shard(files('property-resolution', 'audit-tracer', 'ask-run-trace')),
  // 236 s: listing 94, readiness 88, prefix 54.
  'web-listing': shard(files('web-listing', 'readiness', 'web-prefix')),
  // 229 s: search 81, privacy 75, price-run 73.
  'web-search': shard(files('web-search', 'web-privacy', 'ask-price-run')),
  // 222 s: ask-states 63, suppression 59, price facts 49, system states 47, two short files 4.
  'web-states': shard(
    files(
      'web-ask-states',
      'listing-suppression',
      'market-price-facts',
      'web-system-states',
      'overview-layout',
      'integration/production-config.test.ts',
    ),
  ),
  // 245 s: median 46, resumable 41, ask 41, figures 41, scheduled 40, components 36.
  market: shard(
    files(
      'market-median',
      'resumable-collection',
      'web-ask',
      'market-figures',
      'scheduled-collection',
      'web-components',
    ),
  ),
  // 219 s: six collection and location campaigns of 28 to 31 s, the support tests 42.
  collection: shard(
    files(
      'synthetic-collection',
      'source-register',
      'integration/source-register-cleanup.test.ts',
      'locations',
      'listing-provenance',
      'properties-history-upgrade',
      'image-fingerprints',
      'integration/support/accessibility-browser.test.ts',
      'integration/support/accessibility-catalog.test.ts',
      'integration/support/accessibility-evidence.test.ts',
      'integration/support/accessibility-fault.test.ts',
      'integration/support/accessibility-references.test.ts',
      'integration/support/accessibility-steps.test.ts',
      'integration/support/ask-attempt.test.ts',
      'integration/support/ask-campaign.test.ts',
      'integration/support/convention.test.ts',
      'integration/support/fixture.test.ts',
      'integration/support/http.test.ts',
      'integration/support/property-capture.test.ts',
      'integration/support/search-campaign.test.ts',
      'integration/support/shards.test.ts',
    ),
  ),
  // The accessibility partitions of one shard share one owned stack, which takes about 38 s to
  // start. Seconds per partition on a started stack: discovery 17, keyboard 21, details 27,
  // search 68, variants 86, context 115, adaptation 121, recovery 150, subreads 150, ask 190;
  // retained search 26, privacy 45, listing 61, place 77, property 84 (each but search includes a
  // genuine 30 s cache ageing). Every shard below sums to between 250 and 295 s.
  'accessibility-ask-pt': accessibility(
    'ask-pt-BR',
    ...partitions('retained-pt-BR-search', 390, 960, 1440),
  ),
  'accessibility-ask-en': accessibility(
    'ask-en',
    ...partitions('retained-en-search', 390, 960, 1440),
  ),
  'accessibility-faults-pt-390': accessibility('recovery-pt-BR-390', 'context-pt-BR-390'),
  'accessibility-faults-pt-960': accessibility('recovery-pt-BR-960', 'context-pt-BR-960'),
  'accessibility-faults-pt-1440': accessibility('recovery-pt-BR-1440', 'context-pt-BR-1440'),
  'accessibility-faults-en-390': accessibility('recovery-en-390', 'context-en-390'),
  'accessibility-faults-en-960': accessibility('recovery-en-960', 'context-en-960'),
  'accessibility-faults-en-1440': accessibility('recovery-en-1440', 'context-en-1440'),
  'accessibility-reads-pt-390': accessibility(...reads('pt-BR', 390)),
  'accessibility-reads-pt-960': accessibility(...reads('pt-BR', 960)),
  'accessibility-reads-pt-1440': accessibility(...reads('pt-BR', 1440)),
  'accessibility-reads-en-390': accessibility(...reads('en', 390)),
  'accessibility-reads-en-960': accessibility(...reads('en', 960)),
  'accessibility-reads-en-1440': accessibility(...reads('en', 1440)),
  'accessibility-adaptation-pt': accessibility(
    'adaptation-pt-BR',
    ...partitions('retained-pt-BR-place', 390, 960),
  ),
  'accessibility-adaptation-en': accessibility(
    'adaptation-en',
    ...partitions('retained-en-place', 390, 960),
  ),
  'accessibility-retained-property-pt': accessibility(
    'keyboard',
    ...partitions('retained-pt-BR-property', 390, 960, 1440),
  ),
  'accessibility-retained-property-en': accessibility(
    ...partitions('retained-en-property', 390, 960, 1440),
  ),
  'accessibility-retained-listing': accessibility(
    ...partitions('retained-pt-BR-listing', 390, 960, 1440),
    'retained-en-listing-390',
    'retained-pt-BR-privacy-390',
  ),
  'accessibility-retained-wide': accessibility(
    ...partitions('retained-en-listing', 960, 1440),
    'retained-pt-BR-place-1440',
    'retained-en-place-1440',
  ),
  'accessibility-retained-privacy': accessibility(
    'search',
    ...partitions('retained-pt-BR-privacy', 960, 1440),
    ...partitions('retained-en-privacy', 390, 960, 1440),
  ),
} as const satisfies Record<string, IntegrationShard>;
