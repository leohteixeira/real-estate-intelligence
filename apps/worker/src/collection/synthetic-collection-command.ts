import { Logger, type INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { CollectSourceOnce } from '@rei/application';
import { runCollectionOperationSpan, SYNTHETIC_LISTING_SOURCE_ID } from '@rei/infrastructure';

import { readCollectionCommandConfig } from '../config';
import { shutdownTelemetry } from '../otel';
import { CollectionCommandModule } from './collection-command.module';

const FALLBACK_CLEANUP_TIMEOUT_MS = 5_000;

function operationKey(argv: readonly string[]): string {
  const value = argv[2]?.trim();
  if (!value) throw new Error('An explicit collection operation key is required.');
  return value;
}

async function runCleanupWithin(
  label: string,
  timeoutMs: number,
  cleanup: () => void | Promise<void>,
): Promise<void> {
  let timeout: NodeJS.Timeout | undefined;
  const timedOut = new Promise<never>((_resolve, reject) => {
    timeout = setTimeout(
      () => reject(new Error(`${label} did not finish within ${timeoutMs}ms.`)),
      timeoutMs,
    );
  });
  try {
    await Promise.race([Promise.resolve().then(cleanup), timedOut]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

export async function runSyntheticCollectionCommand(
  argv: readonly string[],
  environment: NodeJS.ProcessEnv,
): Promise<void> {
  const logger = new Logger('collect-synthetic');
  const shutdownController = new AbortController();
  let context: INestApplicationContext | undefined;
  let cleanupTimeoutMs = FALLBACK_CLEANUP_TIMEOUT_MS;
  let primaryFailure: { readonly error: unknown } | undefined;
  const stopOnSigint = (): void =>
    shutdownController.abort(new Error('Collection command received SIGINT.'));
  const stopOnSigterm = (): void =>
    shutdownController.abort(new Error('Collection command received SIGTERM.'));

  try {
    const key = operationKey(argv);
    const config = readCollectionCommandConfig(environment);
    cleanupTimeoutMs = config.deadlineMs;
    const signal = AbortSignal.any([
      shutdownController.signal,
      AbortSignal.timeout(config.deadlineMs),
    ]);
    process.once('SIGINT', stopOnSigint);
    process.once('SIGTERM', stopOnSigterm);
    context = await NestFactory.createApplicationContext(CollectionCommandModule, {
      logger: ['error', 'warn'],
    });
    const service = context.get(CollectSourceOnce);
    const result = await runCollectionOperationSpan(signal, (traceContext) =>
      service.execute(SYNTHETIC_LISTING_SOURCE_ID, key, traceContext, signal),
    );
    logger.log(
      JSON.stringify({
        operationKey: result.operationKey,
        runId: result.runId,
        snapshotId: result.snapshotId,
        contentHash: result.contentHash,
        objectKey: result.objectKey,
        replayed: result.replayed,
      }),
    );
  } catch (error) {
    primaryFailure = { error };
  } finally {
    process.removeListener('SIGINT', stopOnSigint);
    process.removeListener('SIGTERM', stopOnSigterm);
    const contextToClose = context;
    const cleanupResults = await Promise.allSettled([
      contextToClose
        ? runCleanupWithin('Nest application context cleanup', cleanupTimeoutMs, () =>
            contextToClose.close(),
          )
        : Promise.resolve(),
      runCleanupWithin('Telemetry cleanup', cleanupTimeoutMs, shutdownTelemetry),
    ]);
    const cleanupFailure = cleanupResults.find(
      (result): result is PromiseRejectedResult => result.status === 'rejected',
    );
    if (!primaryFailure && cleanupFailure) {
      primaryFailure = { error: cleanupFailure.reason };
    }
  }

  if (primaryFailure) throw primaryFailure.error;
}
