import { ConsoleLogger, type INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import {
  CLOCK,
  COLLECTION_RUN_REPOSITORY,
  CollectSourceRun,
  ExternalFailure,
  OUTBOX_APPEND_PORT,
  RAW_SNAPSHOT_STORE,
  SNAPSHOT_SANITIZER,
  SOURCE_REGISTER_REPOSITORY,
  TRANSACTION_RUNNER,
  UUID_V7_GENERATOR,
  type SourceRegisterRepository,
} from '@rei/application';
import { decideSourceEnablement } from '@rei/domain';
import {
  PostgresListingSuppression,
  SYNTHETIC_SAO_PAULO_DATASET,
  SyntheticSaoPauloListingSource,
  runCollectionOperationSpan,
} from '@rei/infrastructure';

import { readCollectionCommandConfig } from '../config';
import { shutdownTelemetry } from '../otel';
import { DATABASE_CONNECTION } from '../persistence.module';
import { ResilientListingSource } from './resilient-listing-source';
import { ResumableCollectionCommandModule } from './resumable-collection-command.module';

async function bounded(timeoutMs: number, work: () => void | Promise<void>): Promise<void> {
  let timer: NodeJS.Timeout | undefined;
  try {
    await Promise.race([
      Promise.resolve().then(work),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error('Seed command cleanup timed out.')), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Owner-only replay of the immutable catalogue through real collection and its checkpoints. */
export async function runSeedSyntheticCommand(
  argv: readonly string[],
  environment: NodeJS.ProcessEnv,
): Promise<void> {
  const logger = new ConsoleLogger('seed-synthetic', { logLevels: ['log', 'error', 'warn'] });
  const shutdown = new AbortController();
  const sigint = () => shutdown.abort(new Error('Seed command received SIGINT.'));
  const sigterm = () => shutdown.abort(new Error('Seed command received SIGTERM.'));
  let context: INestApplicationContext | undefined;
  let timeoutMs = 5_000;
  let primary: unknown;
  try {
    if (argv.length !== 2) throw new TypeError('Synthetic seed takes no arguments.');
    const config = readCollectionCommandConfig(environment);
    timeoutMs = config.deadlineMs;
    process.once('SIGINT', sigint);
    process.once('SIGTERM', sigterm);
    context = await NestFactory.createApplicationContext(ResumableCollectionCommandModule, {
      logger: ['error', 'warn'],
    });
    const register = context.get<SourceRegisterRepository>(SOURCE_REGISTER_REPOSITORY);
    const preflight = AbortSignal.any([shutdown.signal, AbortSignal.timeout(timeoutMs)]);
    for (const { sourceId } of SYNTHETIC_SAO_PAULO_DATASET.sources) {
      preflight.throwIfAborted();
      const source = await register.findById(sourceId, preflight);
      preflight.throwIfAborted();
      if (
        !source?.enabled ||
        source.category !== 'synthetic-listing' ||
        source.access.method !== 'repository-fixture' ||
        !decideSourceEnablement(source).eligible
      ) {
        throw new ExternalFailure({ kind: 'forbidden', operation: 'collection.seed.preflight' });
      }
    }
    for (const cycle of SYNTHETIC_SAO_PAULO_DATASET.runs) {
      const service = new CollectSourceRun(
        new ResilientListingSource(
          new SyntheticSaoPauloListingSource(config.syntheticPageDelayMs, cycle.runKey),
          register,
        ),
        context.get(RAW_SNAPSHOT_STORE),
        register,
        context.get(COLLECTION_RUN_REPOSITORY),
        context.get(TRANSACTION_RUNNER),
        context.get(UUID_V7_GENERATOR),
        context.get(CLOCK),
        context.get(OUTBOX_APPEND_PORT),
        context.get(SNAPSHOT_SANITIZER),
        new PostgresListingSuppression(context.get(DATABASE_CONNECTION)),
      );
      for (const { sourceId } of SYNTHETIC_SAO_PAULO_DATASET.sources) {
        shutdown.signal.throwIfAborted();
        const deadlineAt = Date.now() + timeoutMs;
        const signal = AbortSignal.any([shutdown.signal, AbortSignal.timeout(timeoutMs)]);
        const operationKey = `seed:${SYNTHETIC_SAO_PAULO_DATASET.version}:${cycle.runKey}:${sourceId}`;
        const result = await runCollectionOperationSpan(signal, (traceContext) =>
          service.execute(sourceId, operationKey, traceContext, signal, deadlineAt),
        );
        signal.throwIfAborted();
        logger.log(
          JSON.stringify({
            datasetVersion: SYNTHETIC_SAO_PAULO_DATASET.version,
            cycle: cycle.runKey,
            ...result,
          }),
        );
        if (result.status !== 'completed')
          throw new ExternalFailure({ kind: 'forbidden', operation: 'collection.seed.paused' });
      }
    }
  } catch (error) {
    primary = error;
  } finally {
    process.removeListener('SIGINT', sigint);
    process.removeListener('SIGTERM', sigterm);
    const owned = context;
    const cleanups = await Promise.allSettled([
      owned ? bounded(timeoutMs, () => owned.close()) : Promise.resolve(),
      bounded(timeoutMs, shutdownTelemetry),
    ]);
    const failed = cleanups.find(
      (result): result is PromiseRejectedResult => result.status === 'rejected',
    );
    if (primary === undefined && failed) primary = failed.reason;
  }
  if (primary !== undefined) throw primary;
}
