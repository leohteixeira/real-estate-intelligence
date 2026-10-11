import { ExternalFailure, type ExternalFailureKind, type RunExecutor } from '@rei/application';
import type { RunExecutionEvidence, RunExecutionInput } from '@rei/domain';

/** Test-only fake. Never registered in production DI; all captured and returned values are copies. */
export class InMemoryRunExecutor implements RunExecutor {
  readonly #inputs: RunExecutionInput[] = [];
  public constructor(private readonly failure?: ExternalFailureKind) {}
  public get inputs(): readonly RunExecutionInput[] {
    return structuredClone(this.#inputs);
  }
  public execute(
    input: RunExecutionInput,
    signal: AbortSignal,
    deadlineAt: number,
  ): Promise<RunExecutionEvidence> {
    if (signal.aborted)
      return Promise.reject(
        new ExternalFailure({ kind: 'cancelled', operation: 'run-executor.execute' }),
      );
    if (!Number.isFinite(deadlineAt) || deadlineAt <= Date.now())
      return Promise.reject(
        new ExternalFailure({ kind: 'transient', operation: 'run-executor.execute' }),
      );
    this.#inputs.push(structuredClone(input));
    if (this.failure)
      return Promise.reject(
        new ExternalFailure({ kind: this.failure, operation: 'run-executor.execute' }),
      );
    return Promise.resolve({
      version: 1,
      runId: input.runId,
      threadId: input.threadId,
      step: 'foundation',
      outcome: 'foundation-executed',
      visitedNodes: ['noOp'],
    });
  }
}
