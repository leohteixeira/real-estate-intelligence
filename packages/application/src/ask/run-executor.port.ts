import type { RunExecutionEvidence, RunExecutionInput } from '@rei/domain';

export const RUN_EXECUTOR = Symbol('RUN_EXECUTOR');

/** One foundation operation; implementations fail only with sanitized ExternalFailure. */
export interface RunExecutor {
  execute(
    input: RunExecutionInput,
    signal: AbortSignal,
    deadlineAt: number,
  ): Promise<RunExecutionEvidence>;
}
