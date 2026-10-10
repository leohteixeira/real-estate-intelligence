import { ESLint } from 'eslint';
import { readFile } from 'node:fs/promises';
import { fileURLToPath, URL } from 'node:url';

import { BOUNDED_CONTEXTS } from '../eslint.config.js';

const repositoryRoot = fileURLToPath(new URL('../', import.meta.url));
const fixtureDirectory = new URL('../test-fixtures/eslint/context-boundaries/', import.meta.url);
const fixtureCases = await Promise.all(
  [
    ['forbidden-deep-import.ts.txt', 'no-restricted-imports'],
    ['forbidden-dynamic-import.ts.txt', 'no-restricted-syntax'],
    ['forbidden-import-type.ts.txt', 'no-restricted-syntax'],
    ['allowed-public-import.ts.txt'],
    ['allowed-public-dynamic-import.ts.txt'],
    ['allowed-public-import-type.ts.txt'],
    ['allowed-non-context-paths.ts.txt'],
  ].map(async ([fileName, expectedRuleId]) => ({
    fileName,
    expectedRuleId,
    template: await readFile(new URL(fileName, fixtureDirectory), 'utf8'),
  })),
);
const eslint = new ESLint({ cwd: repositoryRoot });

for (const [index, sourceContext] of BOUNDED_CONTEXTS.entries()) {
  const targetContext = BOUNDED_CONTEXTS[(index + 1) % BOUNDED_CONTEXTS.length];
  const filePath = `packages/domain/src/${sourceContext}/context-boundary.fixture.ts`;
  for (const { fileName, expectedRuleId, template } of fixtureCases) {
    const source = template.replaceAll('__TARGET_CONTEXT__', targetContext);
    const [result] = await eslint.lintText(source, { filePath });

    if (expectedRuleId) {
      const boundaryMessages = result.messages.filter(
        (message) => message.ruleId === expectedRuleId && message.severity === 2,
      );

      if (boundaryMessages.length !== 1 || result.errorCount !== 1) {
        const diagnostics = result.messages
          .map((message) => `${message.ruleId ?? 'configuration'}: ${message.message}`)
          .join('; ');
        throw new Error(
          `Expected ${fileName} for ${sourceContext} -> ${targetContext} to produce one ${expectedRuleId} error: ${diagnostics}`,
        );
      }
    } else if (result.errorCount !== 0) {
      const diagnostics = result.messages
        .map((message) => `${message.ruleId ?? 'configuration'}: ${message.message}`)
        .join('; ');
      throw new Error(`Expected ${fileName} for ${sourceContext} to pass: ${diagnostics}`);
    }
  }
}
