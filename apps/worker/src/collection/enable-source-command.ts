import { Logger, type INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { EnableSource, type EnableSourceResult, validateSourceId } from '@rei/application';

import { shutdownTelemetry } from '../otel';
import { SourceRegisterCommandModule } from './source-register-command.module';

const CLEANUP_TIMEOUT_MS = 5_000;

export class SourceEnableCommandError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'SourceEnableCommandError';
  }
}

export function parseSourceEnableArguments(argv: readonly string[]): string {
  const values = argv.slice(2);
  if (values.length !== 1) {
    throw new SourceEnableCommandError('exactly one source ID is required');
  }
  const sourceId = values[0]!.trim();
  if (sourceId.startsWith('-')) {
    throw new SourceEnableCommandError('source ID must not be an option');
  }
  try {
    return validateSourceId(sourceId);
  } catch {
    throw new SourceEnableCommandError('source ID must be a lower-kebab identifier');
  }
}

export async function executeSourceEnable(
  enableSource: EnableSource,
  sourceId: string,
  signal: AbortSignal,
): Promise<EnableSourceResult> {
  const result = await enableSource.execute(sourceId, signal);
  if (result.status === 'not-found') {
    throw new SourceEnableCommandError(`source '${sourceId}' was not found`);
  }
  if (result.status === 'refused') {
    throw new SourceEnableCommandError(`source '${sourceId}' cannot be enabled (${result.reason})`);
  }
  return result;
}

async function withinCleanupTimeout(cleanup: () => void | Promise<void>): Promise<void> {
  let timeout: NodeJS.Timeout | undefined;
  try {
    await Promise.race([
      Promise.resolve().then(cleanup),
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(
          () => reject(new Error('command cleanup timed out')),
          CLEANUP_TIMEOUT_MS,
        );
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

export async function runSourceEnableCommand(argv: readonly string[]): Promise<void> {
  const logger = new Logger('source-enable');
  const shutdown = new AbortController();
  const stop = (): void => shutdown.abort(new Error('source enable command was cancelled'));
  let context: INestApplicationContext | undefined;
  let primaryFailure: unknown;

  try {
    const sourceId = parseSourceEnableArguments(argv);
    process.once('SIGINT', stop);
    process.once('SIGTERM', stop);
    context = await NestFactory.createApplicationContext(SourceRegisterCommandModule, {
      logger: ['error', 'warn'],
    });
    const result = await executeSourceEnable(context.get(EnableSource), sourceId, shutdown.signal);
    logger.log(JSON.stringify({ sourceId, status: result.status, enabled: true }));
  } catch (error) {
    primaryFailure = error;
  } finally {
    process.removeListener('SIGINT', stop);
    process.removeListener('SIGTERM', stop);
    const closingContext = context;
    const cleanup = await Promise.allSettled([
      closingContext ? withinCleanupTimeout(() => closingContext.close()) : Promise.resolve(),
      withinCleanupTimeout(shutdownTelemetry),
    ]);
    const cleanupFailure = cleanup.find(
      (result): result is PromiseRejectedResult => result.status === 'rejected',
    );
    if (primaryFailure === undefined && cleanupFailure) primaryFailure = cleanupFailure.reason;
  }

  if (primaryFailure !== undefined) throw primaryFailure;
}
