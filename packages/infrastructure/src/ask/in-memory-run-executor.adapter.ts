import { ExternalFailure, type ExternalFailureKind, type RunExecutor } from '@rei/application';
import type { RunExecutionEvidence, RunExecutionInput, PriceToolReceipt } from '@rei/domain';
import {
  parseRunExecutionRequest,
  parseRunExecutionEvidence,
  sameAskIdentity,
  sameAskInputs,
} from '@rei/contracts';

/** Test-only fake. Never registered in production DI; all captured and returned values are copies. */
export class InMemoryRunExecutor implements RunExecutor {
  readonly #inputs: RunExecutionInput[] = [];
  public constructor(
    private readonly failure?: ExternalFailureKind,
    private readonly priceReceipt?: PriceToolReceipt,
  ) {}
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
    try {
      input = parseRunExecutionRequest(input);
    } catch {
      return Promise.reject(
        new ExternalFailure({ kind: 'rejected', operation: 'run-executor.execute' }),
      );
    }
    this.#inputs.push(structuredClone(input));
    if (this.failure)
      return Promise.reject(
        new ExternalFailure({ kind: this.failure, operation: 'run-executor.execute' }),
      );
    if (input.step !== 'foundation') {
      const receipt = this.priceReceipt;
      if (
        !receipt ||
        !sameAskIdentity(input, receipt) ||
        input.executionId !== receipt.executionId ||
        !sameAskInputs(input.inputs, receipt.inputs)
      )
        return Promise.reject(
          new ExternalFailure({ kind: 'rejected', operation: 'run-executor.execute' }),
        );
      return Promise.resolve(
        structuredClone(
          parseRunExecutionEvidence({
            version: 1,
            eventId: input.eventId,
            runId: input.runId,
            threadId: input.threadId,
            executionId: input.executionId,
            step: input.step,
            outcome: 'price-calculated',
            visitedNodes: [
              input.step === 'text-price-v1' ? 'validatedInputs' : 'fixedDecision',
              'priceTool',
            ],
            receipt,
          }),
        ),
      );
    }
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
