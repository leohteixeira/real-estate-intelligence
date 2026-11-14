import { glob } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';
import { accessibilityPartitions } from './accessibility-catalog.ts';
import { integrationShards } from '../shards.ts';

interface Run {
  files: readonly string[];
  testNamePattern?: string;
  only?: string;
  except?: string;
}
const accessibilityCampaign = 'integration/web-accessibility.integration.test.ts';
const runs = Object.entries<{ runs: readonly Run[] }>(integrationShards).flatMap(
  ([shard, { runs }]) => runs.map((run) => ({ shard, ...run })),
);
const whole = runs.filter(
  (run) => run.testNamePattern === undefined && run.only === undefined && run.except === undefined,
);
const halves = runs.filter((run) => run.only !== undefined || run.except !== undefined);

test('every discovered integration file runs in exactly one CI shard', async () => {
  const discovered: string[] = [];
  for await (const file of glob('integration/**/*.test.ts', {
    cwd: fileURLToPath(new URL('../..', import.meta.url)),
    exclude: ['integration/fixtures/**'],
  }))
    discovered.push(file);
  // A file split by title counts once: its two halves are proved complementary below.
  const split = [...new Set(halves.flatMap((run) => run.files))];
  expect(discovered.length).toBeGreaterThan(0);
  expect([...whole.flatMap((run) => run.files), ...split, accessibilityCampaign].sort()).toEqual(
    discovered.sort(),
  );
});

test('a file split by test title runs as exactly one pair of complementary halves', () => {
  for (const run of halves) {
    // A name filter applies to every file of its Vitest run, so a half is one file alone.
    expect(run.files, run.shard).toHaveLength(1);
    expect(run.testNamePattern, run.shard).toBeUndefined();
    expect(run.only === undefined, run.shard).not.toBe(run.except === undefined);
  }
  for (const file of new Set(halves.flatMap((run) => run.files))) {
    const pair = halves.filter((run) => run.files[0] === file);
    expect(pair, file).toHaveLength(2);
    const text = pair.map((run) => run.only).find((title) => title !== undefined);
    expect(text, file).toBeTruthy();
    // "contains the text" and "does not contain the text" cover every title exactly once.
    expect(pair.map((run) => run.except).filter((title) => title !== undefined)).toEqual([text]);
  }
});

test('every accessibility partition runs in exactly one name-filtered CI shard', () => {
  const filtered = runs.filter((run) => run.testNamePattern !== undefined);
  for (const run of filtered) expect(run.files, run.shard).toEqual([accessibilityCampaign]);
  for (const partition of accessibilityPartitions) {
    // Vitest matches the pattern against the suite title followed by the test title: a
    // single-test partition ends at its name, a stepped one continues with each step.
    const title = `accessibility owned production partition: ${partition}`;
    const owners = (name: string) =>
      filtered.filter((run) => new RegExp(run.testNamePattern!).test(name)).map((run) => run.shard);
    expect(owners(title), partition).toHaveLength(1);
    expect(owners(`${title} owned fixture preparation`), partition).toEqual(owners(title));
  }
});
