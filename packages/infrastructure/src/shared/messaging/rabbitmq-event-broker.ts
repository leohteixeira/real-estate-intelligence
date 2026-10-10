import type {
  EventEnvelope,
  EventHandler,
  EventPublisher,
  EventSubscriber,
} from '@rei/application';
import {
  AUDIT_TRACE_REQUESTED_TYPE,
  AUDIT_TRACE_REQUESTED_VERSION,
  AuditTraceRequested,
} from '@rei/domain';
import amqp from 'amqplib';

import { redactConnectionError } from '../persistence/redact.js';

const EXCHANGE = 'rei.events';
const AUDIT_QUEUE = 'audit.trace-requested.audit';

export interface RabbitMqEventBrokerConfig {
  readonly url: string;
  readonly operationTimeoutMs: number;
}

interface BrokerMessage {
  readonly content: Buffer;
}

interface BrokerChannel {
  assertExchange(exchange: string, type: string, options: { durable: boolean }): Promise<unknown>;
  assertQueue(queue: string, options: { durable: boolean }): Promise<unknown>;
  bindQueue(queue: string, exchange: string, routingKey: string): Promise<unknown>;
  prefetch(count: number): Promise<unknown>;
  publish(
    exchange: string,
    routingKey: string,
    content: Buffer,
    options: Record<string, unknown>,
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

interface BrokerConnection {
  createConfirmChannel(): Promise<BrokerChannel>;
  close(): Promise<void>;
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
): Promise<TResult> {
  return new Promise<TResult>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${operation} timed out.`)), timeoutMs);
    timer.unref();
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function plainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function parseAuditTraceRequestedMessage(content: Buffer): EventEnvelope {
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
    value.type !== AUDIT_TRACE_REQUESTED_TYPE ||
    value.version !== AUDIT_TRACE_REQUESTED_VERSION ||
    value.traceContext !== null ||
    Object.keys(value.payload).length !== 0 ||
    typeof value.eventId !== 'string' ||
    typeof value.aggregateId !== 'string' ||
    typeof value.occurredAt !== 'string'
  ) {
    throw new Error('Broker delivery is not a supported audit trace event.');
  }

  return new AuditTraceRequested({
    eventId: value.eventId,
    aggregateId: value.aggregateId,
    occurredAt: value.occurredAt,
  });
}

export class RabbitMqEventBroker implements EventPublisher, EventSubscriber {
  #connection: BrokerConnection | undefined;
  #channel: BrokerChannel | undefined;
  #consumerTag: string | undefined;
  readonly #deliveries = new Set<Promise<void>>();

  public constructor(
    private readonly config: RabbitMqEventBrokerConfig,
    private readonly connector: RabbitConnector = connectRabbit,
  ) {}

  public async start(): Promise<void> {
    if (this.#channel) {
      return;
    }

    let connection: BrokerConnection | undefined;
    try {
      connection = await bounded(
        this.connector(this.config.url, { timeout: this.config.operationTimeoutMs }),
        this.config.operationTimeoutMs,
        'RabbitMQ connection',
      );
      const channel = await bounded(
        connection.createConfirmChannel(),
        this.config.operationTimeoutMs,
        'RabbitMQ channel creation',
      );
      await bounded(
        Promise.all([
          channel.assertExchange(EXCHANGE, 'topic', { durable: true }),
          channel.assertQueue(AUDIT_QUEUE, { durable: true }),
        ]),
        this.config.operationTimeoutMs,
        'RabbitMQ topology declaration',
      );
      await bounded(
        channel.bindQueue(AUDIT_QUEUE, EXCHANGE, AUDIT_TRACE_REQUESTED_TYPE),
        this.config.operationTimeoutMs,
        'RabbitMQ queue binding',
      );
      await bounded(channel.prefetch(1), this.config.operationTimeoutMs, 'RabbitMQ prefetch');
      this.#connection = connection;
      this.#channel = channel;
    } catch (error) {
      if (connection) {
        await bounded(
          connection.close(),
          this.config.operationTimeoutMs,
          'RabbitMQ failed-start connection close',
        ).catch(() => undefined);
      }
      throw redactConnectionError(error);
    }
  }

  public async publish(event: EventEnvelope, signal: AbortSignal): Promise<void> {
    if (signal.aborted) {
      throw signal.reason instanceof Error ? signal.reason : new Error('Publish was aborted.');
    }
    await this.start();
    const channel = this.#channel!;
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

    try {
      channel.publish(EXCHANGE, event.type, content, {
        persistent: true,
        contentType: 'application/json',
        contentEncoding: 'utf-8',
        messageId: event.eventId,
        type: event.type,
      });
      await bounded(
        channel.waitForConfirms(),
        this.config.operationTimeoutMs,
        'RabbitMQ publisher confirmation',
      );
    } catch (error) {
      throw redactConnectionError(error);
    }
  }

  public async subscribe(eventType: string, handler: EventHandler): Promise<void> {
    if (eventType !== AUDIT_TRACE_REQUESTED_TYPE) {
      throw new Error('This broker adapter only subscribes the audit tracer queue.');
    }
    await this.start();
    const channel = this.#channel!;
    const reply = await bounded(
      channel.consume(
        AUDIT_QUEUE,
        (message) => this.trackDelivery(this.handleDelivery(channel, message, handler)),
        { noAck: false },
      ),
      this.config.operationTimeoutMs,
      'RabbitMQ consumer registration',
    );
    this.#consumerTag = reply.consumerTag;
  }

  private async handleDelivery(
    channel: BrokerChannel,
    message: BrokerMessage | null,
    handler: EventHandler,
  ): Promise<void> {
    if (message === null) {
      return;
    }

    let event: EventEnvelope;
    try {
      event = parseAuditTraceRequestedMessage(message.content);
    } catch {
      channel.reject(message, false);
      return;
    }

    try {
      await bounded(handler(event), this.config.operationTimeoutMs, 'Audit event handling');
      channel.ack(message);
    } catch {
      // Deliberately leave the delivery unacknowledged. Closing the channel requeues it.
    }
  }

  private trackDelivery(delivery: Promise<void>): void {
    this.#deliveries.add(delivery);
    void delivery.finally(() => this.#deliveries.delete(delivery));
  }

  public async close(): Promise<void> {
    const channel = this.#channel;
    const connection = this.#connection;
    this.#channel = undefined;
    this.#connection = undefined;

    if (channel && this.#consumerTag) {
      await bounded(
        channel.cancel(this.#consumerTag),
        this.config.operationTimeoutMs,
        'RabbitMQ consumer cancellation',
      ).catch(() => undefined);
      this.#consumerTag = undefined;
    }
    if (this.#deliveries.size > 0) {
      await bounded(
        Promise.allSettled([...this.#deliveries]).then(() => undefined),
        this.config.operationTimeoutMs,
        'RabbitMQ in-flight delivery drain',
      ).catch(() => undefined);
    }
    if (channel) {
      await bounded(
        channel.close(),
        this.config.operationTimeoutMs,
        'RabbitMQ channel close',
      ).catch(() => undefined);
    }
    if (connection) {
      await bounded(
        connection.close(),
        this.config.operationTimeoutMs,
        'RabbitMQ connection close',
      ).catch(() => undefined);
    }
  }
}
