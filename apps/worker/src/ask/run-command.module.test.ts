import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import {
  ConsumeAskRunRequest,
  EVENT_SUBSCRIBER,
  RUN_DISPATCH,
  RUN_EXECUTOR,
  type RunExecutor,
} from '@rei/application';
import { ASK_RUN_REQUESTED_TYPE, ASK_STRUCTURED_CONSUMER } from '@rei/domain';
import { DatabaseConnection, RabbitMqEventBroker, S3RawSnapshotStore } from '@rei/infrastructure';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HeartbeatJob } from '../heartbeat.job';
import { DATABASE_CONNECTION } from '../persistence.module';
import { CollectionModule } from '../collection/index';
import { WorkerModule } from '../worker.module';
import { AskRunRequestConsumer } from './ask-run-request.consumer';
import { RunCommandModule } from './run-command.module';
import { RunExecutorModule } from './run-executor.module';
import { ResilientRunExecutor } from './resilient-run-executor';
import { ResilientRunDispatch } from './resilient-run-dispatch';
import { runFoundationExecutionCommand } from './run-execution-command';
vi.mock('../otel', () => ({ shutdownTelemetry: vi.fn(async () => {}) }));
const input = {
  version: 1 as const,
  runId: '0197e4e0-0000-7000-8000-000000000001',
  threadId: '0197e4e0-0000-7000-8000-000000000002',
  step: 'foundation' as const,
  query: 'Private command question.',
  locale: 'en' as const,
};
const evidence = {
  version: 1,
  runId: input.runId,
  threadId: input.threadId,
  step: 'foundation',
  outcome: 'foundation-executed',
  visitedNodes: ['noOp'],
};
function isolatedEnvironment(): void {
  for (const name of [
    'DATABASE_URL',
    'RABBITMQ_URL',
    'OBJECT_STORE_ENDPOINT',
    'OBJECT_STORE_REGION',
    'OBJECT_STORE_BUCKET',
    'OBJECT_STORE_ACCESS_KEY_ID',
    'OBJECT_STORE_SECRET_ACCESS_KEY',
    'AI_URL',
    'AI_INTERNAL_TOKEN',
  ])
    vi.stubEnv(name, undefined);
  // Even invalid dispatch configuration must be irrelevant to the explicit execution command.
  vi.stubEnv('ASK_DISPATCH_SECRET', 'invalid');
}
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
describe('actual Nest execution entry-point composition', () => {
  it('creates an isolated disabled command context without broker, database, collection or scheduler providers', async () => {
    isolatedEnvironment();
    vi.stubEnv('ASK_DISPATCH_SECRET', undefined);
    const context = await NestFactory.createApplicationContext(RunCommandModule, {
      logger: false,
      abortOnError: false,
    });
    try {
      const executor = context.get<RunExecutor>(RUN_EXECUTOR);
      await expect(
        executor.execute(input, new AbortController().signal, Date.now() + 1000),
      ).rejects.toMatchObject({ kind: 'forbidden', operation: 'run-executor.execute' });
      for (const token of [
        EVENT_SUBSCRIBER,
        RUN_DISPATCH,
        DATABASE_CONNECTION,
        RabbitMqEventBroker,
        S3RawSnapshotStore,
        CollectionModule,
        HeartbeatJob,
        AskRunRequestConsumer,
        ConsumeAskRunRequest,
      ])
        expect(() => context.get(token)).toThrow();
    } finally {
      await context.close();
    }
  });
  it('runs the foundation command through its real Nest context and configured HTTP executor without a fake create callback', async () => {
    isolatedEnvironment();
    vi.stubEnv('AI_URL', 'http://ai.internal:4111');
    vi.stubEnv('AI_INTERNAL_TOKEN', 'a'.repeat(48));
    const transport = vi.fn<typeof fetch>().mockResolvedValue(Response.json(evidence));
    vi.stubGlobal('fetch', transport);
    const output = vi.fn(),
      shutdown = vi.fn(async () => {});
    async function* stdin() {
      yield JSON.stringify(input);
    }
    await runFoundationExecutionCommand(process.env, { input: stdin(), output, shutdown });
    expect(transport).toHaveBeenCalledOnce();
    expect(String(transport.mock.calls[0]?.[0])).toBe(
      'http://ai.internal:4111/internal/v1/runs/execute',
    );
    expect(output).toHaveBeenCalledExactlyOnceWith(JSON.stringify(evidence));
    expect(shutdown).toHaveBeenCalledOnce();
  });
  it.each([true, false])(
    'resolves the full worker graph and offline durable Ask subscription with execution configured: %s',
    async (configured) => {
      isolatedEnvironment();
      for (const [name, value] of Object.entries({
        DATABASE_URL: 'postgresql://database.invalid/unit',
        RABBITMQ_URL: 'amqp://broker.invalid:5672',
        OBJECT_STORE_ENDPOINT: 'http://storage.invalid:9000',
        OBJECT_STORE_REGION: 'us-east-1',
        OBJECT_STORE_BUCKET: 'unit-snapshots',
        OBJECT_STORE_ACCESS_KEY_ID: 'unit-key',
        OBJECT_STORE_SECRET_ACCESS_KEY: 'unit-secret',
      }))
        vi.stubEnv(name, value);
      vi.stubEnv('ASK_DISPATCH_SECRET', undefined);
      if (configured) {
        vi.stubEnv('AI_URL', 'http://ai.internal:4111');
        vi.stubEnv('AI_INTERNAL_TOKEN', 'a'.repeat(48));
        vi.stubEnv('ASK_DISPATCH_SECRET', 's'.repeat(43));
        vi.stubEnv('API_BASE_URL', 'http://api.internal:8200');
      }
      const query = vi.spyOn(DatabaseConnection.prototype, 'query'),
        start = vi.spyOn(RabbitMqEventBroker.prototype, 'start'),
        subscribe = vi.spyOn(RabbitMqEventBroker.prototype, 'subscribe');
      const context = await NestFactory.createApplicationContext(WorkerModule, {
        logger: false,
        abortOnError: false,
      });
      try {
        const executor = context.get<RunExecutor>(RUN_EXECUTOR);
        expect(context.select(RunExecutorModule).get(RUN_EXECUTOR, { strict: true })).toBe(
          executor,
        );
        if (configured) {
          expect(executor).toBeInstanceOf(ResilientRunExecutor);
          expect(context.get(RUN_DISPATCH)).toBeInstanceOf(ResilientRunDispatch);
        } else {
          await expect(
            executor.execute(input, new AbortController().signal, Date.now() + 1000),
          ).rejects.toMatchObject({ kind: 'forbidden', operation: 'run-executor.execute' });
        }
        expect(context.get(ConsumeAskRunRequest)).toBeInstanceOf(ConsumeAskRunRequest);
        expect(context.get(EVENT_SUBSCRIBER)).toBe(context.get(RabbitMqEventBroker));
        expect(context.get(DATABASE_CONNECTION)).toBeInstanceOf(DatabaseConnection);
        expect(context.get(CollectionModule)).toBeInstanceOf(CollectionModule);
        await context.get(AskRunRequestConsumer).start();
        expect(subscribe).toHaveBeenCalledExactlyOnceWith(
          { consumerName: ASK_STRUCTURED_CONSUMER, eventTypes: [ASK_RUN_REQUESTED_TYPE] },
          expect.any(Function),
        );
        expect(start).not.toHaveBeenCalled();
        expect(query).not.toHaveBeenCalled();
      } finally {
        await context.close();
      }
    },
  );
});
