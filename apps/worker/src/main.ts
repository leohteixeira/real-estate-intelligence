import 'reflect-metadata';
import { RabbitMqEventBroker } from '@rei/infrastructure';

import { AuditTraceConsumer } from './audit/audit-trace.consumer';
import { CollectionAuditConsumer } from './collection/collection-audit.consumer';
import { CollectionRunRequestConsumer } from './collection/collection-run-request.consumer';
import { CollectionScheduleJob } from './collection/collection-schedule.job';
import { SnapshotRetentionJob } from './collection/snapshot-retention.job';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import { readConfig } from './config';
import { shutdownTelemetry } from './otel';
import { WorkerModule } from './worker.module';
import { HeartbeatJob } from './heartbeat.job';
import { OutboxRelayJob } from './shared/outbox-relay.job';
import { BrokerConnectionSupervisor } from './shared/broker-connection-supervisor';
import { DeliveryRetentionJob } from './shared/delivery-retention.job';
import { clearWorkerReadiness, markWorkerReady } from './worker-readiness';
import { shutdownWorker, WorkerShutdownTimeoutError } from './worker-shutdown';

/**
 * The worker runs as a standalone Nest application context: no HTTP server,
 * but the same modules, providers and lifecycle hooks as the API.
 */
async function bootstrap(): Promise<void> {
  const logger = new Logger('bootstrap');
  await clearWorkerReadiness();
  const { shutdownTimeoutMs } = readConfig(process.env);
  const context = await NestFactory.createApplicationContext(WorkerModule);

  const heartbeat = context.get(HeartbeatJob);
  const relay = context.get(OutboxRelayJob);
  const auditConsumer = context.get(AuditTraceConsumer);
  const collectionConsumer = context.get(CollectionAuditConsumer);
  const collectionRunConsumer = context.get(CollectionRunRequestConsumer);
  const collectionSchedule = context.get(CollectionScheduleJob);
  const broker = context.get(RabbitMqEventBroker);
  const brokerSupervisor = context.get(BrokerConnectionSupervisor);
  const retention = context.get(DeliveryRetentionJob);
  const snapshotRetention = context.get(SnapshotRetentionJob);
  await auditConsumer.start();
  await collectionConsumer.start();
  await collectionRunConsumer.start();
  brokerSupervisor.start();
  relay.start();
  retention.start();
  snapshotRetention.start();
  heartbeat.start();
  collectionSchedule.start();

  let stopping: Promise<void> | undefined;
  const stop = (signal: NodeJS.Signals): Promise<void> => {
    stopping ??= (async () => {
      logger.log(`received ${signal}, shutting down`);
      await shutdownWorker(
        {
          clearReadiness: () => clearWorkerReadiness(),
          stopCollectionSchedule: () => collectionSchedule.stop(),
          stopBrokerSupervisor: () => brokerSupervisor.stop(),
          stopRelay: () => relay.stop(),
          stopRetention: () => retention.stop(),
          stopSnapshotRetention: () => snapshotRetention.stop(),
          stopHeartbeat: () => heartbeat.stop(),
          closeBroker: () => broker.close(),
          closeContext: () => context.close(),
          closeTelemetry: () => shutdownTelemetry(),
        },
        shutdownTimeoutMs,
      );
    })();
    return stopping;
  };

  const handleSignal = (signal: NodeJS.Signals): void => {
    void stop(signal).catch((error: unknown) => {
      const message =
        error instanceof WorkerShutdownTimeoutError
          ? 'the worker shutdown timed out'
          : 'the worker shutdown failed';
      logger.error(message);
      process.exit(1);
    });
  };

  process.once('SIGINT', handleSignal);
  process.once('SIGTERM', handleSignal);

  await markWorkerReady();
  logger.log('the worker started');
}

void bootstrap();
