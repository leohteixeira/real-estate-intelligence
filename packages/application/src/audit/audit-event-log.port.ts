import type { EventEnvelope, Transaction } from '../shared/index.js';

export const AUDIT_EVENT_LOG = Symbol.for('rei.AuditEventLog');

/** Append-only audit surface used inside the caller-owned consumer transaction. */
export interface AuditEventLog {
  append(transaction: Transaction, event: EventEnvelope): Promise<void>;
}
