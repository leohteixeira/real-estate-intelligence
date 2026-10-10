import type { EventEnvelope, EventPublisher } from '@rei/application';

export type ScriptedPublishStep = (
  event: EventEnvelope,
  signal: AbortSignal,
) => void | Promise<void>;

function freeze<T>(value: T): T {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) freeze(child);
  return Object.freeze(value);
}

/** Deterministic adapter fake whose scripted attempts receive and must honor caller cancellation. */
export class ScriptedEventPublisher implements EventPublisher {
  readonly #attempts: EventEnvelope[] = [];
  #next = 0;

  public constructor(private readonly steps: readonly ScriptedPublishStep[]) {
    if (steps.length === 0) throw new TypeError('A scripted publisher needs at least one step.');
  }

  public get attempts(): readonly EventEnvelope[] {
    return Object.freeze([...this.#attempts]);
  }

  public async publish(event: EventEnvelope, signal: AbortSignal): Promise<void> {
    signal.throwIfAborted();
    this.#attempts.push(freeze(structuredClone(event)));
    const step = this.steps[Math.min(this.#next, this.steps.length - 1)];
    this.#next += 1;
    await step!(event, signal);
    signal.throwIfAborted();
  }
}
