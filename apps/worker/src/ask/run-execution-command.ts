import { NestFactory } from '@nestjs/core';
import { trace } from '@opentelemetry/api';
import {
  ExternalFailure,
  isExternalFailure,
  RUN_EXECUTOR,
  type RunExecutor,
} from '@rei/application';
import { parseRunExecutionEvidence, parseRunExecutionRequest } from '@rei/contracts';
import { shutdownTelemetry } from '../otel';
import { RunCommandModule } from './run-command.module';
import { requireRunExecutorConfig } from './run-executor.config';
import { runExecutorResilienceSettings } from './run-executor-resilience.settings';

interface ExecutionContext {
  readonly executor: RunExecutor;
  close(): Promise<void>;
}
interface CommandDependencies {
  input?: AsyncIterable<string | Uint8Array>;
  create?: () => Promise<ExecutionContext>;
  shutdown?: () => Promise<void>;
  output?: (value: string) => void;
  deadlineMs?: number;
  cleanupTimeoutMs?: number;
}
const safeFailure = (error: unknown): ExternalFailure =>
  new ExternalFailure({
    kind: isExternalFailure(error) ? error.kind : 'rejected',
    operation: 'run-executor.execute',
  });

async function within<T>(signal: AbortSignal, operation: () => Promise<T>): Promise<T> {
  signal.throwIfAborted();
  let abort: (() => void) | undefined;
  const stopped = new Promise<never>((_resolve, reject) => {
    abort = () => reject(signal.reason);
    signal.addEventListener('abort', abort, { once: true });
  });
  try {
    return await Promise.race([Promise.resolve().then(operation), stopped]);
  } finally {
    if (abort) signal.removeEventListener('abort', abort);
  }
}
async function boundedCleanup(operation: () => Promise<void>, timeoutMs: number): Promise<void> {
  const controller = new AbortController();
  const timer = setTimeout(
    () =>
      controller.abort(
        new ExternalFailure({ kind: 'exhausted', operation: 'run-executor.cleanup' }),
      ),
    timeoutMs,
  );
  try {
    await within(controller.signal, operation);
  } finally {
    clearTimeout(timer);
  }
}
export async function readExecutionInput(input: AsyncIterable<string | Uint8Array>) {
  try {
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of input) {
      const bytes = Buffer.from(chunk);
      size += bytes.length;
      if (size > 100000) throw new Error();
      chunks.push(bytes);
    }
    return parseRunExecutionRequest(JSON.parse(Buffer.concat(chunks).toString('utf8')));
  } catch {
    throw safeFailure(undefined);
  }
}
async function createContext(): Promise<ExecutionContext> {
  const context = await NestFactory.createApplicationContext(RunCommandModule, {
    logger: false,
    abortOnError: false,
  });
  return { executor: context.get<RunExecutor>(RUN_EXECUTOR), close: () => context.close() };
}

/** Explicit one-shot input comes from stdin; private queries and authority never enter argv. */
export async function runFoundationExecutionCommand(
  environment: NodeJS.ProcessEnv,
  dependencies: CommandDependencies = {},
): Promise<void> {
  const controller = new AbortController();
  const failures: ExternalFailure[] = [];
  let acquisition: Promise<ExecutionContext> | undefined;
  const stop = () =>
    controller.abort(new ExternalFailure({ kind: 'cancelled', operation: 'run-executor.execute' }));
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  const deadlineMs = dependencies.deadlineMs ?? runExecutorResilienceSettings.commandDeadlineMs;
  const cleanupMs = dependencies.cleanupTimeoutMs ?? runExecutorResilienceSettings.cleanupTimeoutMs;
  const deadlineAt = Date.now() + deadlineMs;
  const timer = setTimeout(
    () =>
      controller.abort(
        new ExternalFailure({ kind: 'exhausted', operation: 'run-executor.execute' }),
      ),
    deadlineMs,
  );
  try {
    requireRunExecutorConfig(environment);
    await within(controller.signal, async () => {
      const input = await readExecutionInput(dependencies.input ?? process.stdin);
      controller.signal.throwIfAborted();
      acquisition = (dependencies.create ?? createContext)();
      const created = await acquisition;
      controller.signal.throwIfAborted();
      const evidence = await trace
        .getTracer('real-estate-intelligence.worker.ask')
        .startActiveSpan('ask.foundation.execute', async (span) => {
          try {
            return await created.executor.execute(input, controller.signal, deadlineAt);
          } finally {
            span.end();
          }
        });
      controller.signal.throwIfAborted();
      const parsed = parseRunExecutionEvidence(evidence);
      if (
        parsed.runId !== input.runId ||
        parsed.threadId !== input.threadId ||
        parsed.step !== input.step
      )
        throw new Error();
      (dependencies.output ?? console.log)(JSON.stringify(parsed));
    });
  } catch (error) {
    failures.push(safeFailure(error));
  } finally {
    clearTimeout(timer);
    process.removeListener('SIGINT', stop);
    process.removeListener('SIGTERM', stop);
    // This one-shot command owns stdin; a stalled open pipe must not keep it alive after cancellation.
    if (!dependencies.input && controller.signal.aborted) process.stdin.destroy();
    const pending = acquisition;
    const cleanup = await Promise.allSettled([
      pending
        ? boundedCleanup(async () => {
            // Finalization owns even a late context; failed acquisition owns nothing to close.
            const owned = await pending.catch(() => undefined);
            await owned?.close();
          }, cleanupMs)
        : Promise.resolve(),
      boundedCleanup(dependencies.shutdown ?? shutdownTelemetry, cleanupMs),
    ]);
    for (const result of cleanup)
      if (result.status === 'rejected') failures.push(safeFailure(result.reason));
  }
  if (failures.length === 1) throw failures[0];
  if (failures.length) throw new AggregateError(failures, 'Foundation execution failed.');
}
