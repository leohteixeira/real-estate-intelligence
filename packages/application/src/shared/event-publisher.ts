import type { EventEnvelope } from './outbox.js';

export const EVENT_PUBLISHER = Symbol.for('rei.EventPublisher');

/** Publishes one event and resolves only after the broker confirms it. */
export interface EventPublisher {
  publish(event: EventEnvelope, signal: AbortSignal, deadlineAt?: number): Promise<void>;
}
