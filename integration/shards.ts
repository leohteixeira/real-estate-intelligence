// CI shard plan for the owned real-service suite (see docs/testing/integration.md).
//
// The complete serial suite needs several hours on a hosted runner, so CI runs one matrix job per
// shard. Every shard prepares the same compiled workspaces and fixture images, then runs its files
// serially. integration/support/shards.test.ts proves that every discovered file, and every
// web-accessibility partition, belongs to exactly one shard.
//
// This file stays erasable TypeScript without imports: scripts/integration-shards.mjs loads it
// with plain Node before anything is installed or built.
//
// Balance: each shard targets at most ~30 minutes of campaigns on a hosted runner (plus ~8 minutes
// of install, build and image preparation) inside the 75-minute job limit. The estimates beside
// each shard are campaign durations measured locally and in earlier CI runs, scaled for a hosted
// runner; rebalance from a real run when a shard drifts towards the limit.

interface IntegrationShard {
  readonly files: readonly string[];
  /** Vitest --testNamePattern; only the partitioned accessibility campaign is split by name. */
  readonly testNamePattern?: string;
}

const campaign = (name: string) => `integration/${name}.integration.test.ts`;
const accessibility = (partitions: string): IntegrationShard => ({
  files: [campaign('web-accessibility')],
  testNamePattern: `partition: (${partitions})`,
});

export const integrationShards = {
  // ~23 min: checkpoints 8, delivery 4, text-price 5, price-run 2, contracts 2, run-executor 2.
  'ask-runtime': {
    files: [
      campaign('ask-checkpoints'),
      campaign('ask-delivery'),
      campaign('ask-price-run'),
      campaign('ask-text-price-run'),
      campaign('ask-contracts'),
      campaign('run-executor'),
    ],
  },
  // ~16 min: model-explanation 11, intent-decision 3, the three prepared-image campaigns 2.
  'ask-model': {
    files: [
      campaign('ask-model-explanation'),
      campaign('ask-intent-decision'),
      campaign('ask-run-trace'),
      campaign('ask-headless'),
      campaign('ask-demo-quotas'),
    ],
  },
  // ~29 min: collection 10, properties 15, market 4.
  'data-pipelines': {
    files: [
      campaign('synthetic-collection'),
      campaign('resumable-collection'),
      campaign('scheduled-collection'),
      campaign('collection-resilience'),
      campaign('snapshot-lifecycle'),
      campaign('snapshot-reparse'),
      campaign('source-register'),
      'integration/source-register-cleanup.test.ts',
      campaign('image-fingerprints'),
      campaign('audit-tracer'),
      campaign('rabbitmq-healthcheck'),
      campaign('properties-history'),
      campaign('properties-history-upgrade'),
      campaign('properties-ingestion'),
      campaign('properties-contracts'),
      campaign('property-resolution'),
      campaign('listing-provenance'),
      campaign('listing-suppression'),
      campaign('locations'),
      campaign('market-contracts'),
      campaign('market-figures'),
      campaign('market-median'),
      campaign('market-price-facts'),
    ],
  },
  // ~28 min: place 6, ask 3, ask-states 3, listing 2, privacy 2, search 2, prefix 2, the rest 8.
  'web-journeys': {
    files: [
      campaign('web-place'),
      campaign('web-search'),
      campaign('web-property'),
      campaign('web-listing'),
      campaign('web-ask'),
      campaign('web-ask-states'),
      campaign('web-components'),
      campaign('web-prefix'),
      campaign('web-privacy'),
      campaign('web-system-states'),
      campaign('overview-layout'),
      campaign('readiness'),
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
    ],
  },
  // The 72 accessibility partitions each own a fresh stack: ~1 to ~5 minutes apiece.
  // ~28 min: 6 discovery, search, keyboard, 6 details, 2 ask.
  'accessibility-entry': accessibility('discovery-|search( |$)|keyboard|details-|ask-'),
  // ~30 min: 6 recovery partitions of ~5 min.
  'accessibility-recovery': accessibility('recovery-'),
  // ~25 min each: 10 retained partitions (two locales, five screens) per width.
  'accessibility-retained-390': accessibility('retained-\\S+-390( |$)'),
  'accessibility-retained-960': accessibility('retained-\\S+-960( |$)'),
  'accessibility-retained-1440': accessibility('retained-\\S+-1440( |$)'),
  // ~31 min: 6 subread partitions of ~5 min.
  'accessibility-subreads': accessibility('subreads-'),
  // ~22 min: 6 context partitions of ~3.5 min.
  'accessibility-context': accessibility('context-'),
  // ~28 min: 6 variant partitions of ~3 min and 2 adaptation partitions of ~4.5 min.
  'accessibility-variants': accessibility('variants-|adaptation-'),
} as const satisfies Record<string, IntegrationShard>;
