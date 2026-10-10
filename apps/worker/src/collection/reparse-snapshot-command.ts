import { Logger, type INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ReparseSnapshot } from '@rei/application';
import { parseUuidV7, parseReparseLabel } from '@rei/domain';
import { runCollectionOperationSpan } from '@rei/infrastructure';
import { readCollectionCommandConfig } from '../config';
import { shutdownTelemetry } from '../otel';
import { SnapshotReparseCommandModule } from './snapshot-reparse-command.module';

function argumentsFor(argv: readonly string[]) {
  const values = argv.slice(2);
  if (values.length !== 3 || values.some((value) => !value || value.startsWith('-')))
    throw new Error('Exactly one snapshot ID, parser revision and operation key are required.');
  return {
    snapshotId: parseUuidV7(values[0]!),
    parserRevision: parseReparseLabel(values[1], 'parserRevision'),
    operationKey: parseReparseLabel(values[2], 'operationKey'),
  };
}
async function bounded(timeoutMs: number, work: () => Promise<void>) {
  let timer: NodeJS.Timeout | undefined;
  try {
    await Promise.race([
      Promise.resolve().then(work),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error('Command cleanup timed out.')), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
export async function runSnapshotReparseCommand(
  argv: readonly string[],
  environment: NodeJS.ProcessEnv,
): Promise<void> {
  const controller = new AbortController();
  let context: INestApplicationContext | undefined;
  let primary: unknown;
  let timeoutMs = 5_000;
  const stop = () => controller.abort(new Error('Snapshot reparse command interrupted.'));
  try {
    const args = argumentsFor(argv);
    const config = readCollectionCommandConfig(environment);
    timeoutMs = config.deadlineMs;
    const deadlineAt = Date.now() + timeoutMs;
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(timeoutMs)]);
    process.once('SIGINT', stop);
    process.once('SIGTERM', stop);
    // Bound bootstrap too; late-created contexts must be closed when a deadline wins.
    const bootstrap = NestFactory.createApplicationContext(SnapshotReparseCommandModule, {
      logger: ['error', 'warn', 'log'],
    });
    let removeAbort = () => {};
    try {
      context = await Promise.race([
        bootstrap,
        new Promise<never>((_resolve, reject) => {
          const aborted = () => reject(signal.reason);
          signal.addEventListener('abort', aborted, { once: true });
          removeAbort = () => signal.removeEventListener('abort', aborted);
          if (signal.aborted) aborted();
        }),
      ]);
    } catch (error) {
      void bootstrap.then(
        (late) => bounded(timeoutMs, () => late.close()).catch(() => undefined),
        () => undefined,
      );
      throw error;
    } finally {
      removeAbort();
    }
    const service = context.get(ReparseSnapshot);
    const result = await runCollectionOperationSpan(signal, (traceContext) =>
      service.execute(
        args.snapshotId,
        args.parserRevision,
        args.operationKey,
        traceContext,
        signal,
        deadlineAt,
      ),
    );
    new Logger('reparse-snapshot').log(JSON.stringify({ status: 'completed', ...result }));
  } catch (error) {
    primary = error;
  } finally {
    process.removeListener('SIGINT', stop);
    process.removeListener('SIGTERM', stop);
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
