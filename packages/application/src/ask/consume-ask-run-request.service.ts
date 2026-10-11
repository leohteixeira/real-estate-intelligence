import { askRequestedIdentity } from '@rei/domain';
import type { EventEnvelope } from '../shared/outbox.js';
import { isExternalFailure } from '../shared/external-failure.js';
import type { RunExecutor } from './run-executor.port.js';
import type { RunDispatch } from './run-dispatch.port.js';
export class ConsumeAskRunRequest {
  public constructor(
    private readonly dispatch: RunDispatch,
    private readonly executor: RunExecutor,
  ) {}
  public async execute(
    event: EventEnvelope,
    signal: AbortSignal,
    deadlineAt: number,
  ): Promise<void> {
    signal.throwIfAborted();
    const identity = askRequestedIdentity(event);
    const admissionDeadline = Math.min(deadlineAt - 10_000, Date.now() + 40_000);
    let claim = await this.dispatch.claim(
      identity,
      signal,
      Math.min(admissionDeadline, Date.now() + 5_000),
    );
    while (claim.disposition === 'busy') {
      const delay = Math.min(claim.retryAfterMs, admissionDeadline - Date.now());
      if (delay <= 0) throw new Error('Ask admission unavailable.');
      await new Promise<void>((resolve, reject) => {
        const stopped = () => {
          clearTimeout(timer);
          reject(signal.reason);
        };
        const timer = setTimeout(() => {
          signal.removeEventListener('abort', stopped);
          resolve();
        }, delay);
        signal.addEventListener('abort', stopped, { once: true });
        if (signal.aborted) stopped();
      });
      if (Date.now() >= admissionDeadline) throw new Error('Ask admission unavailable.');
      claim = await this.dispatch.claim(
        identity,
        signal,
        Math.min(admissionDeadline, Date.now() + 5_000),
      );
    }
    if (claim.disposition === 'terminal') return;
    deadlineAt = Math.min(deadlineAt, Date.now() + 10_000);
    let evidence;
    try {
      evidence = await this.executor.execute(claim.input, signal, deadlineAt);
      if (
        evidence.step !== claim.input.step ||
        !('eventId' in evidence) ||
        evidence.eventId !== identity.eventId ||
        evidence.runId !== identity.runId ||
        evidence.threadId !== identity.threadId ||
        evidence.executionId !== claim.input.executionId
      )
        throw new TypeError('Invalid executor evidence.');
    } catch (error) {
      signal.throwIfAborted();
      if (
        Date.now() >= deadlineAt ||
        (isExternalFailure(error) && (error.kind === 'cancelled' || error.kind === 'exhausted'))
      )
        throw error;
      await this.dispatch.complete(
        {
          ...identity,
          executionId: claim.input.executionId,
          evidence: null,
          failure: 'execution_unavailable',
        },
        signal,
        deadlineAt,
      );
      return;
    }
    signal.throwIfAborted();
    await this.dispatch.complete(
      { ...identity, executionId: claim.input.executionId, evidence, failure: null },
      signal,
      deadlineAt,
    );
  }
}
