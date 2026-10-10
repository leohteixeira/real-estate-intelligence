import type {
  EventEnvelope,
  EventHandler,
  EventPublisher,
  EventSubscriber,
  EventSubscription,
} from '@rei/application';
import {
  AUDIT_TRACE_REQUESTED_TYPE,
  AUDIT_TRACE_REQUESTED_VERSION,
  DomainEvent,
  type DomainEventInput,
  type EventPayload,
} from '@rei/domain';
import amqp from 'amqplib';
import { randomUUID } from 'node:crypto';

import { redactConnectionError } from '../persistence/redact.js';
import {
  activeAmqpTraceHeaders,
  amqpTraceHeaders,
  assertTraceContextConsistency,
  extractAmqpTraceContext,
  startMessagingConsumeSpan,
} from '../telemetry/index.js';
import {
  translateRabbitMqPublisherFailure,
  type RabbitMqPublishPhase,
} from './rabbitmq-publisher-failure.js';

const EXCHANGE = 'rei.events';
const LEGACY_AUDIT_QUEUE = 'audit.trace-requested.audit';
const AUDIT_CONSUMER = 'audit.event-log';

export interface RabbitMqEventBrokerConfig {
  readonly url: string;
  readonly operationTimeoutMs: number;
  readonly deliveryLimit?: number;
  readonly redeliveryDelayMs?: number;
}

interface BrokerMessage {
  readonly content: Buffer;
  readonly properties?: {
    readonly headers?: Record<string, unknown>;
    readonly correlationId?: string;
  };
}

interface BrokerEmitter {
  on(event: 'close', listener: () => void): this;
  on(event: 'error', listener: (error: Error) => void): this;
  on(event: 'return', listener: (message: BrokerMessage) => void): this;
  off?(event: 'return', listener: (message: BrokerMessage) => void): this;
}

interface BrokerChannel extends BrokerEmitter {
  assertExchange(exchange: string, type: string, options: { durable: boolean }): Promise<unknown>;
  assertQueue(
    queue: string,
    options: { durable: boolean; arguments?: Record<string, unknown> },
  ): Promise<unknown>;
  bindQueue(queue: string, exchange: string, routingKey: string): Promise<unknown>;
  unbindQueue(queue: string, exchange: string, routingKey: string): Promise<unknown>;
  prefetch(count: number): Promise<unknown>;
  publish(
    exchange: string,
    routingKey: string,
    content: Buffer,
    options: Record<string, unknown>,
    callback?: ConfirmCallback,
  ): boolean;
  waitForConfirms(): Promise<void>;
  consume(
    queue: string,
    listener: (message: BrokerMessage | null) => void,
    options: { noAck: boolean },
  ): Promise<{ consumerTag: string }>;
  ack(message: BrokerMessage): void;
  reject(message: BrokerMessage, requeue: boolean): void;
  cancel(consumerTag: string): Promise<unknown>;
  close(): Promise<void>;
}

type ConfirmCallback = (error: unknown | null) => void;

interface BrokerConnection extends BrokerEmitter {
  createConfirmChannel(): Promise<BrokerChannel>;
  close(): Promise<void>;
}

interface SubscriptionRecord {
  readonly subscription: EventSubscription;
  readonly handler: EventHandler;
}

interface BrokerGeneration {
  readonly id: number;
  readonly connection: BrokerConnection;
  readonly channel: BrokerChannel;
  readonly consumerTags: Map<string, string>;
  readonly controller: AbortController;
  invalidated: boolean;
}

export type RabbitConnector = (
  url: string,
  options: { timeout: number },
) => Promise<BrokerConnection>;

const connectRabbit: RabbitConnector = async (url, options) => {
  const connection = await amqp.connect(url, options);
  return connection as unknown as BrokerConnection;
};

function bounded<TResult>(
  promise: Promise<TResult>,
  timeoutMs: number,
  operation: string,
  signal?: AbortSignal,
): Promise<TResult> {
  return new Promise<TResult>((resolve, reject) => {
    let settled = false;
    const cleanup = (): void => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
    };
    const resolveOnce = (value: TResult): void => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(value);
    };
    const rejectOnce = (error: unknown): void => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    };
    const onAbort = (): void => {
      rejectOnce(
        signal?.reason instanceof Error ? signal.reason : new Error(`${operation} was aborted.`),
      );
    };
    const timer = setTimeout(() => rejectOnce(new Error(`${operation} timed out.`)), timeoutMs);
    timer.unref();
    promise.then(resolveOnce, rejectOnce);
    signal?.addEventListener('abort', onAbort, { once: true });
    if (signal?.aborted) onAbort();
  });
}

function waitForCaller<TResult>(
  promise: Promise<TResult>,
  signal: AbortSignal | undefined,
  operation: string,
): Promise<TResult> {
  if (!signal) return promise;

  return new Promise<TResult>((resolve, reject) => {
    let settled = false;
    const cleanup = (): void => signal.removeEventListener('abort', onAbort);
    const resolveOnce = (value: TResult): void => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(value);
    };
    const rejectOnce = (error: unknown): void => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    };
    const onAbort = (): void => {
      rejectOnce(
        signal.reason instanceof Error ? signal.reason : new Error(`${operation} was aborted.`),
      );
    };

    promise.then(resolveOnce, rejectOnce);
    signal.addEventListener('abort', onAbort, { once: true });
    if (signal.aborted) onAbort();
  });
}

async function acquireBounded<TResult>(
  promise: Promise<TResult>,
  timeoutMs: number,
  operation: string,
  dispose: (resource: TResult) => Promise<unknown>,
  signal?: AbortSignal,
): Promise<TResult> {
  try {
    return await bounded(promise, timeoutMs, operation, signal);
  } catch (error) {
    // A timeout or abort only stops our wait; it cannot cancel amqplib's promise. If the resource
    // arrives later, close it immediately so a cancelled reconnect cannot leak a connection or
    // channel after worker shutdown has already continued.
    void promise
      .then(async (resource) => {
        await bounded(
          Promise.resolve().then(() => dispose(resource)),
          timeoutMs,
          `${operation} late resource close`,
        );
      })
      .catch(() => undefined);
    throw error;
  }
}

function plainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function redactRabbitMqConnectionError(error: unknown): Error {
  const redacted = redactConnectionError(error) as Error & { code?: number };
  if (plainObject(error) && (error.code === 403 || error.code === 406 || error.code === 530)) {
    redacted.code = error.code;
  }
  return redacted;
}

function deliveryAttempt(message: BrokerMessage): number {
  const value = message.properties?.headers?.['x-rei-delivery-attempt'];
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 1 ? value : 1;
}

function abortableDelay(delayMs: number, signal: AbortSignal): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const onAbort = (): void => {
      clearTimeout(timer);
      reject(
        signal.reason instanceof Error ? signal.reason : new Error('Retry delay was aborted.'),
      );
    };
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, delayMs);
    timer.unref();
    signal.addEventListener('abort', onAbort, { once: true });
    if (signal.aborted) onAbort();
  });
}

class HydratedEvent extends DomainEvent<string, EventPayload> {
  public constructor(input: DomainEventInput<string, EventPayload>) {
    super(input);
  }
}

function parseEventMessage(content: Buffer): EventEnvelope {
  let value: unknown;
  try {
    value = JSON.parse(content.toString('utf8')) as unknown;
  } catch {
    throw new Error('Broker delivery is not valid JSON.');
  }

  if (!plainObject(value) || !plainObject(value.payload)) {
    throw new Error('Broker delivery is not an event envelope.');
  }
  const keys = Object.keys(value).sort();
  const expectedKeys = [
    'aggregateId',
    'eventId',
    'occurredAt',
    'payload',
    'traceContext',
    'type',
    'version',
  ].sort();
  if (
    JSON.stringify(keys) !== JSON.stringify(expectedKeys) ||
    typeof value.eventId !== 'string' ||
    typeof value.type !== 'string' ||
    typeof value.version !== 'number' ||
    typeof value.aggregateId !== 'string' ||
    typeof value.occurredAt !== 'string' ||
    (value.traceContext !== null && !plainObject(value.traceContext))
  ) {
    throw new Error('Broker delivery is not an event envelope.');
  }

  try {
    return new HydratedEvent({
      eventId: value.eventId,
      type: value.type,
      version: value.version,
      aggregateId: value.aggregateId,
      occurredAt: value.occurredAt,
      traceContext: value.traceContext as DomainEventInput<string, EventPayload>['traceContext'],
      payload: value.payload as EventPayload,
    });
  } catch {
    throw new Error('Broker delivery is not a valid event envelope.');
  }
}

export function parseAuditTraceRequestedMessage(content: Buffer): EventEnvelope {
  const event = parseEventMessage(content);
  if (
    event.type !== AUDIT_TRACE_REQUESTED_TYPE ||
    event.version !== AUDIT_TRACE_REQUESTED_VERSION ||
    Object.keys(event.payload).length !== 0
  ) {
    throw new Error('Broker delivery is not a supported audit trace event.');
  }
  return event;
}

function validateSubscription(subscription: EventSubscription): EventSubscription {
  const deadLetterQueue = `${subscription.consumerName}.dead-letter`;
  if (
    subscription.consumerName.length < 1 ||
    subscription.consumerName.length > 200 ||
    subscription.eventTypes.length < 1 ||
    new Set(subscription.eventTypes).size !== subscription.eventTypes.length ||
    subscription.eventTypes.some((eventType) => eventType.length < 1) ||
    Buffer.byteLength(subscription.consumerName, 'utf8') > 255 ||
    Buffer.byteLength(deadLetterQueue, 'utf8') > 255
  ) {
    throw new Error('RabbitMQ subscription descriptor is invalid.');
  }
  return Object.freeze({
    consumerName: subscription.consumerName,
    eventTypes: Object.freeze([...subscription.eventTypes]),
  });
}

export class RabbitMqEventBroker implements EventPublisher, EventSubscriber {
  #generation: BrokerGeneration | undefined;
  #starting: Promise<void> | undefined;
  #startController: AbortController | undefined;
  #nextGeneration = 1;
  #closing = false;
  readonly #subscriptions = new Map<string, SubscriptionRecord>();
  readonly #deliveries = new Set<Promise<void>>();
  readonly #handlerWork = new Set<Promise<void>>();
  readonly #cleanupWork = new Set<Promise<void>>();

  public constructor(
    private readonly config: RabbitMqEventBrokerConfig,
    private readonly connector: RabbitConnector = connectRabbit,
  ) {}

  public async start(signal?: AbortSignal): Promise<void> {
    if (this.#closing) {
      throw new Error('RabbitMQ broker is closed.');
    }
    if (this.#generation) {
      return;
    }

    if (!this.#starting) {
      const controller = new AbortController();
      this.#startController = controller;
      const tracked = this.establishGeneration(controller.signal).finally(() => {
        if (this.#starting === tracked) {
          this.#starting = undefined;
          this.#startController = undefined;
        }
      });
      this.#starting = tracked;
    }
    await waitForCaller(this.#starting, signal, 'RabbitMQ connection wait');
  }

  private async establishGeneration(signal?: AbortSignal): Promise<void> {
    let connection: BrokerConnection | undefined;
    let channel: BrokerChannel | undefined;
    try {
      signal?.throwIfAborted();
      const connectionPromise = this.connector(this.config.url, {
        timeout: this.config.operationTimeoutMs,
      });
      connection = await acquireBounded(
        connectionPromise,
        this.config.operationTimeoutMs,
        'RabbitMQ connection',
        async (lateConnection) => lateConnection.close(),
        signal,
      );
      const channelPromise = connection.createConfirmChannel();
      channel = await acquireBounded(
        channelPromise,
        this.config.operationTimeoutMs,
        'RabbitMQ channel creation',
        async (lateChannel) => lateChannel.close(),
        signal,
      );
      const generation: BrokerGeneration = {
        id: this.#nextGeneration++,
        connection,
        channel,
        consumerTags: new Map(),
        controller: new AbortController(),
        invalidated: false,
      };
      const invalidate = (): void => this.invalidateGeneration(generation);
      connection.on('error', invalidate);
      connection.on('close', invalidate);
      channel.on('error', invalidate);
      channel.on('close', invalidate);

      await bounded(
        channel.assertExchange(EXCHANGE, 'topic', { durable: true }),
        this.config.operationTimeoutMs,
        'RabbitMQ exchange declaration',
        signal,
      );
      await bounded(
        channel.prefetch(1),
        this.config.operationTimeoutMs,
        'RabbitMQ prefetch',
        signal,
      );

      // Keep the baseline binding active until every stable queue is declared and bound. This
      // overlap may duplicate a publication, but it prevents an unroutable interval and the inbox
      // makes the duplicate harmless. Consumers start only after the binding handoff completes.
      for (const record of this.#subscriptions.values()) {
        await this.materializeSubscriptionTopology(generation, record, signal);
      }
      const auditRecord = this.#subscriptions.get(AUDIT_CONSUMER);
      const migratesLegacyAudit =
        auditRecord?.subscription.eventTypes.includes(AUDIT_TRACE_REQUESTED_TYPE) === true;
      if (migratesLegacyAudit) {
        await bounded(
          channel.assertQueue(LEGACY_AUDIT_QUEUE, { durable: true }),
          this.config.operationTimeoutMs,
          'RabbitMQ legacy audit queue declaration',
          signal,
        );
        await bounded(
          channel.unbindQueue(LEGACY_AUDIT_QUEUE, EXCHANGE, AUDIT_TRACE_REQUESTED_TYPE),
          this.config.operationTimeoutMs,
          'RabbitMQ legacy audit queue unbinding',
          signal,
        );
      }
      for (const record of this.#subscriptions.values()) {
        await this.materializeSubscriptionConsumer(generation, record, signal);
      }
      if (migratesLegacyAudit && auditRecord) {
        await this.materializeLegacyAuditDrain(generation, auditRecord, signal);
      }
      if (generation.invalidated || this.#closing) {
        throw new Error('RabbitMQ connection closed during topology restoration.');
      }
      this.#generation = generation;
    } catch (error) {
      const cleanup = Promise.allSettled([
        channel
          ? bounded(
              channel.close(),
              this.config.operationTimeoutMs,
              'RabbitMQ failed-start channel close',
            )
          : Promise.resolve(),
        connection
          ? bounded(
              connection.close(),
              this.config.operationTimeoutMs,
              'RabbitMQ failed-start connection close',
            )
          : Promise.resolve(),
      ]).then(() => undefined);
      if (signal?.aborted) {
        this.trackCleanup(cleanup);
      } else {
        await cleanup;
      }
      throw redactRabbitMqConnectionError(error);
    }
  }

  private invalidateGeneration(generation: BrokerGeneration): void {
    generation.invalidated = true;
    generation.controller.abort(new Error('RabbitMQ generation was retired.'));
    generation.consumerTags.clear();
    if (this.#generation === generation) {
      this.#generation = undefined;
    }
  }

  public async publish(event: EventEnvelope, signal: AbortSignal): Promise<void> {
    if (signal.aborted) {
      throw translateRabbitMqPublisherFailure(signal.reason, signal, 'connection');
    }
    const content = Buffer.from(
      JSON.stringify({
        eventId: event.eventId,
        type: event.type,
        version: event.version,
        aggregateId: event.aggregateId,
        occurredAt: event.occurredAt,
        traceContext: event.traceContext,
        payload: event.payload,
      }),
    );

    let publisherChannel: BrokerChannel | undefined;
    let phase: RabbitMqPublishPhase = 'connection';
    try {
      await this.start(signal);
      signal.throwIfAborted();
      const generation = this.#generation;
      if (!generation) {
        throw new Error('RabbitMQ connection closed before publication.');
      }
      const channelPromise = generation.connection.createConfirmChannel();
      publisherChannel = await acquireBounded(
        channelPromise,
        this.config.operationTimeoutMs,
        'RabbitMQ publisher channel creation',
        async (lateChannel) => lateChannel.close(),
        signal,
      );
      signal.throwIfAborted();
      // A false return signals stream backpressure, not a rejected publish. The confirm remains
      // the publication boundary, so the message-specific callback still decides the outcome.
      phase = 'publish';
      let settleConfirm: ConfirmCallback | undefined;
      const confirm = new Promise<void>((resolve, reject) => {
        settleConfirm = (error) => (error === null ? resolve() : reject(error));
      });
      const publisherErrorListener = (error: unknown): void => settleConfirm?.(error);
      publisherChannel.on('error', publisherErrorListener);
      publisherChannel.publish(
        EXCHANGE,
        event.type,
        content,
        {
          persistent: true,
          contentType: 'application/json',
          contentEncoding: 'utf-8',
          messageId: event.eventId,
          type: event.type,
          headers: activeAmqpTraceHeaders(),
        },
        settleConfirm,
      );
      phase = 'confirm';
      await bounded(
        confirm,
        this.config.operationTimeoutMs,
        'RabbitMQ publisher confirmation',
        signal,
      );
    } catch (error) {
      throw translateRabbitMqPublisherFailure(error, signal, phase);
    } finally {
      if (publisherChannel) {
        const channel = publisherChannel;
        const cleanup = bounded(
          Promise.resolve().then(() => channel.close()),
          this.config.operationTimeoutMs,
          'RabbitMQ publisher channel close',
        ).catch(() => undefined);
        this.trackCleanup(cleanup);
      }
    }
  }

  public async subscribe(
    requestedSubscription: EventSubscription,
    handler: EventHandler,
  ): Promise<void> {
    if (this.#closing) {
      throw new Error('RabbitMQ broker is closed.');
    }
    const subscription = validateSubscription(requestedSubscription);
    const existing = this.#subscriptions.get(subscription.consumerName);
    if (existing) {
      if (
        existing.handler !== handler ||
        JSON.stringify(existing.subscription.eventTypes) !== JSON.stringify(subscription.eventTypes)
      ) {
        throw new Error(`RabbitMQ consumer ${subscription.consumerName} is already registered.`);
      }
      return;
    }

    const record = Object.freeze({ subscription, handler });
    this.#subscriptions.set(subscription.consumerName, record);
    // Registration is deliberately offline: worker bootstrap must succeed while RabbitMQ is
    // unavailable. If a generation is already live, retire it so the supervisor rematerializes
    // the complete descriptor set on its next bounded tick.
    const generation = this.#generation;
    if (generation) {
      this.invalidateGeneration(generation);
      await this.closeGeneration(generation, 'RabbitMQ subscription refresh');
    }
  }

  private async materializeSubscriptionTopology(
    generation: BrokerGeneration,
    record: SubscriptionRecord,
    signal?: AbortSignal,
  ): Promise<void> {
    const { consumerName, eventTypes } = record.subscription;
    await bounded(
      generation.channel.assertQueue(consumerName, { durable: true }),
      this.config.operationTimeoutMs,
      `RabbitMQ queue declaration for ${consumerName}`,
      signal,
    );
    await bounded(
      generation.channel.assertQueue(`${consumerName}.dead-letter`, {
        durable: true,
        arguments: { 'x-queue-type': 'classic' },
      }),
      this.config.operationTimeoutMs,
      `RabbitMQ dead-letter queue declaration for ${consumerName}`,
      signal,
    );
    for (const eventType of eventTypes) {
      await bounded(
        generation.channel.bindQueue(consumerName, EXCHANGE, eventType),
        this.config.operationTimeoutMs,
        `RabbitMQ queue binding for ${consumerName}`,
        signal,
      );
    }
  }

  private async materializeSubscriptionConsumer(
    generation: BrokerGeneration,
    record: SubscriptionRecord,
    signal?: AbortSignal,
  ): Promise<void> {
    const { consumerName, eventTypes } = record.subscription;
    if (generation.consumerTags.has(consumerName)) {
      return;
    }
    const reply = await bounded(
      generation.channel.consume(
        consumerName,
        (message) =>
          this.trackDelivery(
            this.handleDelivery(
              generation,
              message,
              consumerName,
              consumerName,
              eventTypes,
              record.handler,
            ),
          ),
        { noAck: false },
      ),
      this.config.operationTimeoutMs,
      `RabbitMQ consumer registration for ${consumerName}`,
      signal,
    );
    generation.consumerTags.set(consumerName, reply.consumerTag);
  }

  private async materializeLegacyAuditDrain(
    generation: BrokerGeneration,
    record: SubscriptionRecord,
    signal?: AbortSignal,
  ): Promise<void> {
    const consumerKey = `legacy:${record.subscription.consumerName}`;
    const reply = await bounded(
      generation.channel.consume(
        LEGACY_AUDIT_QUEUE,
        (message) =>
          this.trackDelivery(
            this.handleDelivery(
              generation,
              message,
              LEGACY_AUDIT_QUEUE,
              record.subscription.consumerName,
              [AUDIT_TRACE_REQUESTED_TYPE],
              record.handler,
            ),
          ),
        { noAck: false },
      ),
      this.config.operationTimeoutMs,
      'RabbitMQ legacy audit consumer registration',
      signal,
    );
    generation.consumerTags.set(consumerKey, reply.consumerTag);
  }

  private async handleDelivery(
    generation: BrokerGeneration,
    message: BrokerMessage | null,
    sourceQueue: string,
    consumerName: string,
    eventTypes: readonly string[],
    handler: EventHandler,
  ): Promise<void> {
    if (message === null) {
      return;
    }

    const attempt = deliveryAttempt(message);

    let event: EventEnvelope;
    let transportTraceContext: EventEnvelope['traceContext'] = null;
    try {
      transportTraceContext = extractAmqpTraceContext(message.properties?.headers);
      event = parseEventMessage(message.content);
      if (!eventTypes.includes(event.type)) {
        throw new Error('Broker delivery is not bound to this consumer.');
      }
      if (event.type === AUDIT_TRACE_REQUESTED_TYPE) {
        event = parseAuditTraceRequestedMessage(message.content);
      }
      assertTraceContextConsistency(event.traceContext, transportTraceContext);
    } catch {
      await this.transferConfirmed(
        generation,
        message,
        `${consumerName}.dead-letter`,
        attempt,
        'invalid-envelope',
        transportTraceContext,
      );
      if (!generation.invalidated && !this.#closing) generation.channel.ack(message);
      return;
    }

    const tracedHandler = startMessagingConsumeSpan(
      transportTraceContext ?? event.traceContext,
      async () => handler(event),
    );
    const work = tracedHandler.completion;
    let handlerSettled = false;
    void work.then(
      () => {
        handlerSettled = true;
      },
      () => {
        handlerSettled = true;
      },
    );
    this.#handlerWork.add(work);
    void work.then(
      () => this.#handlerWork.delete(work),
      () => this.#handlerWork.delete(work),
    );
    try {
      await bounded(work, this.config.operationTimeoutMs, 'Event handling');
      if (!generation.invalidated && !this.#closing) generation.channel.ack(message);
    } catch {
      if (!handlerSettled) tracedHandler.markTimedOut();
      try {
        if (attempt < (this.config.deliveryLimit ?? 5)) {
          await abortableDelay(
            this.config.redeliveryDelayMs ?? 1_000,
            generation.controller.signal,
          );
          await this.transferConfirmed(
            generation,
            message,
            sourceQueue,
            attempt + 1,
            'handler-retry',
            transportTraceContext,
          );
        } else {
          await this.transferConfirmed(
            generation,
            message,
            `${consumerName}.dead-letter`,
            attempt,
            'delivery-limit',
            transportTraceContext,
          );
        }
        if (!generation.invalidated && !this.#closing) generation.channel.ack(message);
      } catch {
        // The source stays unsettled. Ambiguous transfer state retires the generation below.
      }
    }
  }

  private async transferConfirmed(
    generation: BrokerGeneration,
    message: BrokerMessage,
    destinationQueue: string,
    attempt: number,
    reason: 'handler-retry' | 'delivery-limit' | 'invalid-envelope',
    traceContext: EventEnvelope['traceContext'],
  ): Promise<void> {
    const correlationId = randomUUID();
    let returned = false;
    const onReturn = (returnedMessage: BrokerMessage): void => {
      if (returnedMessage.properties?.correlationId === correlationId) returned = true;
    };
    generation.channel.on('return', onReturn);
    try {
      generation.channel.publish('', destinationQueue, message.content, {
        persistent: true,
        mandatory: true,
        contentType: 'application/json',
        contentEncoding: 'utf-8',
        correlationId,
        headers: {
          ...(traceContext === null ? {} : amqpTraceHeaders(traceContext)),
          'x-rei-delivery-attempt': attempt,
          'x-rei-dead-letter-reason': reason,
        },
      });
      await bounded(
        generation.channel.waitForConfirms(),
        this.config.operationTimeoutMs,
        'RabbitMQ delivery transfer confirmation',
        generation.controller.signal,
      );
      if (returned) throw new Error('RabbitMQ delivery transfer was unroutable.');
      if (
        generation.invalidated ||
        (this.#generation !== undefined && this.#generation !== generation) ||
        this.#closing
      ) {
        throw new Error('RabbitMQ generation changed during delivery transfer.');
      }
    } catch (error) {
      this.invalidateGeneration(generation);
      await this.closeGeneration(generation, 'RabbitMQ failed delivery transfer');
      throw redactConnectionError(error);
    } finally {
      generation.channel.off?.('return', onReturn);
    }
  }

  private trackDelivery(delivery: Promise<void>): void {
    this.#deliveries.add(delivery);
    void delivery.then(
      () => this.#deliveries.delete(delivery),
      () => this.#deliveries.delete(delivery),
    );
  }

  private trackCleanup(cleanup: Promise<void>): void {
    this.#cleanupWork.add(cleanup);
    void cleanup.then(
      () => this.#cleanupWork.delete(cleanup),
      () => this.#cleanupWork.delete(cleanup),
    );
  }

  private async closeGeneration(generation: BrokerGeneration, operation: string): Promise<void> {
    await Promise.allSettled([
      bounded(
        generation.channel.close(),
        this.config.operationTimeoutMs,
        `${operation} channel close`,
      ),
      bounded(
        generation.connection.close(),
        this.config.operationTimeoutMs,
        `${operation} connection close`,
      ),
    ]);
  }

  public async close(): Promise<void> {
    this.#closing = true;
    this.#startController?.abort(new Error('RabbitMQ broker is closing.'));
    await this.#starting?.catch(() => undefined);
    const generation = this.#generation;
    this.#generation = undefined;

    if (generation) {
      generation.controller.abort(new Error('RabbitMQ broker is closing.'));
      for (const consumerTag of generation.consumerTags.values()) {
        await bounded(
          generation.channel.cancel(consumerTag),
          this.config.operationTimeoutMs,
          'RabbitMQ consumer cancellation',
        ).catch(() => undefined);
      }
      generation.consumerTags.clear();
    }
    if (this.#deliveries.size > 0 || this.#handlerWork.size > 0) {
      await bounded(
        Promise.allSettled([...this.#deliveries, ...this.#handlerWork]).then(() => undefined),
        this.config.operationTimeoutMs,
        'RabbitMQ in-flight delivery drain',
      ).catch(() => undefined);
    }
    if (generation) {
      await bounded(
        generation.channel.close(),
        this.config.operationTimeoutMs,
        'RabbitMQ channel close',
      ).catch(() => undefined);
      await bounded(
        generation.connection.close(),
        this.config.operationTimeoutMs,
        'RabbitMQ connection close',
      ).catch(() => undefined);
    }
    if (this.#cleanupWork.size > 0) {
      await bounded(
        Promise.allSettled([...this.#cleanupWork]).then(() => undefined),
        this.config.operationTimeoutMs,
        'RabbitMQ cancelled-start cleanup drain',
      ).catch(() => undefined);
    }
  }
}
