import { describe, expect, it } from 'vitest';

import { readConfig } from './config';

const RABBITMQ_URL = 'amqp://app:app@localhost/app';
const DATABASE_URL = 'postgres://app:app@localhost:5434/app';

describe('readConfig', () => {
  it('applies the port assigned to this product', () => {
    expect(readConfig({ DATABASE_URL, RABBITMQ_URL } as NodeJS.ProcessEnv).port).toBe(8200);
  });

  it('accepts an explicit port', () => {
    expect(
      readConfig({ DATABASE_URL, RABBITMQ_URL, API_PORT: '9999' } as NodeJS.ProcessEnv).port,
    ).toBe(9999);
  });

  it.each([{ API_PORT: '0' }, { API_PORT: '70000' }, { API_PORT: 'http' }])(
    'rejects the invalid port %o',
    (overrides) => {
      expect(() =>
        readConfig({ DATABASE_URL, RABBITMQ_URL, ...overrides } as NodeJS.ProcessEnv),
      ).toThrow('API_PORT');
    },
  );

  it.each([undefined, '', '   '])('requires the broker URL (%s)', (url) => {
    expect(() => readConfig({ DATABASE_URL, RABBITMQ_URL: url })).toThrow(
      'RABBITMQ_URL is required',
    );
  });

  it('trims dependency settings without exposing them in validation errors', () => {
    expect(
      readConfig({ DATABASE_URL: ` ${DATABASE_URL} `, RABBITMQ_URL: ` ${RABBITMQ_URL} ` }),
    ).toMatchObject({ databaseUrl: DATABASE_URL, rabbitMqUrl: RABBITMQ_URL });
  });

  it.each([{}, { DATABASE_URL: '   ' }])('requires DATABASE_URL (%o)', (env) => {
    expect(() => readConfig(env as NodeJS.ProcessEnv)).toThrow('DATABASE_URL is required');
  });
});
