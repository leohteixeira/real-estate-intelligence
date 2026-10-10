import { DomainEvent, type DomainEventInput, type TraceContext } from '../shared/index.js';

export const AUDIT_TRACE_REQUESTED_TYPE = 'audit.trace.requested' as const;
export const AUDIT_TRACE_REQUESTED_VERSION = 1 as const;

export type AuditTraceRequestedPayload = Record<string, never>;

export type AuditTraceRequestedInput = Omit<
  DomainEventInput<typeof AUDIT_TRACE_REQUESTED_TYPE, AuditTraceRequestedPayload>,
  'type' | 'version' | 'traceContext' | 'payload'
> & {
  readonly traceContext?: TraceContext | null;
};

/** Technical event used to prove the durable event path without inventing a business aggregate. */
export class AuditTraceRequested extends DomainEvent<
  typeof AUDIT_TRACE_REQUESTED_TYPE,
  AuditTraceRequestedPayload
> {
  public constructor(input: AuditTraceRequestedInput) {
    super({
      ...input,
      type: AUDIT_TRACE_REQUESTED_TYPE,
      version: AUDIT_TRACE_REQUESTED_VERSION,
      traceContext: input.traceContext ?? null,
      payload: {},
    });
  }
}
