import { Logger, type INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { CollectSourceRun } from '@rei/application';
import { runCollectionOperationSpan } from '@rei/infrastructure';

import { readCollectionCommandConfig } from '../config';
import { shutdownTelemetry } from '../otel';
import { ResumableCollectionCommandModule } from './resumable-collection-command.module';

function argumentsFor(argv: readonly string[]): { sourceId: string; operationKey: string } {
  const values = argv.slice(2);
  if (
    values.length !== 2 ||
    !values[0] ||
    !values[1] ||
    values.some((value) => value.startsWith('-'))
  ) {
    throw new Error('Exactly one source ID and one operation key are required.');
  }
  return { sourceId: values[0], operationKey: values[1] };
}

async function bounded(label: string, timeoutMs: number, work: () => void | Promise<void>) {
  let timer: NodeJS.Timeout | undefined;
  try {
    await Promise.race([
      Promise.resolve().then(work),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} cleanup timed out.`)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function runResumableCollectionCommand(
  argv: readonly string[],
  environment: NodeJS.ProcessEnv,
): Promise<void> {
  const logger = new Logger('collect-resumable');
  const shutdown = new AbortController();
  let context: INestApplicationContext | undefined;
  let timeoutMs = 5_000;
  let primary: unknown;
  const sigint = () => shutdown.abort(new Error('Collection command received SIGINT.'));
  const sigterm = () => shutdown.abort(new Error('Collection command received SIGTERM.'));
  try {
    const args = argumentsFor(argv);
    const config = readCollectionCommandConfig(environment);
    timeoutMs = config.deadlineMs;
    const signal = AbortSignal.any([shutdown.signal, AbortSignal.timeout(config.deadlineMs)]);
    process.once('SIGINT', sigint);
    process.once('SIGTERM', sigterm);
    context = await NestFactory.createApplicationContext(ResumableCollectionCommandModule, {
      logger: ['error', 'warn'],
    });
    const service = context.get(CollectSourceRun);
    const result = await runCollectionOperationSpan(signal, (traceContext) =>
      service.execute(args.sourceId, args.operationKey, traceContext, signal),
    );
    logger.log(
      JSON.stringify({
        operationKey: result.operationKey,
        sourceId: result.sourceId,
        runId: result.runId,
        observedCount: result.observedCount,
        parsedCount: result.parsedCount,
        manifestHash: result.manifestHash,
        replayed: result.replayed,
      }),
    );
  } catch (error) {
    primary = error;
  } finally {
    process.removeListener('SIGINT', sigint);
    process.removeListener('SIGTERM', sigterm);
    const closeContext = context;
    const cleanups = await Promise.allSettled([
      closeContext
        ? bounded('Nest context', timeoutMs, () => closeContext.close())
        : Promise.resolve(),
      bounded('Telemetry', timeoutMs, shutdownTelemetry),
    ]);
    const failed = cleanups.find(
      (result): result is PromiseRejectedResult => result.status === 'rejected',
    );
    if (primary === undefined && failed) primary = failed.reason;
  }
  if (primary !== undefined) throw primary;
}
