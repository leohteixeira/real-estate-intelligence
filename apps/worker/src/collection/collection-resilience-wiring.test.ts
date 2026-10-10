import 'reflect-metadata';

import { NestFactory } from '@nestjs/core';
import { metrics } from '@opentelemetry/api';
import { LISTING_SOURCE, RAW_SNAPSHOT_STORE, SOURCE_REGISTER_REPOSITORY } from '@rei/application';
import {
  InMemorySourceRegisterRepository,
  S3RawSnapshotStore,
  SyntheticListingSource,
} from '@rei/infrastructure';
import { channel } from 'node:diagnostics_channel';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ResilienceTelemetry } from '../shared/resilience/resilience-telemetry';
import { WorkerModule } from '../worker.module';
import { CollectionCommandModule } from './collection-command.module';
import { CollectionModule } from './collection.module';
import { ResilientListingSource } from './resilient-listing-source';
import { ResilientRawSnapshotStore } from './resilient-raw-snapshot-store';
import { ResumableCollectionCommandModule } from './resumable-collection-command.module';

vi.mock('../config', () => {
  const storage = {
    objectStoreEndpoint: 'http://storage.invalid',
    objectStoreRegion: 'fixture',
    objectStoreBucket: 'fixture',
    objectStoreAccessKeyId: 'fixture',
    objectStoreSecretAccessKey: 'fixture',
    syntheticPageDelayMs: 0,
    concurrency: 1,
  };
  return {
    readScheduledCollectionConfig: vi.fn(() => storage),
    readCollectionCommandConfig: vi.fn(() => storage),
    readConfig: vi.fn(() => ({
      rabbitMqUrl: 'amqp://broker.invalid',
      operationTimeoutMs: 100,
      eventHandlerTimeoutMs: 100,
      brokerDrainTimeoutMs: 100,
      collectionPrefetch: 1,
      eventDeliveryLimit: 5,
      eventRedeliveryDelayMs: 100,
    })),
  };
});

vi.mock('../persistence.module', async () => {
  const { Global, Module } = await import('@nestjs/common');
  const ports = await import('@rei/application');
  const database = Symbol.for('rei.DatabaseConnection');
  const exports = [
    database,
    ports.DATABASE_AVAILABILITY_PROBE,
    ports.OUTBOX_APPEND_PORT,
    ports.TRANSACTION_RUNNER,
    ports.UUID_V7_GENERATOR,
    ports.OUTBOX_RELAY_PORT,
    ports.OUTBOX_RETENTION_PORT,
    ports.INBOX,
    ports.INBOX_RETENTION_PORT,
    ports.AUDIT_EVENT_LOG,
  ];
  class FixturePersistenceModule {}
  Global()(FixturePersistenceModule);
  Module({ providers: exports.map((provide) => ({ provide, useValue: {} })), exports })(
    FixturePersistenceModule,
  );
  return { DATABASE_CONNECTION: database, PersistenceModule: FixturePersistenceModule };
});

interface FactoryProvider {
  provide: unknown;
  inject: unknown[];
  useFactory: (...args: unknown[]) => unknown;
}

describe('collection resilience composition roots', () => {
  afterEach(() => vi.restoreAllMocks());

  it.each([CollectionCommandModule, ResumableCollectionCommandModule, WorkerModule])(
    'subscribes once to real policy diagnostics and unsubscribes on context close: %s',
    async (root) => {
      const add = vi.fn();
      vi.spyOn(metrics, 'getMeter').mockReturnValue({ createCounter: () => ({ add }) } as never);
      const app = await NestFactory.createApplicationContext(root, {
        logger: false,
        abortOnError: false,
      });
      const diagnostics = channel('nestjs:resilience:retry');
      try {
        expect(app.get(ResilienceTelemetry)).toBeInstanceOf(ResilienceTelemetry);
        diagnostics.publish({
          type: 'retry',
          policy: 'listing-source.retry',
          attempt: 1,
          delayMs: 200,
          source: 'private cursor and source',
          error: new Error('private payload'),
        });
        expect(add).toHaveBeenCalledExactlyOnceWith(1, {
          'dependency.name': 'listing-source',
          'resilience.policy.name': 'listing-source.retry',
          'resilience.event.type': 'retry',
          'resilience.retry.attempt': 1,
        });
      } finally {
        await app.close();
      }
      diagnostics.publish({
        type: 'retry',
        policy: 'raw-snapshot-store.retry',
        attempt: 1,
        delayMs: 100,
        error: new Error('private payload'),
      });
      expect(add).toHaveBeenCalledOnce();
    },
  );

  it.each([CollectionCommandModule, ResumableCollectionCommandModule, CollectionModule])(
    'wraps both ports and retains the actual S3 cleanup owner: %s',
    (root) => {
      const providers = Reflect.getMetadata('providers', root) as FactoryProvider[];
      const source = providers.find((provider) => provider.provide === LISTING_SOURCE)!;
      const store = providers.find((provider) => provider.provide === RAW_SNAPSHOT_STORE)!;
      const register = new InMemorySourceRegisterRepository([]);
      const dependencies = source.inject.map((token) =>
        token === SOURCE_REGISTER_REPOSITORY ? register : new SyntheticListingSource(),
      );
      expect(source.useFactory(...dependencies)).toBeInstanceOf(ResilientListingSource);
      expect(store.inject).toEqual([S3RawSnapshotStore]);
      const adapter = { store: vi.fn(), destroy: vi.fn() } as unknown as S3RawSnapshotStore;
      expect(store.useFactory(adapter)).toBeInstanceOf(ResilientRawSnapshotStore);
      new root(adapter).onApplicationShutdown();
      expect(adapter.destroy).toHaveBeenCalledOnce();
    },
  );
});
