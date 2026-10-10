/** Stable asynchronous response returned after the tracer transaction commits. */
export interface AuditTraceAcceptedResponse {
  readonly eventId: string;
}
