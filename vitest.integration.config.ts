import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['integration/**/*.integration.test.ts', 'integration/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**', 'integration/fixtures/**'],
    environment: 'node',
    fileParallelism: false,
    maxWorkers: 1,
    testTimeout: 600_000,
    hookTimeout: 300_000,
    passWithNoTests: false,
    setupFiles: ['integration/support/network.setup.ts'],
  },
});
