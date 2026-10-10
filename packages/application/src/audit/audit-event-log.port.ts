import type { EventEnvelope } from '../shared/index.js';

export const AUDIT_EVENT_LOG = Symbol.for('rei.AuditEventLog');

/** Append-only audit surface; committing the append is part of the method contract. */
export interface AuditEventLog {
  append(event: EventEnvelope): Promise<void>;
}
