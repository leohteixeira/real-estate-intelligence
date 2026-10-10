import type { EventEnvelope } from './outbox.js';

export const EVENT_SUBSCRIBER = Symbol.for('rei.EventSubscriber');

export type EventHandler = (event: EventEnvelope) => Promise<void>;

export interface EventSubscriber {
  subscribe(eventType: string, handler: EventHandler): Promise<void>;
}
