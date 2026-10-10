import type { EventEnvelope } from './outbox.js';

export const EVENT_SUBSCRIBER = Symbol.for('rei.EventSubscriber');

export type EventHandler = (event: EventEnvelope) => Promise<void>;

export interface EventSubscription {
  /** Stable logical identity used as both the durable queue name and inbox key. */
  readonly consumerName: string;
  readonly eventTypes: readonly string[];
}

export interface EventSubscriber {
  subscribe(subscription: EventSubscription, handler: EventHandler): Promise<void>;
}
