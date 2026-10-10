import 'reflect-metadata';
import { RabbitMqEventBroker } from '@rei/infrastructure';

import { AuditTraceConsumer } from './audit/audit-trace.consumer';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import { WorkerModule } from './worker.module';
import { HeartbeatJob } from './heartbeat.job';
import { OutboxRelayJob } from './shared/outbox-relay.job';
import { clearWorkerReadiness, markWorkerReady } from './worker-readiness';

/**
 * The worker runs as a standalone Nest application context: no HTTP server,
 * but the same modules, providers and lifecycle hooks as the API.
 */
async function bootstrap(): Promise<void> {
  const logger = new Logger('bootstrap');
  await clearWorkerReadiness();
  const context = await NestFactory.createApplicationContext(WorkerModule);

  const heartbeat = context.get(HeartbeatJob);
  const relay = context.get(OutboxRelayJob);
  const auditConsumer = context.get(AuditTraceConsumer);
  const broker = context.get(RabbitMqEventBroker);
  await auditConsumer.start();
  relay.start();
  heartbeat.start();

  let stopping: Promise<void> | undefined;
  const stop = (signal: NodeJS.Signals): Promise<void> => {
    stopping ??= (async () => {
      logger.log(`received ${signal}, shutting down`);
      await clearWorkerReadiness();
      await relay.stop();
      heartbeat.stop();
      await broker.close();
      await context.close();
    })();
    return stopping;
  };

  process.once('SIGINT', (signal) => void stop(signal));
  process.once('SIGTERM', (signal) => void stop(signal));

  await markWorkerReady();
  logger.log('the worker started');
}

void bootstrap();
