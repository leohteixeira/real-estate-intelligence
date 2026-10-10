import {
  immutableSerializableValue,
  isSerializableEventPayload,
  type EventPayload,
} from './serializable.js';
import { parseRfc3339Timestamp } from './timestamp.js';
import { immutableTraceContext, type TraceContext } from './trace-context.js';
import { parseUuidV7, type UuidV7 } from './uuid-v7.js';
import { DomainValidationError } from './validation-error.js';

export interface DomainEventEnvelope<
  TType extends string = string,
  TPayload extends object = EventPayload,
> {
  readonly eventId: UuidV7;
  readonly type: TType;
  readonly version: number;
  readonly aggregateId: UuidV7;
  readonly occurredAt: string;
  readonly traceContext: TraceContext | null;
  readonly payload: TPayload;
}

export type DomainEventInput<TType extends string, TPayload extends object> = Readonly<
  Omit<DomainEventEnvelope<TType, TPayload>, 'eventId' | 'aggregateId'>
> & {
  readonly eventId: string;
  readonly aggregateId: string;
};

const EVENT_TYPE_PATTERN =
  /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*\.[a-z][a-z0-9]*(?:-[a-z0-9]+)*\.[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;

/** Base for immutable domain facts that can cross a bounded-context boundary. */
export abstract class DomainEvent<
  TType extends string,
  TPayload extends object,
> implements DomainEventEnvelope<TType, TPayload> {
  public readonly eventId: UuidV7;
  public readonly type: TType;
  public readonly version: number;
  public readonly aggregateId: UuidV7;
  public readonly occurredAt: string;
  public readonly traceContext: TraceContext | null;
  public readonly payload: TPayload;

  protected constructor(input: DomainEventInput<TType, TPayload>) {
    const { eventId, type, version, aggregateId, occurredAt, traceContext, payload } = input;

    if (!EVENT_TYPE_PATTERN.test(type)) {
      throw new DomainValidationError(
        'Domain event type must have three lower-kebab segments.',
        'type',
      );
    }

    if (!Number.isSafeInteger(version) || version < 1) {
      throw new DomainValidationError(
        'Domain event version must be a positive safe integer.',
        'version',
      );
    }

    if (!isSerializableEventPayload(payload)) {
      throw new DomainValidationError(
        'Domain event payload must contain only serializable values.',
        'payload',
      );
    }

    this.eventId = parseUuidV7(eventId);
    this.type = type;
    this.version = version;
    this.aggregateId = parseUuidV7(aggregateId);
    this.occurredAt = parseRfc3339Timestamp(occurredAt, 'occurredAt');
    this.traceContext = traceContext === null ? null : immutableTraceContext(traceContext);
    this.payload = immutableSerializableValue(payload as EventPayload) as TPayload;
    Object.freeze(this);
  }
}
