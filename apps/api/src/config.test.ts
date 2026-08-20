import { describe, expect, it } from 'vitest';

import { readConfig } from './config';

const DATABASE_URL = 'postgres://app:app@localhost:5434/app';

describe('readConfig', () => {
  it('applies the port assigned to this product', () => {
    expect(readConfig({ DATABASE_URL } as NodeJS.ProcessEnv).port).toBe(8200);
  });

  it('accepts an explicit port', () => {
    expect(readConfig({ DATABASE_URL, API_PORT: '9999' } as NodeJS.ProcessEnv).port).toBe(9999);
  });

  it.each([{ API_PORT: '0' }, { API_PORT: '70000' }, { API_PORT: 'http' }])(
    'rejects the invalid port %o',
    (overrides) => {
      expect(() => readConfig({ DATABASE_URL, ...overrides } as NodeJS.ProcessEnv)).toThrow(
        'API_PORT',
      );
    },
  );

  it.each([{}, { DATABASE_URL: '   ' }])('requires DATABASE_URL (%o)', (env) => {
    expect(() => readConfig(env as NodeJS.ProcessEnv)).toThrow('DATABASE_URL is required');
  });
});
