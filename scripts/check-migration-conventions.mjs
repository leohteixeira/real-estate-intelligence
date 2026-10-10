import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { URL } from 'node:url';

const MIGRATION_BLOCKS = Object.freeze({
  platform: [0, 999],
  properties: [1000, 1999],
  market: [2000, 2999],
  comparables: [3000, 3999],
  collection: [4000, 4999],
  locations: [5000, 5999],
  ask: [6000, 6999],
  alerts: [7000, 7999],
  audit: [8000, 8999],
  identity: [9000, 9999],
});
const migrationPattern =
  /^(?<number>\d{4})_(?<context>[a-z]+)_(?<description>[a-z][a-z0-9]*(?:_[a-z0-9]+)*)\.sql$/;
const migrationDirectory = new URL('../migrations/', import.meta.url);
const migrationReadme = new URL('../migrations/README.md', import.meta.url);
const invalidBlockFixture = new URL(
  '../test-fixtures/migrations/invalid-number-block.txt',
  import.meta.url,
);

function parseDocumentedMigrationBlocks(readme) {
  const blocks = {};
  const rowPattern =
    /^\|\s*`(?<minimum>\d{4})[–-](?<maximum>\d{4})`\s*\|\s*`(?<context>[a-z]+)`\s*\|$/gm;

  for (const match of readme.matchAll(rowPattern)) {
    const { context, maximum, minimum } = match.groups;
    if (Object.hasOwn(blocks, context)) {
      throw new Error(`migrations/README.md documents the "${context}" allocation more than once`);
    }
    blocks[context] = [Number(minimum), Number(maximum)];
  }

  return blocks;
}

function validateMigrationFileNames(migrationFiles) {
  const errors = [];
  const allocatedNumbers = new Map();

  for (const fileName of migrationFiles) {
    const match = migrationPattern.exec(fileName);

    if (!match?.groups) {
      errors.push(`${fileName}: expected NNNN_<context>_<description>.sql`);
      continue;
    }

    const migrationNumber = Number(match.groups.number);
    const context = match.groups.context;
    const block = MIGRATION_BLOCKS[context];

    if (!block) {
      errors.push(`${fileName}: unknown migration context "${context}"`);
      continue;
    }

    const [minimum, maximum] = block;
    if (migrationNumber < minimum || migrationNumber > maximum) {
      errors.push(
        `${fileName}: ${context} migrations must use ${String(minimum).padStart(4, '0')}-${String(maximum).padStart(4, '0')}`,
      );
    }

    const previous = allocatedNumbers.get(migrationNumber);
    if (previous) {
      errors.push(`${fileName}: migration number is already used by ${previous}`);
    } else {
      allocatedNumbers.set(migrationNumber, fileName);
    }
  }

  return errors;
}

const invalidBlockFileName = (await readFile(invalidBlockFixture, 'utf8')).trim();
assert.deepEqual(validateMigrationFileNames([invalidBlockFileName]), [
  `${invalidBlockFileName}: market migrations must use 2000-2999`,
]);
const documentedBlocks = parseDocumentedMigrationBlocks(await readFile(migrationReadme, 'utf8'));
assert.deepEqual(
  documentedBlocks,
  MIGRATION_BLOCKS,
  'migrations/README.md allocation table must match the executable migration allocation map',
);

const migrationFiles = (await readdir(migrationDirectory))
  .filter((fileName) => fileName.endsWith('.sql'))
  .sort();
const errors = validateMigrationFileNames(migrationFiles);

if (errors.length > 0) {
  throw new Error(`Migration convention check failed:\n${errors.join('\n')}`);
}
