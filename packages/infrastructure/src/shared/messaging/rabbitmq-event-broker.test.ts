import type { EventEnvelope } from '@rei/application';
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

function brokerDouble() {
  let delivery: ((message: ReturnType<typeof message> | null) => void) | undefined;
  const channel = {
    assertExchange: vi.fn().mockResolvedValue({ exchange: 'rei.events' }),
    assertQueue: vi.fn().mockResolvedValue({ queue: 'audit.trace-requested.audit' }),
    bindQueue: vi.fn().mockResolvedValue({}),
    prefetch: vi.fn().mockResolvedValue({}),
    publish: vi.fn().mockReturnValue(true),
    waitForConfirms: vi.fn().mockResolvedValue(undefined),
    consume: vi.fn(
      async (_queue: string, listener: (message: ReturnType<typeof message> | null) => void) => {
        delivery = listener;
        return { consumerTag: 'consumer-1' };
      },
    ),
    ack: vi.fn(),
    reject: vi.fn(),
    cancel: vi.fn().mockResolvedValue({}),
    close: vi.fn().mockResolvedValue(undefined),
  };
  const connection = {
    createConfirmChannel: vi.fn().mockResolvedValue(channel),
    close: vi.fn().mockResolvedValue(undefined),
  };
  const broker = new RabbitMqEventBroker(
    { url: 'amqp://redacted:redacted@broker/vhost', operationTimeoutMs: 1_000 },
    async () => connection,
  );
  return { broker, channel, delivery: () => delivery };
}

function message() {
  return {
    content: Buffer.from(JSON.stringify(event)),
  };
}

describe('parseAuditTraceRequestedMessage', () => {
  it('accepts the exact immutable tracer envelope', () => {
    const event = parseAuditTraceRequestedMessage(
      Buffer.from(
        JSON.stringify({
          eventId: '0199c8f2-2394-7ba0-8f9e-286378779219',
          type: 'audit.trace.requested',
          version: 1,
          aggregateId: '0199c8f2-2394-7ba0-9f9e-286378779220',
          occurredAt: '2026-10-10T12:30:00.000Z',
          traceContext: null,
          payload: {},
        }),
      ),
    );

    expect(event.type).toBe('audit.trace.requested');
    expect(event.traceContext).toBeNull();
    expect(event.payload).toEqual({});
  });

  it.each([
    Buffer.from('not-json'),
    Buffer.from('{}'),
    Buffer.from(
      JSON.stringify({
        eventId: '0199c8f2-2394-7ba0-8f9e-286378779219',
        type: 'audit.trace.requested',
        version: 1,
        aggregateId: '0199c8f2-2394-7ba0-9f9e-286378779220',
        occurredAt: '2026-10-10T12:30:00.000Z',
        traceContext: null,
        payload: { unexpected: true },
      }),
    ),
  ])('rejects malformed or unsupported deliveries without exposing their body', (content) => {
    expect(() => parseAuditTraceRequestedMessage(content)).toThrow(/Broker delivery/);
  });
});

describe('RabbitMqEventBroker', () => {
  it('redacts credentials when the initial broker connection fails', async () => {
    const broker = new RabbitMqEventBroker(
      { url: 'amqp://user:secret@broker/vhost', operationTimeoutMs: 1_000 },
      async () => Promise.reject(new Error('failed amqp://user:secret@broker/vhost')),
    );

    await expect(broker.start()).rejects.toThrow('failed amqp://redacted:redacted@broker/vhost');
  });

  it('publishes persistent messages and resolves only after confirmation', async () => {
    const { broker, channel } = brokerDouble();

    await broker.publish(event, new AbortController().signal);

    expect(channel.publish).toHaveBeenCalledWith(
      'rei.events',
      event.type,
      expect.any(Buffer),
      expect.objectContaining({ persistent: true, messageId: event.eventId }),
    );
    expect(channel.waitForConfirms).toHaveBeenCalledOnce();
    await broker.close();
  });

  it('acknowledges only after the consumer effect resolves', async () => {
    const { broker, channel, delivery } = brokerDouble();
    let commit: (() => void) | undefined;
    await broker.subscribe(
      'audit.trace.requested',
      async () => new Promise<void>((resolve) => (commit = resolve)),
    );

    delivery()!(message());
    await Promise.resolve();
    expect(channel.ack).not.toHaveBeenCalled();
    commit!();
    await vi.waitFor(() => expect(channel.ack).toHaveBeenCalledOnce());
    await broker.close();
  });

  it('drains an in-flight consumer effect before closing the channel', async () => {
    const { broker, channel, delivery } = brokerDouble();
    let commit: (() => void) | undefined;
    await broker.subscribe(
      'audit.trace.requested',
      async () => new Promise<void>((resolve) => (commit = resolve)),
    );

    delivery()!(message());
    const closing = broker.close();
    await Promise.resolve();
    expect(channel.close).not.toHaveBeenCalled();
    commit!();
    await closing;
    expect(channel.close).toHaveBeenCalledOnce();
  });

  it('does not acknowledge when the audit effect fails', async () => {
    const { broker, channel, delivery } = brokerDouble();
    await broker.subscribe('audit.trace.requested', async () =>
      Promise.reject(new Error('audit unavailable')),
    );

    delivery()!(message());
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(channel.ack).not.toHaveBeenCalled();
    expect(channel.reject).not.toHaveBeenCalled();
    await broker.close();
  });

  it('rejects an invalid delivery without logging or handling its body', async () => {
    const { broker, channel, delivery } = brokerDouble();
    const handler = vi.fn();
    await broker.subscribe('audit.trace.requested', handler);
    const invalid = message();
    invalid.content = Buffer.from('secret malformed body');

    delivery()!(invalid);
    await Promise.resolve();
    expect(channel.reject).toHaveBeenCalledWith(invalid, false);
    expect(handler).not.toHaveBeenCalled();
    await broker.close();
  });
});
