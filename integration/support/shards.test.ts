import { glob } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';
import { accessibilityPartitions } from './accessibility-catalog.ts';
import { integrationShards } from '../shards.ts';

const accessibilityCampaign = 'integration/web-accessibility.integration.test.ts';
const shards = Object.entries<{ files: readonly string[]; testNamePattern?: string }>(
  integrationShards,
);

test('every discovered integration file runs in exactly one CI shard', async () => {
  const discovered: string[] = [];
  for await (const file of glob('integration/**/*.test.ts', {
    cwd: fileURLToPath(new URL('../..', import.meta.url)),
    exclude: ['integration/fixtures/**'],
  }))
    discovered.push(file);
  const whole = shards
    .filter(([, shard]) => shard.testNamePattern === undefined)
    .flatMap(([, shard]) => shard.files);
  expect(discovered.length).toBeGreaterThan(0);
  expect([...whole, accessibilityCampaign].sort()).toEqual(discovered.sort());
});

test('every accessibility partition runs in exactly one name-filtered CI shard', () => {
  const filtered = shards.filter(([, shard]) => shard.testNamePattern !== undefined);
  for (const [, shard] of filtered) expect(shard.files).toEqual([accessibilityCampaign]);
  for (const partition of accessibilityPartitions) {
    // Vitest matches the pattern against the suite title followed by the test title.
    const name = `accessibility owned production partition: ${partition} owned fixture preparation`;
    expect(
      filtered
        .filter(([, shard]) => new RegExp(shard.testNamePattern!).test(name))
        .map(([shard]) => shard),
      partition,
    ).toHaveLength(1);
  }
});
