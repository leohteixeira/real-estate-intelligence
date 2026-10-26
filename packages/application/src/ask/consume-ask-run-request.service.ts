import { askRequestedIdentity } from '@rei/domain';
import type { EventEnvelope } from '../shared/outbox.js';
import { isExternalFailure } from '../shared/external-failure.js';
import type { RunExecutor } from './run-executor.port.js';
import type { RunDispatch } from './run-dispatch.port.js';
import type { EventHandlerResult } from '../shared/event-subscriber.js';
export class ConsumeAskRunRequest {
  public constructor(
    private readonly dispatch: RunDispatch,
    private readonly executor: RunExecutor,
  ) {}
  public async execute(
    event: EventEnvelope,
    signal: AbortSignal,
    deadlineAt: number,
  ): Promise<EventHandlerResult> {
    signal.throwIfAborted();
    const identity = askRequestedIdentity(event);
    const claim = await this.dispatch.claim(
      identity,
      signal,
      Math.min(deadlineAt, Date.now() + 5_000),
    );
    signal.throwIfAborted();
    if (claim.disposition === 'busy') return { disposition: 'deferred' };
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
        (isExternalFailure(error) && ['transient', 'cancelled', 'exhausted'].includes(error.kind))
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
    if (evidence.step === 'routed-text-v1' && evidence.outcome === 'awaiting-confirmation')
      return { disposition: 'deferred' };
  }
}
