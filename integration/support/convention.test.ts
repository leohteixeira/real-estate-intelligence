import { ESLint } from 'eslint';
import { expect, test } from 'vitest';

test('ESLint rejects Node harness imports in either spelling and dynamic/CommonJS equivalents', async () => {
  const eslint = new ESLint();
  for (const source of [
    'node:test',
    'node:assert',
    'node:assert/strict',
    'assert',
    'assert/strict',
    'node:child_process',
    'child_process',
    'node:net',
    'net',
    'node:util',
    'util',
  ]) {
    for (const expression of [
      `import '${source}';`,
      `await import('${source}');`,
      `require('${source}');`,
    ]) {
      for (const extension of ['ts', 'cts', 'mjs', 'cjs']) {
        const [result] = await eslint.lintText(expression, {
          filePath: `integration/fixtures/convention-probe.${extension}`,
        });
        expect(
          result!.messages.some(
            (message) =>
              message.ruleId !== null &&
              ['no-restricted-imports', 'no-restricted-syntax'].includes(message.ruleId),
          ),
          `${extension}: ${expression}`,
        ).toBe(true);
      }
    }
  }
});

test('ESLint accepts native expectations/Supertest and rejects custom assertions and manual HTTP', async () => {
  const eslint = new ESLint();
  for (const expression of [
    'function assert(value) { if (!value) throw new Error(); }',
    'const assert = (value) => { if (!value) throw new Error(); }; assert(true);',
    'const assert = function (value) { if (!value) throw new Error(); }; assert(true);',
    "fetch('https://outside.invalid');",
    "globalThis.fetch('https://outside.invalid');",
    "globalThis['fetch']('https://outside.invalid');",
    "const manualFetch = fetch; manualFetch('https://outside.invalid');",
    "let manualFetch; manualFetch = fetch; manualFetch('https://outside.invalid');",
    "const manualFetch = globalThis.fetch; manualFetch('https://outside.invalid');",
    "const { fetch: manualFetch } = globalThis; manualFetch('https://outside.invalid');",
    'promisify(() => {});',
  ]) {
    for (const extension of ['ts', 'cts', 'mjs', 'cjs']) {
      const [result] = await eslint.lintText(expression, {
        filePath: `integration/convention-probe.${extension}`,
      });
      expect(
        result!.messages.some((message) => message.ruleId === 'no-restricted-syntax'),
        `${extension}: ${expression}`,
      ).toBe(true);
    }
  }
  const [valid] = await eslint.lintText(
    "import { expect, test } from 'vitest'; import request from 'supertest'; test('valid', async () => { expect(true).toBe(true); const response = await request('http://127.0.0.1:12345').get('/'); expect(response.status).toBe(200); });",
    { filePath: 'integration/convention-probe.ts' },
  );
  expect(valid!.errorCount).toBe(0);
});
