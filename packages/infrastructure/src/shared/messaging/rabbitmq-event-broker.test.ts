import type { EventEnvelope, EventSubscription } from '@rei/application';
import type { UuidV7 } from '@rei/domain';
import { describe, expect, it, vi } from 'vitest';

import { parseAuditTraceRequestedMessage, RabbitMqEventBroker } from './rabbitmq-event-broker.js';

const event: EventEnvelope = {
  eventId: '0199c8f2-2394-7ba0-8f9e-286378779219' as UuidV7,
  type: 'audit.trace.requested',
  version: 1,
  aggregateId: '0199c8f2-2394-7ba0-9f9e-286378779220' as UuidV7,
  occurredAt: '2026-10-10T12:30:00.000Z',
  traceContext: null,
  payload: {},
};
const traceContext = {
  traceparent: '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01',
  tracestate: 'vendor=opaque',
} as const;
const tracedEvent: EventEnvelope = { ...event, traceContext };
const subscription: EventSubscription = {
  consumerName: 'audit.event-log',
  eventTypes: ['audit.trace.requested'],
};

type Listener = (...arguments_: unknown[]) => void;
type ConfirmCallback = (error: unknown | null) => void;
type PublisherOutcome = 'ack' | 'pending' | Error;
type PublisherCloseOutcome = 'resolved' | 'pending' | Error;

function generationDouble(
  publishResult = true,
  publisherOutcomes: readonly PublisherOutcome[] = ['ack'],
  publisherCloseOutcomes: readonly PublisherCloseOutcome[] = [],
) {
  const connectionListeners = new Map<string, Listener[]>();
  const channelListeners = new Map<string, Listener[]>();
  const deliveries = new Map<string, (message: ReturnType<typeof message> | null) => void>();
  const channel = {
    assertExchange: vi.fn().mockResolvedValue({ exchange: 'rei.events' }),
    assertQueue: vi.fn().mockResolvedValue({ queue: subscription.consumerName }),
    bindQueue: vi.fn().mockResolvedValue({}),
    unbindQueue: vi.fn().mockResolvedValue({}),
    prefetch: vi.fn().mockResolvedValue({}),
    publish: vi.fn().mockReturnValue(publishResult),
    waitForConfirms: vi.fn().mockResolvedValue(undefined),
    consume: vi.fn(
      async (queue: string, listener: (value: ReturnType<typeof message> | null) => void) => {
        deliveries.set(queue, listener);
        return { consumerTag: `consumer-${queue}` };
      },
    ),
    ack: vi.fn(),
    reject: vi.fn(),
    cancel: vi.fn().mockResolvedValue({}),
    close: vi.fn().mockResolvedValue(undefined),
    on: vi.fn(),
    off: vi.fn(),
  };
  channel.on.mockImplementation((name: string, listener: Listener) => {
    channelListeners.set(name, [...(channelListeners.get(name) ?? []), listener]);
    return channel;
  });
  channel.off.mockImplementation((name: string, listener: Listener) => {
    channelListeners.set(
      name,
      (channelListeners.get(name) ?? []).filter((candidate) => candidate !== listener),
    );
    return channel;
  });
  const publisherChannels: Array<typeof channel> = [];
  const publisherCallbacks: ConfirmCallback[] = [];
  const publisherChannelListeners: Array<Map<string, Listener[]>> = [];
  let channelCreations = 0;
  const connection = {
    createConfirmChannel: vi.fn(async () => {
      channelCreations += 1;
      if (channelCreations === 1) return channel;

      const publisherIndex = publisherChannels.length;
      const listeners = new Map<string, Listener[]>();
      const outcome = publisherOutcomes[publisherIndex] ?? 'ack';
      const closeOutcome = publisherCloseOutcomes[publisherIndex] ?? 'resolved';
      const close =
        closeOutcome === 'pending'
          ? vi.fn(() => new Promise<void>(() => undefined))
          : closeOutcome instanceof Error
            ? vi.fn().mockRejectedValue(closeOutcome)
            : vi.fn().mockResolvedValue(undefined);
      const publisherChannel = {
        ...channel,
        publish: vi.fn(
          (
            _exchange: string,
            _routingKey: string,
            _content: Buffer,
            _options: Record<string, unknown>,
            callback?: ConfirmCallback,
          ) => {
            if (callback) {
              publisherCallbacks.push(callback);
              if (outcome !== 'pending') {
                queueMicrotask(() => callback(outcome === 'ack' ? null : outcome));
              }
            }
            return publishResult;
          },
        ),
        waitForConfirms: vi.fn().mockResolvedValue(undefined),
        close,
        on: vi.fn(),
        off: vi.fn(),
      };
      publisherChannel.on.mockImplementation((name: string, listener: Listener) => {
        listeners.set(name, [...(listeners.get(name) ?? []), listener]);
        return publisherChannel;
      });
      publisherChannel.off.mockImplementation((name: string, listener: Listener) => {
        listeners.set(
          name,
          (listeners.get(name) ?? []).filter((candidate) => candidate !== listener),
        );
        return publisherChannel;
      });
      publisherChannelListeners.push(listeners);
      publisherChannels.push(publisherChannel);
      return publisherChannel;
    }),
    close: vi.fn().mockResolvedValue(undefined),
    on: vi.fn(),
  };
  connection.on.mockImplementation((name: string, listener: Listener) => {
    connectionListeners.set(name, [...(connectionListeners.get(name) ?? []), listener]);
    return connection;
  });

  return {
    channel,
    connection,
    publisherCallbacks,
    publisherChannels,
    delivery: (queue = subscription.consumerName) => deliveries.get(queue),
    emitConnection: (name: 'close' | 'error') => {
      for (const listener of connectionListeners.get(name) ?? []) listener();
    },
    emitChannel: (name: 'close' | 'error') => {
      for (const listener of channelListeners.get(name) ?? []) listener();
    },
    emitPublisherChannel: (index: number, name: 'close' | 'error', error?: unknown) => {
      for (const listener of publisherChannelListeners[index]?.get(name) ?? []) listener(error);
    },
    emitReturn: (returned: ReturnType<typeof message>) => {
      for (const listener of channelListeners.get('return') ?? []) listener(returned);
    },
  };
}

function brokerDouble(
  publishResult = true,
  publisherOutcomes: readonly PublisherOutcome[] = ['ack'],
  publisherCloseOutcomes: readonly PublisherCloseOutcome[] = [],
) {
  const generation = generationDouble(publishResult, publisherOutcomes, publisherCloseOutcomes);
  const broker = new RabbitMqEventBroker(
    {
      url: 'amqp://redacted:redacted@broker/vhost',
      operationTimeoutMs: 1_000,
      deliveryLimit: 5,
      redeliveryDelayMs: 1,
    },
    async () => generation.connection,
  );
  return { broker, ...generation };
}

function message(
  attempt?: number,
  deliveredEvent: EventEnvelope = event,
  traceHeaders: Readonly<Record<string, unknown>> = {},
) {
  const headers = {
    ...traceHeaders,
    ...(attempt === undefined ? {} : { 'x-rei-delivery-attempt': attempt }),
  };
  return {
    content: Buffer.from(JSON.stringify(deliveredEvent)),
    ...(Object.keys(headers).length === 0 ? {} : { properties: { headers } }),
  };
}

describe('parseAuditTraceRequestedMessage', () => {
  it('accepts the exact immutable tracer envelope', () => {
    const parsed = parseAuditTraceRequestedMessage(Buffer.from(JSON.stringify(event)));

    expect(parsed.type).toBe('audit.trace.requested');
    expect(parsed.traceContext).toBeNull();
    expect(parsed.payload).toEqual({});
  });

  it('accepts a traced tracer envelope without changing its durable context', () => {
    expect(parseAuditTraceRequestedMessage(Buffer.from(JSON.stringify(tracedEvent)))).toMatchObject(
      {
        traceContext,
      },
    );
  });

  it.each([
    Buffer.from('not-json'),
    Buffer.from('{}'),
    Buffer.from(JSON.stringify({ ...event, version: 2 })),
    Buffer.from(JSON.stringify({ ...event, payload: { unexpected: true } })),
  ])('rejects malformed or unsupported deliveries without exposing their body', (content) => {
    expect(() => parseAuditTraceRequestedMessage(content)).toThrow(/Broker delivery/);
  });
});

describe('RabbitMqEventBroker', () => {
  it('retains a subscription descriptor without requiring a live connection', async () => {
    const connector = vi.fn().mockRejectedValue(new Error('broker unavailable'));
    const broker = new RabbitMqEventBroker(
      { url: 'amqp://broker/vhost', operationTimeoutMs: 1_000 },
      connector,
    );

    await expect(broker.subscribe(subscription, async () => undefined)).resolves.toBeUndefined();
    expect(connector).not.toHaveBeenCalled();
    await broker.close();
  });

  it('rejects a derived dead-letter queue name beyond RabbitMQ byte limits', async () => {
    const { broker } = brokerDouble();
    await expect(
      broker.subscribe(
        { consumerName: 'é'.repeat(130), eventTypes: ['audit.trace.requested'] },
        async () => undefined,
      ),
    ).rejects.toThrow('subscription descriptor is invalid');
    await broker.close();
  });

  it('redacts credentials when the initial broker connection fails', async () => {
    const broker = new RabbitMqEventBroker(
      { url: 'amqp://user:secret@broker/vhost', operationTimeoutMs: 1_000 },
      async () => Promise.reject(new Error('failed amqp://user:secret@broker/vhost')),
    );

    await expect(broker.start()).rejects.toThrow('failed amqp://redacted:redacted@broker/vhost');
  });

  it('serializes concurrent connection establishment', async () => {
    const generation = generationDouble();
    let release: (() => void) | undefined;
    const connector = vi.fn(
      async () =>
        new Promise<typeof generation.connection>((resolve) => {
          release = () => resolve(generation.connection);
        }),
    );
    const broker = new RabbitMqEventBroker(
      { url: 'amqp://broker/vhost', operationTimeoutMs: 1_000 },
      connector,
    );

    const starts = [broker.start(), broker.start()];
    release!();
    await Promise.all(starts);

    expect(connector).toHaveBeenCalledOnce();
    await broker.close();
  });

  it('keeps shared establishment alive when its first caller cancels', async () => {
    const generation = generationDouble();
    let release: (() => void) | undefined;
    const connector = vi.fn(
      async () =>
        new Promise<typeof generation.connection>((resolve) => {
          release = () => resolve(generation.connection);
        }),
    );
    const broker = new RabbitMqEventBroker(
      { url: 'amqp://broker/vhost', operationTimeoutMs: 1_000 },
      connector,
    );
    const firstController = new AbortController();

    const first = broker.start(firstController.signal);
    const second = broker.start();
    const firstResult = expect(first).rejects.toThrow('first caller stopped');
    firstController.abort(new Error('first caller stopped'));

    await firstResult;
    expect(connector).toHaveBeenCalledOnce();
    release!();
    await expect(second).resolves.toBeUndefined();
    expect(generation.channel.assertExchange).toHaveBeenCalledOnce();
    await broker.close();
  });

  it('lets a later caller cancel only its own shared-establishment wait', async () => {
    const generation = generationDouble();
    let release: (() => void) | undefined;
    const connector = vi.fn(
      async () =>
        new Promise<typeof generation.connection>((resolve) => {
          release = () => resolve(generation.connection);
        }),
    );
    const broker = new RabbitMqEventBroker(
      { url: 'amqp://broker/vhost', operationTimeoutMs: 1_000 },
      connector,
    );
    const laterController = new AbortController();

    const first = broker.start();
    const later = broker.start(laterController.signal);
    const laterResult = expect(later).rejects.toThrow('later caller stopped');
    laterController.abort(new Error('later caller stopped'));

    await laterResult;
    expect(connector).toHaveBeenCalledOnce();
    release!();
    await expect(first).resolves.toBeUndefined();
    expect(generation.channel.assertExchange).toHaveBeenCalledOnce();
    await broker.close();
  });

  it('does not wait for a hanging connection and disposes it if it resolves after close', async () => {
    const generation = generationDouble();
    let resolveConnection: ((connection: typeof generation.connection) => void) | undefined;
    const connector = vi.fn(
      async () =>
        new Promise<typeof generation.connection>((resolve) => {
          resolveConnection = resolve;
        }),
    );
    const broker = new RabbitMqEventBroker(
      { url: 'amqp://broker/vhost', operationTimeoutMs: 10_000 },
      connector,
    );

    const starting = broker.start();
    const startResult = expect(starting).rejects.toThrow('RabbitMQ broker is closing.');
    await expect(broker.close()).resolves.toBeUndefined();
    await startResult;

    resolveConnection!(generation.connection);
    await vi.waitFor(() => expect(generation.connection.close).toHaveBeenCalledOnce());
    expect(generation.connection.createConfirmChannel).not.toHaveBeenCalled();
  });

  it('disposes a channel that resolves after its cancelled connection establishment', async () => {
    const generation = generationDouble();
    let resolveChannel: ((channel: typeof generation.channel) => void) | undefined;
    generation.connection.createConfirmChannel.mockImplementation(
      async () =>
        new Promise<typeof generation.channel>((resolve) => {
          resolveChannel = resolve;
        }),
    );
    const broker = new RabbitMqEventBroker(
      { url: 'amqp://broker/vhost', operationTimeoutMs: 10_000 },
      async () => generation.connection,
    );

    const starting = broker.start();
    await vi.waitFor(() => expect(generation.connection.createConfirmChannel).toHaveBeenCalled());
    const startResult = expect(starting).rejects.toThrow('RabbitMQ broker is closing.');
    await expect(broker.close()).resolves.toBeUndefined();
    await startResult;
    expect(generation.connection.close).toHaveBeenCalledOnce();

    resolveChannel!(generation.channel);
    await vi.waitFor(() => expect(generation.channel.close).toHaveBeenCalledOnce());
  });

  it('publishes persistent messages and waits for a confirm even under write backpressure', async () => {
    const { broker, publisherChannels } = brokerDouble(false);

    await broker.publish(event, new AbortController().signal);

    expect(publisherChannels).toHaveLength(1);
    expect(publisherChannels[0]!.publish).toHaveBeenCalledWith(
      'rei.events',
      event.type,
      expect.any(Buffer),
      expect.objectContaining({ persistent: true, messageId: event.eventId }),
      expect.any(Function),
    );
    expect(publisherChannels[0]!.waitForConfirms).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(publisherChannels[0]!.close).toHaveBeenCalledOnce());
    await broker.close();
  });

  it('does not publish when the caller cancels as start finishes', async () => {
    const { broker, channel, publisherChannels } = brokerDouble();
    await broker.start();
    channel.publish.mockClear();
    const controller = new AbortController();
    vi.spyOn(broker, 'start').mockImplementation(async () => {
      controller.abort(new Error('publication stopped'));
    });

    await expect(broker.publish(event, controller.signal)).rejects.toMatchObject({
      kind: 'cancelled',
    });

    expect(channel.publish).not.toHaveBeenCalled();
    expect(publisherChannels).toHaveLength(0);
    await broker.close();
  });

  it('classifies numeric amqplib connector authorization rejection without leaking detail', async () => {
    const connectorError = Object.assign(
      new Error('Handshake refused for amqp://user:secret@broker/vhost'),
      { code: 403, replyText: 'ACCESS_REFUSED user secret' },
    );
    const broker = new RabbitMqEventBroker(
      { url: 'amqp://user:secret@broker/vhost', operationTimeoutMs: 1_000 },
      async () => Promise.reject(connectorError),
    );

    const failure = await broker
      .publish(event, new AbortController().signal)
      .catch((error: unknown) => error);

    expect(failure).toMatchObject({ kind: 'unauthorized' });
    expect(failure).toBeInstanceOf(Error);
    expect((failure as Error).message).not.toMatch(/secret|user|broker|amqp/i);
    await broker.close();
  });

  it('classifies a numeric setup rejection as non-retryable without leaking broker detail', async () => {
    const generation = generationDouble();
    generation.channel.assertExchange.mockRejectedValueOnce(
      Object.assign(new Error('PRECONDITION_FAILED secret exchange declaration'), {
        code: 406,
        replyText: 'PRECONDITION_FAILED secret exchange declaration',
      }),
    );
    const connector = vi.fn().mockResolvedValue(generation.connection);
    const broker = new RabbitMqEventBroker(
      { url: 'amqp://user:secret@broker/vhost', operationTimeoutMs: 1_000 },
      connector,
    );

    const failure = await broker
      .publish(event, new AbortController().signal)
      .catch((error: unknown) => error);

    expect(failure).toMatchObject({ kind: 'rejected' });
    expect(failure).toBeInstanceOf(Error);
    expect((failure as Error).message).not.toMatch(/secret|exchange|broker|amqp/i);
    expect(connector).toHaveBeenCalledOnce();
    expect(generation.channel.close).toHaveBeenCalledOnce();
    expect(generation.connection.close).toHaveBeenCalledOnce();
    await broker.close();
  });

  it('maps the amqplib negative-confirm error to a non-retryable rejection', async () => {
    const { broker, publisherChannels } = brokerDouble(true, [new Error('message nacked')]);

    await expect(broker.publish(event, new AbortController().signal)).rejects.toMatchObject({
      kind: 'rejected',
    });

    await vi.waitFor(() => expect(publisherChannels[0]!.close).toHaveBeenCalledOnce());
    await broker.close();
  });

  it('isolates overlapping ack and nack callbacks on their own publisher channels', async () => {
    const generation = generationDouble(true, ['pending', 'pending']);
    const broker = new RabbitMqEventBroker(
      { url: 'amqp://broker/vhost', operationTimeoutMs: 1_000 },
      async () => generation.connection,
    );
    const acknowledgedEvent = {
      ...event,
      eventId: '0199c8f2-2394-7ba0-af9e-286378779221' as UuidV7,
    };
    await broker.start();

    const rejected = broker.publish(event, new AbortController().signal);
    const acknowledged = broker.publish(acknowledgedEvent, new AbortController().signal);
    await vi.waitFor(() => expect(generation.publisherCallbacks).toHaveLength(2));
    generation.publisherCallbacks[1]!(null);
    generation.publisherCallbacks[0]!(new Error('message nacked'));

    await expect(acknowledged).resolves.toBeUndefined();
    await expect(rejected).rejects.toMatchObject({ kind: 'rejected' });
    expect(generation.publisherChannels).toHaveLength(2);
    expect(generation.publisherChannels[0]!.publish).toHaveBeenCalledWith(
      'rei.events',
      event.type,
      expect.any(Buffer),
      expect.objectContaining({ messageId: event.eventId }),
      expect.any(Function),
    );
    expect(generation.publisherChannels[1]!.publish).toHaveBeenCalledWith(
      'rei.events',
      acknowledgedEvent.type,
      expect.any(Buffer),
      expect.objectContaining({ messageId: acknowledgedEvent.eventId }),
      expect.any(Function),
    );
    expect(generation.channel.close).not.toHaveBeenCalled();
    expect(generation.connection.close).not.toHaveBeenCalled();
    await broker.close();
  });

  it('does not let a stalled publisher close reverse an acknowledged publication', async () => {
    vi.useFakeTimers();
    try {
      const generation = generationDouble(true, ['ack'], ['pending']);
      const broker = new RabbitMqEventBroker(
        { url: 'amqp://broker/vhost', operationTimeoutMs: 25 },
        async () => generation.connection,
      );

      await expect(broker.publish(event, new AbortController().signal)).resolves.toBeUndefined();
      expect(generation.publisherChannels[0]!.close).toHaveBeenCalledOnce();

      const closing = broker.close();
      await vi.advanceTimersByTimeAsync(25);
      await closing;
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not let a rejected publisher close reverse an acknowledged publication', async () => {
    const { broker, publisherChannels } = brokerDouble(true, ['ack'], [new Error('close failed')]);

    await expect(broker.publish(event, new AbortController().signal)).resolves.toBeUndefined();
    await vi.waitFor(() => expect(publisherChannels[0]!.close).toHaveBeenCalledOnce());
    await expect(broker.close()).resolves.toBeUndefined();
  });

  it('preserves the baseline audit route when started without an audit subscription', async () => {
    const generation = generationDouble();
    generation.channel.unbindQueue.mockImplementation(async () => {
      return {};
    });
    const broker = new RabbitMqEventBroker(
      { url: 'amqp://broker/vhost', operationTimeoutMs: 1_000 },
      async () => generation.connection,
    );

    await broker.publish(event, new AbortController().signal);

    expect(generation.channel.assertQueue).not.toHaveBeenCalledWith(
      'audit.trace-requested.audit',
      expect.anything(),
    );
    expect(generation.channel.unbindQueue).not.toHaveBeenCalled();
    expect(generation.publisherChannels[0]!.publish).toHaveBeenCalledOnce();
    await broker.close();
  });

  it('closes only a failed publisher channel and keeps the generation usable', async () => {
    const generation = generationDouble(true, [new Error('confirm state unknown'), 'ack']);
    const connector = vi.fn().mockResolvedValue(generation.connection);
    const broker = new RabbitMqEventBroker(
      { url: 'amqp://broker/vhost', operationTimeoutMs: 1_000 },
      connector,
    );

    await expect(broker.publish(event, new AbortController().signal)).rejects.toMatchObject({
      kind: 'transient',
    });
    await expect(broker.publish(event, new AbortController().signal)).resolves.toBeUndefined();

    await vi.waitFor(() => expect(generation.publisherChannels[0]!.close).toHaveBeenCalledOnce());
    await vi.waitFor(() => expect(generation.publisherChannels[1]!.close).toHaveBeenCalledOnce());
    expect(generation.channel.close).not.toHaveBeenCalled();
    expect(generation.connection.close).not.toHaveBeenCalled();
    expect(connector).toHaveBeenCalledOnce();
    await broker.close();
  });

  it('contains a publisher channel error without mutating active consumer state', async () => {
    const generation = generationDouble(true, ['pending']);
    const handler = vi.fn().mockResolvedValue(undefined);
    const broker = new RabbitMqEventBroker(
      { url: 'amqp://broker/vhost', operationTimeoutMs: 1_000 },
      async () => generation.connection,
    );
    await broker.subscribe(subscription, handler);
    await broker.start();

    const publication = broker.publish(event, new AbortController().signal);
    await vi.waitFor(() => expect(generation.publisherChannels).toHaveLength(1));
    generation.emitPublisherChannel(0, 'error', new Error('secret server channel failure'));
    generation.emitPublisherChannel(0, 'close');

    const failure = await publication.catch((error: unknown) => error);
    expect(failure).toMatchObject({ kind: 'transient' });
    expect(failure).toBeInstanceOf(Error);
    expect((failure as Error).message).not.toContain('secret server channel failure');
    await vi.waitFor(() => expect(generation.publisherChannels[0]!.close).toHaveBeenCalledOnce());
    expect(generation.channel.close).not.toHaveBeenCalled();
    expect(generation.connection.close).not.toHaveBeenCalled();
    generation.delivery()!(message());
    await vi.waitFor(() => expect(handler).toHaveBeenCalledOnce());
    await vi.waitFor(() => expect(generation.channel.ack).toHaveBeenCalledOnce());
    await broker.close();
  });

  it('times out only the publisher channel while active consumer state remains usable', async () => {
    const generation = generationDouble(true, ['pending']);
    const handler = vi.fn().mockResolvedValue(undefined);
    const broker = new RabbitMqEventBroker(
      { url: 'amqp://broker/vhost', operationTimeoutMs: 25 },
      async () => generation.connection,
    );
    await broker.subscribe(subscription, handler);
    await broker.start();

    vi.useFakeTimers();
    try {
      const publication = broker.publish(event, new AbortController().signal);
      const result = expect(publication).rejects.toMatchObject({ kind: 'transient' });
      await vi.advanceTimersByTimeAsync(25);
      await result;
    } finally {
      vi.useRealTimers();
    }

    await vi.waitFor(() => expect(generation.publisherChannels[0]!.close).toHaveBeenCalledOnce());
    expect(generation.channel.close).not.toHaveBeenCalled();
    expect(generation.connection.close).not.toHaveBeenCalled();
    generation.delivery()!(message());
    await vi.waitFor(() => expect(handler).toHaveBeenCalledOnce());
    await vi.waitFor(() => expect(generation.channel.ack).toHaveBeenCalledOnce());
    await broker.close();
  });

  it('cancels only the active publisher channel while active consumer state remains usable', async () => {
    const generation = generationDouble(true, ['pending']);
    const handler = vi.fn().mockResolvedValue(undefined);
    const broker = new RabbitMqEventBroker(
      { url: 'amqp://broker/vhost', operationTimeoutMs: 1_000 },
      async () => generation.connection,
    );
    const controller = new AbortController();
    await broker.subscribe(subscription, handler);
    await broker.start();

    const publication = broker.publish(event, controller.signal);
    await vi.waitFor(() => expect(generation.publisherChannels).toHaveLength(1));
    controller.abort(new Error('publication cancelled'));
    await expect(publication).rejects.toMatchObject({ kind: 'cancelled' });

    await vi.waitFor(() => expect(generation.publisherChannels[0]!.close).toHaveBeenCalledOnce());
    expect(generation.channel.close).not.toHaveBeenCalled();
    expect(generation.connection.close).not.toHaveBeenCalled();
    generation.delivery()!(message());
    await vi.waitFor(() => expect(handler).toHaveBeenCalledOnce());
    await vi.waitFor(() => expect(generation.channel.ack).toHaveBeenCalledOnce());
    await broker.close();
  });

  it('declares one durable queue for the stable logical consumer name', async () => {
    const { broker, channel } = brokerDouble();

    await broker.subscribe(subscription, async () => undefined);
    await broker.start();

    expect(channel.assertQueue).toHaveBeenCalledWith('audit.event-log', { durable: true });
    expect(channel.assertQueue).toHaveBeenCalledWith('audit.event-log.dead-letter', {
      durable: true,
      arguments: { 'x-queue-type': 'classic' },
    });
    expect(channel.bindQueue).toHaveBeenCalledWith(
      'audit.event-log',
      'rei.events',
      'audit.trace.requested',
    );
    expect(channel.consume).toHaveBeenCalledWith('audit.event-log', expect.any(Function), {
      noAck: false,
    });
    await broker.close();
  });

  it('unbinds and drains the baseline durable queue through the stable consumer handler', async () => {
    const { broker, channel, delivery } = brokerDouble();
    const handler = vi.fn().mockResolvedValue(undefined);
    await broker.subscribe(subscription, handler);
    await broker.start();

    expect(channel.assertQueue).toHaveBeenCalledWith('audit.trace-requested.audit', {
      durable: true,
    });
    expect(channel.unbindQueue).toHaveBeenCalledWith(
      'audit.trace-requested.audit',
      'rei.events',
      'audit.trace.requested',
    );
    expect(channel.bindQueue.mock.invocationCallOrder[0]).toBeLessThan(
      channel.unbindQueue.mock.invocationCallOrder[0]!,
    );
    expect(channel.unbindQueue.mock.invocationCallOrder[0]).toBeLessThan(
      channel.consume.mock.invocationCallOrder[0]!,
    );

    delivery('audit.trace-requested.audit')!(message());
    await vi.waitFor(() => expect(handler).toHaveBeenCalledOnce());
    await vi.waitFor(() => expect(channel.ack).toHaveBeenCalledOnce());
    await broker.close();
  });

  it('keeps a tracer route available throughout the legacy binding handoff', async () => {
    const generation = generationDouble();
    const bindings = new Set(['audit.trace-requested.audit']);
    let routesBeforeUnbind: string[] = [];
    let routesAfterUnbind: string[] = [];
    generation.channel.bindQueue.mockImplementation(async (queue: string) => {
      bindings.add(queue);
      return {};
    });
    generation.channel.unbindQueue.mockImplementation(async (queue: string) => {
      routesBeforeUnbind = [...bindings];
      bindings.delete(queue);
      routesAfterUnbind = [...bindings];
      return {};
    });
    const broker = new RabbitMqEventBroker(
      { url: 'amqp://broker/vhost', operationTimeoutMs: 1_000 },
      async () => generation.connection,
    );

    await broker.subscribe(subscription, async () => undefined);
    await broker.start();

    expect(routesBeforeUnbind).toEqual(
      expect.arrayContaining(['audit.trace-requested.audit', 'audit.event-log']),
    );
    expect(routesAfterUnbind).toEqual(['audit.event-log']);
    await broker.close();
  });

  it('retires a generation when topology materialization fails so the next tick retries all declarations', async () => {
    const first = generationDouble();
    first.channel.assertQueue.mockRejectedValueOnce(new Error('queue unavailable'));
    const second = generationDouble();
    const connector = vi
      .fn()
      .mockResolvedValueOnce(first.connection)
      .mockResolvedValueOnce(second.connection);
    const broker = new RabbitMqEventBroker(
      { url: 'amqp://broker/vhost', operationTimeoutMs: 1_000 },
      connector,
    );
    await broker.subscribe(subscription, async () => undefined);

    await expect(broker.start()).rejects.toThrow('queue unavailable');
    await broker.start();

    expect(first.channel.close).toHaveBeenCalledOnce();
    expect(first.connection.close).toHaveBeenCalledOnce();
    expect(second.channel.assertQueue).toHaveBeenCalledWith('audit.event-log', { durable: true });
    expect(connector).toHaveBeenCalledTimes(2);
    await broker.close();
  });

  it('acknowledges only after the consumer transaction resolves', async () => {
    const { broker, channel, delivery } = brokerDouble();
    let commit: (() => void) | undefined;
    await broker.subscribe(
      subscription,
      async () => new Promise<void>((resolve) => (commit = resolve)),
    );
    await broker.start();

    delivery()!(message());
    await Promise.resolve();
    expect(channel.ack).not.toHaveBeenCalled();
    commit!();
    await vi.waitFor(() => expect(channel.ack).toHaveBeenCalledOnce());
    await broker.close();
  });

  it('delivers a plain wire envelope to event-specific subscriber parsers', async () => {
    const { broker, delivery } = brokerDouble();
    const handler = vi.fn().mockResolvedValue(undefined);
    await broker.subscribe(subscription, handler);
    await broker.start();

    delivery()!(message());

    await vi.waitFor(() => expect(handler).toHaveBeenCalledOnce());
    const delivered = handler.mock.calls[0]![0];
    expect(Object.getPrototypeOf(delivered)).toBe(Object.prototype);
    expect(delivered).toEqual(event);
    await broker.close();
  });

  it('confirms retries and malformed dead-letter transfers before acknowledging the source', async () => {
    const { broker, channel, delivery } = brokerDouble();
    const handler = vi.fn().mockRejectedValue(new Error('audit unavailable'));
    await broker.subscribe(subscription, handler);
    await broker.start();

    delivery()!(message());
    await vi.waitFor(() => expect(handler).toHaveBeenCalledOnce());
    await vi.waitFor(() => expect(channel.ack).toHaveBeenCalledOnce());
    expect(channel.publish).toHaveBeenCalledWith(
      '',
      'audit.event-log',
      expect.any(Buffer),
      expect.objectContaining({
        mandatory: true,
        persistent: true,
        headers: expect.objectContaining({ 'x-rei-delivery-attempt': 2 }),
      }),
    );

    const invalid = { content: Buffer.from('secret malformed body') };
    delivery()!(invalid);
    await vi.waitFor(() => expect(channel.ack).toHaveBeenCalledTimes(2));
    expect(channel.publish).toHaveBeenCalledWith(
      '',
      'audit.event-log.dead-letter',
      invalid.content,
      expect.objectContaining({
        mandatory: true,
        headers: expect.objectContaining({
          'x-rei-delivery-attempt': 1,
          'x-rei-dead-letter-reason': 'invalid-envelope',
        }),
      }),
    );
    expect(handler).toHaveBeenCalledOnce();
    await broker.close();
  });

  it('retains validated trace headers across a handler retry', async () => {
    const { broker, channel, delivery } = brokerDouble();
    const handler = vi.fn().mockRejectedValue(new Error('audit unavailable'));
    await broker.subscribe(subscription, handler);
    await broker.start();

    delivery()!(message(undefined, tracedEvent, traceContext));
    await vi.waitFor(() => expect(channel.ack).toHaveBeenCalledOnce());

    expect(channel.publish).toHaveBeenCalledWith(
      '',
      'audit.event-log',
      expect.any(Buffer),
      expect.objectContaining({
        headers: expect.objectContaining({
          traceparent: traceContext.traceparent,
          tracestate: traceContext.tracestate,
          'x-rei-delivery-attempt': 2,
        }),
      }),
    );
    await broker.close();
  });

  it.each([
    {
      name: 'malformed',
      body: tracedEvent,
      headers: { traceparent: 'secret malformed carrier' },
    },
    {
      name: 'mismatched',
      body: tracedEvent,
      headers: {
        traceparent: '00-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-00f067aa0ba902b7-01',
      },
    },
  ])(
    'dead-letters a $name trace carrier without invoking the handler',
    async ({ body, headers }) => {
      const { broker, channel, delivery } = brokerDouble();
      const handler = vi.fn();
      await broker.subscribe(subscription, handler);
      await broker.start();

      delivery()!(message(undefined, body, headers));
      await vi.waitFor(() => expect(channel.ack).toHaveBeenCalledOnce());

      expect(handler).not.toHaveBeenCalled();
      expect(channel.publish).toHaveBeenCalledWith(
        '',
        'audit.event-log.dead-letter',
        expect.any(Buffer),
        expect.objectContaining({
          headers: expect.objectContaining({
            'x-rei-dead-letter-reason': 'invalid-envelope',
          }),
        }),
      );
      const transferOptions = channel.publish.mock.calls.at(-1)?.[3] as {
        headers?: Record<string, unknown>;
      };
      expect(JSON.stringify(transferOptions)).not.toContain('secret malformed carrier');
      await broker.close();
    },
  );

  it('performs exactly five normal handler attempts and preserves terminal attempt metadata', async () => {
    const { broker, channel, delivery } = brokerDouble();
    const handler = vi.fn().mockRejectedValue(new Error('deterministic conflict'));
    await broker.subscribe(subscription, handler);
    await broker.start();

    for (let attempt = 1; attempt <= 5; attempt += 1) {
      delivery()!(message(attempt));
      await vi.waitFor(() => expect(channel.ack).toHaveBeenCalledTimes(attempt));
    }

    expect(handler).toHaveBeenCalledTimes(5);
    expect(channel.publish).toHaveBeenLastCalledWith(
      '',
      'audit.event-log.dead-letter',
      expect.any(Buffer),
      expect.objectContaining({
        mandatory: true,
        headers: expect.objectContaining({
          'x-rei-delivery-attempt': 5,
          'x-rei-dead-letter-reason': 'delivery-limit',
        }),
      }),
    );
    await broker.close();
  });

  it('preserves a valid private attempt on an invalid envelope', async () => {
    const { broker, channel, delivery } = brokerDouble();
    const handler = vi.fn();
    await broker.subscribe(subscription, handler);
    await broker.start();
    const invalid = {
      content: Buffer.from('not-json'),
      properties: { headers: { 'x-rei-delivery-attempt': 4 } },
    };

    delivery()!(invalid);
    await vi.waitFor(() => expect(channel.ack).toHaveBeenCalledOnce());

    expect(channel.publish).toHaveBeenCalledWith(
      '',
      'audit.event-log.dead-letter',
      invalid.content,
      expect.objectContaining({
        headers: expect.objectContaining({ 'x-rei-delivery-attempt': 4 }),
      }),
    );
    expect(handler).not.toHaveBeenCalled();
    await broker.close();
  });

  it('leaves the source unsettled and retires the generation when a mandatory transfer returns', async () => {
    const generation = generationDouble();
    generation.channel.publish.mockImplementation(
      (_exchange: string, _key: string, content: Buffer, options: Record<string, unknown>) => {
        generation.emitReturn({
          content,
          properties: { correlationId: options.correlationId as string },
        });
        return true;
      },
    );
    const broker = new RabbitMqEventBroker(
      {
        url: 'amqp://broker/vhost',
        operationTimeoutMs: 1_000,
        deliveryLimit: 5,
        redeliveryDelayMs: 1,
      },
      async () => generation.connection,
    );
    await broker.subscribe(subscription, vi.fn().mockRejectedValue(new Error('conflict')));
    await broker.start();

    generation.delivery()!(message());
    await vi.waitFor(() => expect(generation.channel.close).toHaveBeenCalled());

    expect(generation.channel.ack).not.toHaveBeenCalled();
    expect(generation.connection.close).toHaveBeenCalled();
    await broker.close();
  });

  it('leaves the source unsettled when retry confirmation fails', async () => {
    const generation = generationDouble();
    generation.channel.waitForConfirms.mockRejectedValue(new Error('confirm failed'));
    const broker = new RabbitMqEventBroker(
      {
        url: 'amqp://broker/vhost',
        operationTimeoutMs: 1_000,
        deliveryLimit: 5,
        redeliveryDelayMs: 1,
      },
      async () => generation.connection,
    );
    await broker.subscribe(subscription, vi.fn().mockRejectedValue(new Error('conflict')));
    await broker.start();

    generation.delivery()!(message());
    await vi.waitFor(() => expect(generation.channel.close).toHaveBeenCalled());

    expect(generation.channel.ack).not.toHaveBeenCalled();
    await broker.close();
  });

  it('aborts an active retry delay during shutdown without acknowledging the source', async () => {
    const generation = generationDouble();
    const handler = vi.fn().mockRejectedValue(new Error('conflict'));
    const broker = new RabbitMqEventBroker(
      {
        url: 'amqp://broker/vhost',
        operationTimeoutMs: 1_000,
        deliveryLimit: 5,
        redeliveryDelayMs: 30_000,
      },
      async () => generation.connection,
    );
    await broker.subscribe(subscription, handler);
    await broker.start();

    generation.delivery()!(message());
    await vi.waitFor(() => expect(handler).toHaveBeenCalledOnce());
    await expect(broker.close()).resolves.toBeUndefined();

    expect(generation.channel.publish).not.toHaveBeenCalled();
    expect(generation.channel.ack).not.toHaveBeenCalled();
    expect(generation.channel.close).toHaveBeenCalledOnce();
  });

  it('keeps timed-out underlying handler work in the bounded shutdown drain', async () => {
    const generation = generationDouble();
    const broker = new RabbitMqEventBroker(
      { url: 'amqp://broker/vhost', operationTimeoutMs: 25 },
      async () => generation.connection,
    );
    let commit: (() => void) | undefined;
    await broker.subscribe(
      subscription,
      async () => new Promise<void>((resolve) => (commit = resolve)),
    );
    await broker.start();
    generation.delivery()!(message());

    await new Promise((resolve) => setTimeout(resolve, 30));
    const closing = broker.close();
    await Promise.resolve();
    expect(generation.channel.close).not.toHaveBeenCalled();
    commit!();
    await closing;
    expect(generation.channel.ack).not.toHaveBeenCalled();
    expect(generation.channel.close).toHaveBeenCalledOnce();
  });

  it('restores retained topology and consumers after the matching generation closes', async () => {
    const first = generationDouble();
    const second = generationDouble();
    const connector = vi
      .fn()
      .mockResolvedValueOnce(first.connection)
      .mockResolvedValueOnce(second.connection);
    const broker = new RabbitMqEventBroker(
      { url: 'amqp://broker/vhost', operationTimeoutMs: 1_000 },
      connector,
    );
    const handler = vi.fn().mockResolvedValue(undefined);
    await broker.subscribe(subscription, handler);
    await broker.start();

    first.emitConnection('close');
    await broker.start();
    second.delivery()!(message());
    await vi.waitFor(() => expect(second.channel.ack).toHaveBeenCalledOnce());

    expect(second.channel.assertQueue).toHaveBeenCalledWith('audit.event-log', { durable: true });
    expect(connector).toHaveBeenCalledTimes(2);
    first.emitChannel('close');
    await broker.start();
    expect(connector).toHaveBeenCalledTimes(2);
    await broker.close();
  });

  it('drains in-flight work and permanently disables reconnect during explicit shutdown', async () => {
    const { broker, channel, delivery, emitConnection } = brokerDouble();
    let commit: (() => void) | undefined;
    await broker.subscribe(
      subscription,
      async () => new Promise<void>((resolve) => (commit = resolve)),
    );
    await broker.start();
    delivery()!(message());

    const closing = broker.close();
    await Promise.resolve();
    expect(channel.close).not.toHaveBeenCalled();
    commit!();
    await closing;
    emitConnection('close');

    expect(channel.close).toHaveBeenCalledOnce();
    await expect(broker.start()).rejects.toThrow('closed');
  });
});
