import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export const BOUNDED_CONTEXTS = Object.freeze([
  'properties',
  'market',
  'comparables',
  'collection',
  'locations',
  'ask',
  'alerts',
  'audit',
  'identity',
]);

function createContextImportZone(context) {
  const otherContexts = BOUNDED_CONTEXTS.filter((candidate) => candidate !== context).join('|');
  const deepContextImport = [
    `(?:^(?:\\.\\.\\/)+(?:${otherContexts})\\/(?!index(?:\\.[cm]?[jt]sx?)?$).+)`,
    `(?:^@rei\\/(?:domain|application|contracts|infrastructure)\\/(?:${otherContexts})\\/(?!index(?:\\.[cm]?[jt]sx?)?$).+)`,
  ].join('|');

  return {
    files: [
      `packages/{domain,application,contracts,infrastructure}/src/${context}/**/*.{ts,tsx}`,
      `apps/{api,worker}/src/${context}/**/*.{ts,tsx}`,
    ],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex: deepContextImport,
              message: 'Import another bounded context through its index.ts public API.',
            },
          ],
        },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: `ImportExpression[source.value=/${deepContextImport}/]`,
          message: 'Import another bounded context through its index.ts public API.',
        },
        {
          selector: `TSImportType[source.value=/${deepContextImport}/]`,
          message: 'Import another bounded context through its index.ts public API.',
        },
      ],
    },
  };
}

// A single configuration for the whole monorepo. Eight packages each carrying
// their own copy would drift apart.
export default tseslint.config(
  {
    ignores: ['**/dist/**', '**/node_modules/**', '**/coverage/**', 'apps/web/dist/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2023,
      globals: globals.node,
    },
  },
  {
    files: [
      'integration/**/*.{ts,cts,mjs,cjs}',
      'scripts/**/*.mjs',
      'vitest.integration.config.ts',
    ],
    languageOptions: {
      globals: globals.node,
    },
  },
  {
    files: ['integration/**/*.{ts,cts,mjs,cjs}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            'node:test',
            'node:assert',
            'node:assert/strict',
            'node:child_process',
            'node:net',
            'node:util',
            'assert',
            'assert/strict',
            'child_process',
            'net',
            'util',
          ].map((name) => ({
            name,
            message:
              'Use Vitest, Supertest, Testcontainers, Execa and get-port for integration testing.',
          })),
        },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector:
            'FunctionDeclaration[id.name="assert"], VariableDeclarator[id.name="assert"][init.type=/^(ArrowFunctionExpression|FunctionExpression)$/]',
          message: 'Integration assertions use Vitest expect.',
        },
        {
          selector:
            'CallExpression[callee.name="fetch"], VariableDeclarator[init.name="fetch"], AssignmentExpression[right.name="fetch"], MemberExpression[object.name="globalThis"][property.name="fetch"], MemberExpression[object.name="globalThis"][property.value="fetch"], VariableDeclarator[init.name="globalThis"] > ObjectPattern > Property[key.name="fetch"]',
          message: 'Real integration HTTP requests use Supertest.',
        },
        {
          selector: 'CallExpression[callee.name="promisify"]',
          message: 'Integration processes use Execa.',
        },
        {
          selector:
            'CallExpression[callee.name="require"][arguments.0.value=/^(?:node:)?(test|assert|child_process|net|util)(?:\\/|$)/]',
          message: 'Do not embed a second testing/process framework in fixture probes.',
        },
        {
          selector:
            'ImportExpression[source.value=/^(?:node:)?(test|assert|child_process|net|util)(?:\\/|$)/]',
          message: 'Use the integration testing libraries.',
        },
      ],
    },
  },
  {
    files: ['integration/fixtures/*.cts'],
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
  {
    // The web application is the only browser target.
    files: ['apps/web/**/*.{ts,tsx}'],
    languageOptions: {
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    },
  },
  {
    // NestJS relies on decorator metadata, so empty constructors carrying only
    // parameter properties are intentional.
    files: ['apps/api/**/*.ts', 'apps/worker/**/*.ts', 'apps/ai/**/*.ts'],
    rules: {
      '@typescript-eslint/no-extraneous-class': 'off',
    },
  },
  ...BOUNDED_CONTEXTS.map(createContextImportZone),
);
