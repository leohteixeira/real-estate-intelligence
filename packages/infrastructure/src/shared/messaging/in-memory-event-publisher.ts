import type { EventEnvelope, EventPublisher } from '@rei/application';

function freeze<T>(value: T): T {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value)) {
    return value;
  }
  for (const child of Object.values(value)) {
    freeze(child);
  }
  return Object.freeze(value);
}

/** Ordered, abort-aware publisher fake for tests. It is never registered by a deployed module. */
export class InMemoryEventPublisher implements EventPublisher {
  readonly #events: EventEnvelope[] = [];

  public get events(): readonly EventEnvelope[] {
    return Object.freeze([...this.#events]);
  }

  public async publish(event: EventEnvelope, signal: AbortSignal): Promise<void> {
    if (signal.aborted) {
      throw signal.reason instanceof Error ? signal.reason : new Error('Publish was aborted.');
    }
    this.#events.push(freeze(structuredClone(event)));
  }
}
