import { context, trace } from '@opentelemetry/api';
import { InMemorySpanExporter, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import type { EventPublisher, OutboxRelayPort, OutboxRow } from '@rei/application';
import type { UuidV7 } from '@rei/domain';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { OutboxRelayJob } from './outbox-relay.job';

const exporter = new InMemorySpanExporter();
const provider = new NodeTracerProvider({
  spanProcessors: [new SimpleSpanProcessor(exporter)],
});
const traceparent = '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01';
const event: OutboxRow = {
  eventId: '0199c8f2-2394-7ba0-8f9e-286378779219' as UuidV7,
  type: 'audit.trace.requested',
  version: 1,
  aggregateId: '0199c8f2-2394-7ba0-9f9e-286378779220' as UuidV7,
  occurredAt: '2026-10-10T12:30:00.000Z',
  traceContext: { traceparent, tracestate: 'vendor=opaque' },
  payload: {},
  publishedAt: null,
  claimId: '0199c8f2-2394-7ba0-8f9e-286378779221' as UuidV7,
  claimExpiresAt: '2026-10-10T12:32:00.000Z',
};

beforeAll(() => {
  provider.register();
});

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubEnv('DATABASE_URL', 'postgres://app:app@localhost:5434/app');
  vi.stubEnv('RABBITMQ_URL', 'amqp://app:app@localhost:5672/app');
  vi.stubEnv('OUTBOX_RELAY_INTERVAL_MS', '100');
});

afterEach(() => {
  exporter.reset();
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

afterAll(async () => {
  await provider.shutdown();
  trace.disable();
  context.disable();
});

describe('OutboxRelayJob telemetry', () => {
  it('wraps the resilience-facing publication in one producer span from durable context', async () => {
    let activeTraceId: string | undefined;
    const outbox: OutboxRelayPort = {
      claimPending: vi.fn().mockResolvedValueOnce([event]).mockResolvedValue([]),
      markPublished: vi.fn(),
      releaseClaim: vi.fn(),
    };
    const publisher: EventPublisher = {
      publish: vi.fn(async () => {
        activeTraceId = trace.getActiveSpan()?.spanContext().traceId;
      }),
    };
    const job = new OutboxRelayJob(outbox, publisher);

    job.start();
    await vi.advanceTimersByTimeAsync(0);
    await job.stop();
    await provider.forceFlush();

    const spans = exporter.getFinishedSpans();
    expect(spans).toHaveLength(1);
    expect(spans[0]?.name).toBe('outbox.publish');
    expect(spans[0]?.spanContext().traceId).toBe('4bf92f3577b34da6a3ce929d0e0e4736');
    expect(spans[0]?.parentSpanContext?.spanId).toBe('00f067aa0ba902b7');
    expect(activeTraceId).toBe('4bf92f3577b34da6a3ce929d0e0e4736');
    expect(publisher.publish).toHaveBeenCalledOnce();
  });
});
