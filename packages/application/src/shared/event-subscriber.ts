import type { EventEnvelope } from './outbox.js';

export const EVENT_SUBSCRIBER = Symbol.for('rei.EventSubscriber');

export interface EventDeliveryContext {
  /** Aborts on handler deadline, generation loss, or controlled worker shutdown. */
  readonly signal: AbortSignal;
  readonly deadlineAt: number;
}

export type EventHandlerResult = void | { readonly disposition: 'deferred' };
export type EventHandler = (
  event: EventEnvelope,
  delivery: EventDeliveryContext,
) => Promise<EventHandlerResult>;

export interface EventSubscription {
  /** Stable logical identity used as both the durable queue name and inbox key. */
  readonly consumerName: string;
  readonly eventTypes: readonly string[];
}

export interface EventSubscriber {
  subscribe(subscription: EventSubscription, handler: EventHandler): Promise<void>;
}
