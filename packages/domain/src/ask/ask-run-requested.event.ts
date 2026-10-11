import { DomainEvent, type DomainEventEnvelope } from '../shared/domain-event.js';
import { parseUuidV7 } from '../shared/uuid-v7.js';
import type { AskRequestedIdentity } from './ask-live.types.js';
import type { TraceContext } from '../shared/trace-context.js';
export const ASK_RUN_REQUESTED_TYPE = 'ask.run.requested';
export const ASK_STRUCTURED_CONSUMER = 'ask.structured-run';
export class AskRunRequested extends DomainEvent<
  'ask.run.requested',
  { readonly runId: string; readonly threadId: string }
> {
  public constructor(
    identity: AskRequestedIdentity,
    at: string,
    traceContext: TraceContext | null = null,
  ) {
    super({
      eventId: identity.eventId,
      aggregateId: identity.runId,
      type: ASK_RUN_REQUESTED_TYPE,
      version: 1,
      occurredAt: at,
      traceContext,
      payload: { runId: parseUuidV7(identity.runId), threadId: parseUuidV7(identity.threadId) },
    });
  }
}
export function askRequestedIdentity(event: DomainEventEnvelope): AskRequestedIdentity {
  const payload = event.payload;
  if (
    event.type !== ASK_RUN_REQUESTED_TYPE ||
    event.version !== 1 ||
    Object.keys(payload).length !== 2 ||
    !('runId' in payload) ||
    !('threadId' in payload) ||
    typeof payload.runId !== 'string' ||
    typeof payload.threadId !== 'string' ||
    event.aggregateId !== payload.runId
  )
    throw new TypeError('Invalid Ask requested event.');
  return {
    version: 1,
    eventId: parseUuidV7(event.eventId),
    runId: parseUuidV7(payload.runId),
    threadId: parseUuidV7(payload.threadId),
  };
}
