import { describe, expect, it } from 'vitest';

import { readConfig } from './config';

const DATABASE_URL = 'postgres://app:app@localhost:5434/app';

describe('readConfig', () => {
  it('applies the default interval', () => {
    expect(readConfig({ DATABASE_URL } as NodeJS.ProcessEnv).intervalMs).toBe(30_000);
  });

  it('accepts an explicit interval', () => {
    expect(
      readConfig({ DATABASE_URL, WORKER_INTERVAL_MS: '5000' } as NodeJS.ProcessEnv).intervalMs,
    ).toBe(5_000);
  });

  it.each([{ WORKER_INTERVAL_MS: '500' }, { WORKER_INTERVAL_MS: 'often' }])(
    'rejects the invalid interval %o',
    (overrides) => {
      expect(() => readConfig({ DATABASE_URL, ...overrides } as NodeJS.ProcessEnv)).toThrow(
        'WORKER_INTERVAL_MS',
      );
    },
  );

  it('requires DATABASE_URL', () => {
    expect(() => readConfig({} as NodeJS.ProcessEnv)).toThrow('DATABASE_URL is required');
  });
});
