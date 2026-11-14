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
// Balance: the slowest shard decides how long CI takes, so each shard targets about five minutes
// of campaigns. The estimates beside each shard are campaign seconds measured on hosted runners;
// rebalance from a real run when a shard drifts above the others.

/** `full` builds every fixture image; `web-read` only what a read-only web stack starts. */
type ImageProfile = 'full' | 'web-read';

interface IntegrationShard {
  readonly files: readonly string[];
  /** Vitest --testNamePattern; only the partitioned accessibility campaign is split by name. */
  readonly testNamePattern?: string;
  readonly images: ImageProfile;
}

const locales = ['pt-BR', 'en'] as const;
const widths = [390, 960, 1440] as const;
const campaign = (name: string) => `integration/${name}.integration.test.ts`;
const campaigns = (...names: string[]): IntegrationShard => ({
  files: names.map((name) => (name.includes('/') ? name : campaign(name))),
  images: 'full',
});
/** Exact partition names: the pattern is anchored on both sides of each name. */
const accessibility = (...partitions: string[]): IntegrationShard => ({
  files: [campaign('web-accessibility')],
  testNamePattern: `partition: (${partitions.join('|')})( |$)`,
  images: 'web-read',
});
const everyWidth = (prefix: string) => widths.map((width) => `${prefix}-${width}`);
const bothLocales = (family: string, width: number) =>
  locales.map((locale) => `${family}-${locale}-${width}`);
const retained = (locale: string, width: number) =>
  ['place', 'property', 'listing', 'privacy', 'search'].map(
    (screen) => `retained-${locale}-${screen}-${width}`,
  );

export const integrationShards = {
  // 421 s: seven checkpoint scenarios in one file.
  'ask-checkpoints': campaigns('ask-checkpoints'),
  // 345 s: thirteen model scenarios in one file.
  'ask-model': campaigns('ask-model-explanation'),
  // 312 s: delivery 197, text-price 80, contracts 35.
  'ask-delivery': campaigns('ask-delivery', 'ask-text-price-run', 'ask-contracts'),
  // 346 s: intent 144, price-run 71, run-executor 50, trace 31, headless 26, quotas 24.
  'ask-intent': campaigns(
    'ask-intent-decision',
    'ask-price-run',
    'run-executor',
    'ask-run-trace',
    'ask-headless',
    'ask-demo-quotas',
  ),
  // 306 s: ingestion 164, history 142.
  properties: campaigns('properties-ingestion', 'properties-history'),
  // 308 s: audit 89, resolution 86, suppression 55, median 44, figures 34.
  'market-resolution': campaigns(
    'audit-tracer',
    'property-resolution',
    'listing-suppression',
    'market-median',
    'market-figures',
  ),
  // 298 s: thirteen short collection, snapshot, location and contract campaigns of 7 to 29 s.
  collection: campaigns(
    'synthetic-collection',
    'listing-provenance',
    'locations',
    'image-fingerprints',
    'properties-history-upgrade',
    'source-register',
    'integration/source-register-cleanup.test.ts',
    'collection-resilience',
    'snapshot-reparse',
    'snapshot-lifecycle',
    'market-contracts',
    'properties-contracts',
    'rabbitmq-healthcheck',
  ),
  // 309 s: place 177, listing 83, property 49.
  'web-place': campaigns('web-place', 'web-listing', 'web-property'),
  // 327 s: readiness 79, privacy 75, search 71, ask-states 62, ask 40.
  'web-ask': campaigns('readiness', 'web-privacy', 'web-search', 'web-ask-states', 'web-ask'),
  // 290 s: prefix 50, system-states 45, components 40, three scheduled or market campaigns 110,
  // and the support tests 45.
  'web-support': campaigns(
    'web-prefix',
    'web-system-states',
    'web-components',
    'overview-layout',
    'resumable-collection',
    'scheduled-collection',
    'market-price-facts',
    'integration/production-config.test.ts',
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
  // The 72 accessibility partitions of one shard share one owned stack (about 35 s to start).
  // Seconds per partition on that stack: discovery 16, keyboard 18, details 26, retained 28 to 88
  // (each includes a genuine 30 s cache ageing), search 63, variants 88, adaptation 118,
  // context 120, recovery 153, subreads 165, ask 181.
  'accessibility-ask-pt': accessibility(
    'ask-pt-BR',
    'search',
    'keyboard',
    ...everyWidth('discovery-pt-BR'),
  ),
  'accessibility-ask-en': accessibility(
    'ask-en',
    ...everyWidth('discovery-en'),
    ...everyWidth('details-en'),
  ),
  'accessibility-adaptation': accessibility(
    'adaptation-pt-BR',
    'adaptation-en',
    ...everyWidth('details-pt-BR'),
  ),
  'accessibility-variants-pt': accessibility(...everyWidth('variants-pt-BR')),
  'accessibility-variants-en': accessibility(...everyWidth('variants-en')),
  'accessibility-recovery-390': accessibility(...bothLocales('recovery', 390)),
  'accessibility-recovery-960': accessibility(...bothLocales('recovery', 960)),
  'accessibility-recovery-1440': accessibility(...bothLocales('recovery', 1440)),
  'accessibility-subreads-390': accessibility(...bothLocales('subreads', 390)),
  'accessibility-subreads-960': accessibility(...bothLocales('subreads', 960)),
  'accessibility-subreads-1440': accessibility(...bothLocales('subreads', 1440)),
  'accessibility-context-pt': accessibility(...everyWidth('context-pt-BR')),
  'accessibility-context-en': accessibility(...everyWidth('context-en')),
  'accessibility-retained-pt-390': accessibility(...retained('pt-BR', 390)),
  'accessibility-retained-pt-960': accessibility(...retained('pt-BR', 960)),
  'accessibility-retained-pt-1440': accessibility(...retained('pt-BR', 1440)),
  'accessibility-retained-en-390': accessibility(...retained('en', 390)),
  'accessibility-retained-en-960': accessibility(...retained('en', 960)),
  'accessibility-retained-en-1440': accessibility(...retained('en', 1440)),
} as const satisfies Record<string, IntegrationShard>;
