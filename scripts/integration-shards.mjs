import { spawnSync } from 'node:child_process';
import { integrationShards } from '../integration/shards.ts';

// CI entry point for the shard plan in integration/shards.ts.
//   node scripts/integration-shards.mjs matrix      -> GitHub Actions matrix JSON
//   node scripts/integration-shards.mjs run <name>  -> the serial Vitest run of one shard
const [command, name] = process.argv.slice(2);

if (command === 'matrix') {
  // `images` names the fixture image profile scripts/prepare-integration-images.sh builds.
  const include = Object.entries(integrationShards).map(([shard, { images }]) => ({
    shard,
    images,
  }));
  process.stdout.write(`${JSON.stringify({ include })}\n`);
} else if (command === 'run' && name !== undefined && Object.hasOwn(integrationShards, name)) {
  const { files, testNamePattern } = integrationShards[name];
  const result = spawnSync(
    'pnpm',
    [
      'exec',
      'vitest',
      'run',
      '--config',
      'vitest.integration.config.ts',
      ...files,
      ...(testNamePattern === undefined ? [] : ['--testNamePattern', testNamePattern]),
    ],
    { stdio: 'inherit' },
  );
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} else {
  process.stderr.write(
    `Usage: integration-shards.mjs matrix | run <${Object.keys(integrationShards).join('|')}>\n`,
  );
  process.exitCode = 2;
}
