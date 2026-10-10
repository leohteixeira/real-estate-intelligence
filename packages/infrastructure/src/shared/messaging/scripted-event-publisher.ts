import {
  ExternalFailure,
  isExternalFailure,
  type EventEnvelope,
  type EventPublisher,
} from '@rei/application';

export type ScriptedPublishStep = (
  event: EventEnvelope,
  signal: AbortSignal,
) => void | Promise<void>;

function freeze<T>(value: T): T {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) freeze(child);
  return Object.freeze(value);
}

function translateScriptedFailure(error: unknown, signal: AbortSignal): ExternalFailure {
  if (signal.aborted) {
    return new ExternalFailure({
      kind: 'cancelled',
      operation: 'event-publisher.publish',
    });
  }
  if (isExternalFailure(error)) return error;
  return new ExternalFailure({
    kind: 'rejected',
    operation: 'event-publisher.publish',
  });
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
    if (signal.aborted) throw translateScriptedFailure(signal.reason, signal);
    this.#attempts.push(freeze(structuredClone(event)));
    const step = this.steps[Math.min(this.#next, this.steps.length - 1)];
    this.#next += 1;
    try {
      await step!(event, signal);
      if (signal.aborted) throw signal.reason;
    } catch (error) {
      throw translateScriptedFailure(error, signal);
    }
  }
}
