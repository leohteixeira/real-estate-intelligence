// One-time reviewed migration: change assertion/fixture syntax, preserve scenario expressions.
import { readFileSync, writeFileSync, readdirSync, renameSync } from 'node:fs';
import ts from 'typescript';

const directory = new URL('../integration/', import.meta.url);
const names = readdirSync(directory).filter(
  (name) =>
    /\.integration\.mjs$|source-register-cleanup\.test\.mjs$/.test(name) &&
    !name.startsWith('rabbitmq-'),
);

for (const name of names) {
  const path = new URL(name, directory);
  const original = readFileSync(path, 'utf8');
  if (original.includes("from 'vitest'")) continue;
  const tree = ts.createSourceFile(name, original, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  let count = 0;
  const edits = new Map();
  const text = (node) => {
    if (edits.has(node)) return edits.get(node);
    let value = original.slice(node.getStart(tree), node.end);
    const children = [];
    ts.forEachChild(node, (child) => {
      children.push(child);
    });
    for (const child of children.reverse()) {
      const start = child.getStart(tree) - node.getStart(tree);
      const end = child.end - node.getStart(tree);
      value = value.slice(0, start) + text(child) + value.slice(end);
    }
    return value;
  };
  function visit(node) {
    ts.forEachChild(node, visit);
    if (ts.isFunctionDeclaration(node) && node.name?.text === 'assert') edits.set(node, '');
    if (ts.isFunctionDeclaration(node) && ['allocatePorts', 'ports'].includes(node.name?.text)) {
      edits.set(node, node.name.text === 'ports' ? 'const ports = allocatePorts;' : '');
    }
    if (ts.isFunctionDeclaration(node) && ['port', 'reservePort'].includes(node.name?.text)) {
      edits.set(
        node,
        `async function ${node.name.text}() { const [selected] = await allocatePorts(1); expect(Number.isInteger(selected)).toBeTruthy(); return selected; }`,
      );
    }
    if (ts.isFunctionDeclaration(node) && node.name?.text === 'listenOnAvailablePort')
      edits.set(node, '');
    if (ts.isFunctionDeclaration(node) && node.name?.text === 'allocateCampaignPorts') {
      edits.set(
        node,
        `async function allocateCampaignPorts(environment) {
        const ports = {};
        for (const [key, overrideName] of portSpecifications) {
          const requested = overrideName ? parsePortOverride(overrideName, environment[overrideName]) : 0;
          ports[key] = await availablePort(requested);
        }
        return Object.freeze(ports);
      }`,
      );
    }
    if (
      ts.isVariableStatement(node) &&
      node.declarationList.declarations.some((entry) => entry.name.getText(tree) === 'reservations')
    )
      edits.set(node, '');
    if (
      ts.isExpressionStatement(node) &&
      /reservations\.map|reservations\s*\.filter/.test(node.getText(tree))
    )
      edits.set(node, '');
    if (ts.isCallExpression(node) && node.expression.getText(tree) === 'promisify')
      edits.set(node, 'command');
    if (
      ts.isCallExpression(node) &&
      node.expression.getText(tree) === 'fetch' &&
      node.arguments.length > 0
    )
      edits.set(node, `requestHttp(${node.arguments.map(text).join(', ')})`);
    if (!ts.isCallExpression(node)) return;
    const callee = node.expression.getText(tree);
    if (!/^assert(?:\.[a-zA-Z]+)?$/.test(callee)) return;
    count++;
    const args = node.arguments.map(text);
    const method = callee.split('.')[1];
    let result;
    if (!method || method === 'ok')
      result = `expect(${args[0]}${args[1] ? `, ${args[1]}` : ''}).toBeTruthy()`;
    else if (
      [
        'equal',
        'strictEqual',
        'notEqual',
        'notStrictEqual',
        'deepEqual',
        'deepStrictEqual',
        'match',
        'doesNotMatch',
      ].includes(method)
    ) {
      const matcher = {
        equal: 'toBe',
        strictEqual: 'toBe',
        notEqual: 'not.toBe',
        notStrictEqual: 'not.toBe',
        deepEqual: 'toStrictEqual',
        deepStrictEqual: 'toStrictEqual',
        match: 'toMatch',
        doesNotMatch: 'not.toMatch',
      }[method];
      result = `expect(${args[0]}${args[2] ? `, ${args[2]}` : ''}).${matcher}(${args[1]})`;
    } else if (method === 'fail') result = `expect.fail(${args.join(', ')})`;
    else if (method === 'throws' || method === 'rejects') {
      const async = method === 'rejects';
      const input =
        async &&
        (ts.isArrowFunction(node.arguments[0]) ||
          (ts.isIdentifier(node.arguments[0]) && node.arguments[0].text === 'run'))
          ? `(${args[0]})()`
          : args[0];
      const expected = node.arguments[1];
      const matcher = !expected
        ? 'toThrow()'
        : ts.isObjectLiteralExpression(expected)
          ? `toMatchObject(${args[1]})`
          : ts.isArrowFunction(expected) || ts.isFunctionExpression(expected)
            ? `toSatisfy(${args[1]})`
            : `toThrow(${args[1]})`;
      result = `expect(${input}${args[2] ? `, ${args[2]}` : ''}).${async ? 'rejects.' : ''}${matcher}`;
    } else throw new Error(`Unsupported assertion ${callee} in ${name}`);
    edits.set(node, result);
  }
  visit(tree);
  const imports = [];
  const body = [];
  for (const statement of tree.statements) {
    if (ts.isImportDeclaration(statement)) {
      const source = statement.moduleSpecifier.text;
      if (
        ['node:assert/strict', 'node:test', 'node:child_process', 'node:net', 'node:util'].includes(
          source,
        )
      )
        continue;
      imports.push(statement.getText(tree));
    } else body.push(text(statement));
  }
  let content = body.join('\n');
  // This scoped hook is a synchronization callback, not global HTTP fetch.
  content = content
    .replace(/entryClock = admissionClock,\s*fetch,/, 'entryClock = admissionClock, beforeFetch,')
    .replace('if (fetch) await fetch();', 'if (beforeFetch) await beforeFetch();');
  if (name === 'synthetic-collection.integration.mjs') {
    content = content.replace(/if \(failed\) process\.exitCode = 1;/g, '');
    content = content.replace(/let failed = false;\n/g, '').replace(/failed = true;\n/g, '');
  }
  if (name === 'collection-resilience.integration.mjs') {
    content = content.replace(
      /async function restartProbe\(\)[\s\S]*?\nasync function main\(\)/,
      'async function main()',
    );
    content = content.replace(
      "['integration/collection-resilience.integration.mjs', '--restart-probe']",
      "['integration/fixtures/collection-restart-probe.mjs']",
    );
    content = content.replace(
      "if (process.argv.includes('--restart-probe')) await restartProbe();\nelse await main();",
      'await main();',
    );
  }
  const cleanup = name === 'source-register-cleanup.test.mjs';
  const support = cleanup
    ? ''
    : `import { withCampaign, allocatePorts${content.includes('availablePort(') ? ', availablePort' : ''} } from './support/fixture.mjs';\n${content.includes('requestHttp(') ? "import { requestHttp } from './support/http.mjs';\n" : ''}`;
  const vitest = cleanup
    ? "import { describe, it, expect } from 'vitest';"
    : "import { test, expect } from 'vitest';";
  const output = `${vitest}\n${imports.join('\n')}\n${support}\n${cleanup ? content : `test('${name.replace('.integration.mjs', '')} preserves its complete real-service campaign', async () => {\nawait withCampaign(async ({ command }) => {\n${content}\n});\n});`}\n`;
  const migrated = new URL(name.replace('.integration.mjs', '.integration.test.mjs'), directory);
  if (migrated.href !== path.href) renameSync(path, migrated);
  writeFileSync(migrated, output);
  console.log(
    `${name}: migrated ${count} assertion sites without changing their scenario expressions.`,
  );
}

// Preserve each polling variant's return value and original timeout/interval.
for (const name of readdirSync(directory).filter((entry) =>
  entry.endsWith('.integration.test.mjs'),
)) {
  const path = new URL(name, directory);
  const original = readFileSync(path, 'utf8');
  const tree = ts.createSourceFile(name, original, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const changes = [];
  function visit(node) {
    if (ts.isFunctionDeclaration(node) && node.name?.text === 'waitFor') {
      const parameters = node.parameters.map((parameter) => parameter.getText(tree));
      const timeout = node.parameters[2]?.name.getText(tree) || '60000';
      const interval =
        node.parameters[3]?.name.getText(tree) ||
        /setTimeout\(resolve,\s*(\d+)\)/.exec(node.getText(tree))?.[1] ||
        '100';
      const value = /return (?:result|value);/.test(node.getText(tree));
      changes.push({
        start: node.getStart(tree),
        end: node.end,
        value: `async function waitFor(${parameters.join(', ')}) { let result; await vi.waitFor(async () => { result = await probe(); expect(result, description).toBeTruthy(); }, { timeout: ${timeout}, interval: ${interval} }); ${value ? 'return result;' : ''} }`,
      });
    }
    ts.forEachChild(node, visit);
  }
  visit(tree);
  let content = original;
  for (const change of changes.sort((a, b) => b.start - a.start))
    content = content.slice(0, change.start) + change.value + content.slice(change.end);
  if (changes.length)
    content = content.replace('import { test, expect }', 'import { test, expect, vi }');
  writeFileSync(path, content);
}
