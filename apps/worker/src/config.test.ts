import { describe, expect, it } from 'vitest';

import { readConfig } from './config';

const DATABASE_URL = 'postgres://app:app@localhost:5434/app';
const RABBITMQ_URL = 'amqp://app:app@localhost:5672/app';
const BASE_ENV = { DATABASE_URL, RABBITMQ_URL } as NodeJS.ProcessEnv;

describe('readConfig', () => {
  it('applies the default interval', () => {
    expect(readConfig(BASE_ENV)).toMatchObject({
      intervalMs: 30_000,
      relayIntervalMs: 1_000,
      relayBatchSize: 25,
      operationTimeoutMs: 5_000,
      shutdownTimeoutMs: 15_000,
    });
  });

  it('accepts an explicit interval', () => {
    expect(
      readConfig({ ...BASE_ENV, WORKER_INTERVAL_MS: '5000' } as NodeJS.ProcessEnv).intervalMs,
    ).toBe(5_000);
  });

  it.each([{ WORKER_INTERVAL_MS: '500' }, { WORKER_INTERVAL_MS: 'often' }])(
    'rejects the invalid interval %o',
    (overrides) => {
      expect(() => readConfig({ ...BASE_ENV, ...overrides } as NodeJS.ProcessEnv)).toThrow(
        'WORKER_INTERVAL_MS',
      );
    },
  );

  it('requires DATABASE_URL', () => {
    expect(() => readConfig({ RABBITMQ_URL } as NodeJS.ProcessEnv)).toThrow(
      'DATABASE_URL is required',
    );
  });

  it('requires RABBITMQ_URL', () => {
    expect(() => readConfig({ DATABASE_URL } as NodeJS.ProcessEnv)).toThrow(
      'RABBITMQ_URL is required',
    );
  });

  it('requires shutdown to allow one bounded operation to finish', () => {
    expect(() =>
      readConfig({
        ...BASE_ENV,
        WORKER_OPERATION_TIMEOUT_MS: '5000',
        SHUTDOWN_TIMEOUT_MS: '1000',
      } as NodeJS.ProcessEnv),
    ).toThrow('SHUTDOWN_TIMEOUT_MS');
  });
});
