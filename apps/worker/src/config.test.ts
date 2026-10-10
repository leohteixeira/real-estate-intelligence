import { describe, expect, it } from 'vitest';

import { readCollectionCommandConfig, readConfig, readScheduledCollectionConfig } from './config';

const DATABASE_URL = 'postgres://app:app@localhost:5434/app';
const RABBITMQ_URL = 'amqp://app:app@localhost:5672/app';
const BASE_ENV = { DATABASE_URL, RABBITMQ_URL } as NodeJS.ProcessEnv;

describe('readConfig', () => {
  it('applies the default interval', () => {
    expect(readConfig(BASE_ENV)).toMatchObject({
      intervalMs: 30_000,
      relayIntervalMs: 1_000,
      relayBatchSize: 25,
      claimLeaseMs: 130_000,
      reconnectIntervalMs: 1_000,
      operationTimeoutMs: 5_000,
      shutdownTimeoutMs: 15_000,
      eventDeliveryLimit: 5,
      eventRedeliveryDelayMs: 1_000,
      eventHandlerTimeoutMs: 120_000,
      brokerDrainTimeoutMs: 10_000,
      collectionPrefetch: 2,
      outboxRetentionMs: 604_800_000,
      inboxRetentionMs: 2_592_000_000,
      retentionIntervalMs: 300_000,
      retentionBatchSize: 1_000,
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

  it('requires the claim lease to cover the worst-case sequential batch and poll margin', () => {
    expect(() =>
      readConfig({
        ...BASE_ENV,
        OUTBOX_RELAY_BATCH_SIZE: '2',
        OUTBOX_RELAY_INTERVAL_MS: '1000',
        WORKER_OPERATION_TIMEOUT_MS: '5000',
        OUTBOX_CLAIM_LEASE_MS: '10999',
      } as NodeJS.ProcessEnv),
    ).toThrow('OUTBOX_CLAIM_LEASE_MS must be at least 11000');
  });

  it('bounds the reconnect cadence by the shutdown deadline', () => {
    expect(() =>
      readConfig({
        ...BASE_ENV,
        RABBITMQ_RECONNECT_INTERVAL_MS: '16000',
        SHUTDOWN_TIMEOUT_MS: '15000',
      } as NodeJS.ProcessEnv),
    ).toThrow('RABBITMQ_RECONNECT_INTERVAL_MS');
  });

  it('rejects partial numeric values instead of silently truncating them', () => {
    expect(() =>
      readConfig({ ...BASE_ENV, EVENT_DELIVERY_LIMIT: '5oops' } as NodeJS.ProcessEnv),
    ).toThrow('EVENT_DELIVERY_LIMIT');
  });

  it('validates delivery and retention policy relationships', () => {
    expect(() =>
      readConfig({ ...BASE_ENV, EVENT_DELIVERY_LIMIT: '1' } as NodeJS.ProcessEnv),
    ).toThrow('EVENT_DELIVERY_LIMIT');
    expect(() =>
      readConfig({ ...BASE_ENV, EVENT_REDELIVERY_DELAY_MS: '99' } as NodeJS.ProcessEnv),
    ).toThrow('EVENT_REDELIVERY_DELAY_MS');
    expect(() =>
      readConfig({ ...BASE_ENV, OUTBOX_RETENTION_MS: '1000', INBOX_RETENTION_MS: '999' }),
    ).toThrow('INBOX_RETENTION_MS');
    expect(() =>
      readConfig({
        ...BASE_ENV,
        OUTBOX_RETENTION_MS: '1000',
        INBOX_RETENTION_MS: '2000',
        DELIVERY_RETENTION_INTERVAL_MS: '1000',
      }),
    ).toThrow('DELIVERY_RETENTION_INTERVAL_MS');
  });

  it('caps every Node timer input at the signed 32-bit maximum', () => {
    expect(() => readConfig({ ...BASE_ENV, DELIVERY_RETENTION_INTERVAL_MS: '2500000000' })).toThrow(
      'DELIVERY_RETENTION_INTERVAL_MS',
    );
    expect(() => readConfig({ ...BASE_ENV, WORKER_INTERVAL_MS: '2500000000' })).toThrow(
      'WORKER_INTERVAL_MS',
    );
  });
});

describe('readCollectionCommandConfig', () => {
  const STORAGE_ENV = {
    OBJECT_STORE_ENDPOINT: 'http://localhost:9100',
    OBJECT_STORE_REGION: 'us-east-1',
    OBJECT_STORE_BUCKET: 'real-estate-snapshots',
    OBJECT_STORE_ACCESS_KEY_ID: 'fixture-access-key',
    OBJECT_STORE_SECRET_ACCESS_KEY: 'fixture-secret-key',
  } as NodeJS.ProcessEnv;

  it('validates and normalizes command-only object storage settings', () => {
    expect(
      readCollectionCommandConfig({ ...STORAGE_ENV, OBJECT_STORE_ENDPOINT: 'http://minio:9000/' }),
    ).toEqual({
      deadlineMs: 30_000,
      syntheticPageDelayMs: 0,
      objectStoreEndpoint: 'http://minio:9000',
      objectStoreRegion: 'us-east-1',
      objectStoreBucket: 'real-estate-snapshots',
      objectStoreAccessKeyId: 'fixture-access-key',
      objectStoreSecretAccessKey: 'fixture-secret-key',
    });
  });

  it.each([
    ['OBJECT_STORE_ENDPOINT', 'minio:9000'],
    ['OBJECT_STORE_BUCKET', 'Bad_Bucket'],
    ['OBJECT_STORE_ACCESS_KEY_ID', ''],
    ['COLLECTION_DEADLINE_MS', '99'],
    ['SYNTHETIC_PAGE_DELAY_MS', '30001'],
  ])('rejects invalid %s', (name, value) => {
    expect(() => readCollectionCommandConfig({ ...STORAGE_ENV, [name]: value })).toThrow(name);
  });
});

describe('readScheduledCollectionConfig', () => {
  const STORAGE_ENV = {
    OBJECT_STORE_ENDPOINT: 'http://localhost:9100',
    OBJECT_STORE_REGION: 'us-east-1',
    OBJECT_STORE_BUCKET: 'real-estate-snapshots',
    OBJECT_STORE_ACCESS_KEY_ID: 'fixture-access-key',
    OBJECT_STORE_SECRET_ACCESS_KEY: 'fixture-secret-key',
  } as NodeJS.ProcessEnv;

  it('provides bounded scheduler and collection-run defaults', () => {
    expect(readScheduledCollectionConfig(STORAGE_ENV)).toMatchObject({
      pollIntervalMs: 1_000,
      claimBatchSize: 10,
      concurrency: 2,
      runTimeoutMs: 115_000,
    });
  });

  it('requires a collection run to fit inside the delivery deadline', () => {
    expect(() =>
      readScheduledCollectionConfig({
        ...STORAGE_ENV,
        COLLECTION_RUN_TIMEOUT_MS: '5001',
        EVENT_HANDLER_TIMEOUT_MS: '5000',
      }),
    ).toThrow('COLLECTION_RUN_TIMEOUT_MS');
  });
});
