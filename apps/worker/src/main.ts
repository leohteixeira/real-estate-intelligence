import 'reflect-metadata';

import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import { WorkerModule } from './worker.module';
import { HeartbeatJob } from './heartbeat.job';

/**
 * The worker runs as a standalone Nest application context: no HTTP server,
 * but the same modules, providers and lifecycle hooks as the API.
 */
async function bootstrap(): Promise<void> {
  const logger = new Logger('bootstrap');
  const context = await NestFactory.createApplicationContext(WorkerModule);

  context.enableShutdownHooks();

  const heartbeat = context.get(HeartbeatJob);
  heartbeat.start();

  logger.log('the worker started');

  const stop = async (signal: NodeJS.Signals): Promise<void> => {
    logger.log(`received ${signal}, shutting down`);
    heartbeat.stop();
    await context.close();
  };

  process.once('SIGINT', (signal) => void stop(signal));
  process.once('SIGTERM', (signal) => void stop(signal));
}

void bootstrap();
