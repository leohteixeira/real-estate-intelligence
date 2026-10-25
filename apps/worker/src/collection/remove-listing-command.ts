import { Logger, type INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { RemoveListing } from '@rei/application';
import { parseCollectionSourceListingId } from '@rei/domain';
import { validateSourceId } from '@rei/application';
import { runCollectionOperationSpan } from '@rei/infrastructure';
import { readCollectionCommandConfig } from '../config';
import { shutdownTelemetry } from '../otel';
import { ListingRemovalCommandModule } from './listing-removal-command.module';

function argumentsFor(argv: readonly string[]) {
  const values = argv.slice(2);
  if (values.length !== 2 || values.some((value) => !value || value.startsWith('-')))
    throw new Error('Exactly one source ID and stable listing ID are required.');
  return {
    sourceId: validateSourceId(values[0]!),
    sourceListingId: parseCollectionSourceListingId(values[1]!),
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
export async function runListingRemovalCommand(
  argv: readonly string[],
  environment: NodeJS.ProcessEnv,
): Promise<void> {
  const controller = new AbortController();
  let context: INestApplicationContext | undefined;
  let primary: unknown;
  let timeoutMs = 5_000;
  const stop = () => controller.abort(new Error('Listing removal command interrupted.'));
  try {
    const args = argumentsFor(argv);
    const config = readCollectionCommandConfig(environment);
    timeoutMs = config.deadlineMs;
    const deadlineAt = Date.now() + timeoutMs;
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(timeoutMs)]);
    process.once('SIGINT', stop);
    process.once('SIGTERM', stop);
    // Bound bootstrap too; late-created contexts must be closed when a deadline wins.
    const bootstrap = NestFactory.createApplicationContext(ListingRemovalCommandModule, {
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
    const service = context.get(RemoveListing);
    const result = await runCollectionOperationSpan(signal, (traceContext) =>
      service.execute(args.sourceId, args.sourceListingId, traceContext, signal, deadlineAt),
    );
    new Logger('remove-listing').log(JSON.stringify({ status: 'completed', ...result }));
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
