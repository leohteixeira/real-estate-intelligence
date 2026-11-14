import { spawnSync } from 'node:child_process';
import { integrationShards } from '../integration/shards.ts';

// CI entry point for the shard plan in integration/shards.ts.
//   node scripts/integration-shards.mjs matrix      -> GitHub Actions matrix JSON
//   node scripts/integration-shards.mjs run <name>  -> the serial Vitest runs of one shard
const [command, name] = process.argv.slice(2);

const literal = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// `only` and `except` over the same text are exact complements for every test title, which is
// what lets integration/support/shards.test.ts prove a split file without listing its tests.
const namePattern = ({ testNamePattern, only, except }) =>
  testNamePattern ??
  (only === undefined
    ? except === undefined
      ? undefined
      : `^(?!.*${literal(except)})`
    : literal(only));

if (command === 'matrix') {
  // `images` names the fixture image profile scripts/prepare-integration-images.sh builds.
  const include = Object.entries(integrationShards).map(([shard, { images }]) => ({
    shard,
    images,
  }));
  process.stdout.write(`${JSON.stringify({ include })}\n`);
} else if (command === 'run' && name !== undefined && Object.hasOwn(integrationShards, name)) {
  // Every run is attempted, so one failing run does not hide the campaigns after it.
  for (const run of integrationShards[name].runs) {
    const pattern = namePattern(run);
    const result = spawnSync(
      'pnpm',
      [
        'exec',
        'vitest',
        'run',
        '--config',
        'vitest.integration.config.ts',
        ...run.files,
        ...(pattern === undefined ? [] : ['--testNamePattern', pattern]),
      ],
      { stdio: 'inherit' },
    );
    if (result.error) throw result.error;
    if (result.status !== 0) process.exitCode = result.status ?? 1;
  }
} else {
  process.stderr.write(
    `Usage: integration-shards.mjs matrix | run <${Object.keys(integrationShards).join('|')}>\n`,
  );
  process.exitCode = 2;
}
