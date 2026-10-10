import { context, SpanStatusCode, trace, TraceFlags } from '@opentelemetry/api';
import {
  InMemorySpanExporter,
  SimpleSpanProcessor,
  type ReadableSpan,
} from '@opentelemetry/sdk-trace-base';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import type { Transaction } from '@rei/application';
import type { TraceContext } from '@rei/domain';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import type { DatabaseClient, DatabaseConnection } from '../persistence/database-connection.js';
import { PostgresOutbox } from '../persistence/postgres-outbox.js';
import { PostgresTransactionRunner } from '../persistence/postgres-transaction.js';
import {
  activeAmqpTraceHeaders,
  assertTraceContextConsistency,
  extractAmqpTraceContext,
  runOutboxPublishSpan,
  startMessagingConsumeSpan,
} from './trace-context.js';

const exporter = new InMemorySpanExporter();
const provider = new NodeTracerProvider({
  spanProcessors: [new SimpleSpanProcessor(exporter)],
});

beforeAll(() => {
  provider.register();
});

afterEach(() => {
  exporter.reset();
});

afterAll(async () => {
  await provider.shutdown();
  trace.disable();
  context.disable();
});

function durableContext(
  span: ReadableSpan | { spanContext(): ReadableSpan['spanContext'] },
): TraceContext {
  const spanContext = span.spanContext();
  return {
    traceparent: `00-${spanContext.traceId}-${spanContext.spanId}-${spanContext.traceFlags
      .toString(16)
      .padStart(2, '0')}`,
  };
}

function connectionDouble(client: DatabaseClient): DatabaseConnection {
  const identity = {};
  return {
    leaseClient: async () => client,
    transactionIdentity: () => identity,
  } as unknown as DatabaseConnection;
}

describe('durable event tracing', () => {
  it('keeps request, append, publish, and consumer spans in one sanitized trace', async () => {
    const sentinelPayload = 'payload-must-not-be-exported';
    const sentinelCredential = 'credential-must-not-be-exported';
    const query = async (): Promise<{ rows: never[] }> => ({ rows: [] });
    const client = { query, release: (): void => undefined } as unknown as DatabaseClient;
    const connection = connectionDouble(client);
    const transactions = new PostgresTransactionRunner(connection);
    const outbox = new PostgresOutbox(connection);
    const requestTracer = trace.getTracer('rei.test.request');

    await requestTracer.startActiveSpan('request', async (requestSpan) => {
      const traceContext = durableContext(requestSpan);
      await transactions.runInTransaction(async (transaction: Transaction) => {
        await outbox.append(transaction, [
          {
            eventId: '0199c8f2-2394-7ba0-8f9e-286378779219' as never,
            type: 'audit.trace.requested',
            version: 1,
            aggregateId: '0199c8f2-2394-7ba0-9f9e-286378779220' as never,
            occurredAt: '2026-10-10T12:30:00.000Z',
            traceContext,
            payload: { sentinelPayload, sentinelCredential },
          },
        ]);
      });

      let transport: TraceContext | null = null;
      await runOutboxPublishSpan(traceContext, new AbortController().signal, async () => {
        transport = extractAmqpTraceContext(activeAmqpTraceHeaders());
      });
      expect(transport).not.toBeNull();
      const consumer = startMessagingConsumeSpan(transport, async () => undefined);
      await consumer.completion;
      requestSpan.end();
    });
    await provider.forceFlush();

    const spans = exporter.getFinishedSpans();
    const request = spans.find(({ name }) => name === 'request')!;
    const append = spans.find(({ name }) => name === 'outbox.append')!;
    const publish = spans.find(({ name }) => name === 'outbox.publish')!;
    const consume = spans.find(({ name }) => name === 'messaging.consume')!;
    const traceIds = new Set(spans.map((span) => span.spanContext().traceId));

    expect(traceIds).toEqual(new Set([request.spanContext().traceId]));
    expect(append.parentSpanContext?.spanId).toBe(request.spanContext().spanId);
    expect(publish.parentSpanContext?.spanId).toBe(request.spanContext().spanId);
    expect(consume.parentSpanContext?.spanId).toBe(publish.spanContext().spanId);
    const exportedData = JSON.stringify(
      spans.map((span) => ({
        name: span.name,
        attributes: span.attributes,
        events: span.events,
        status: span.status,
        resource: span.resource.attributes,
      })),
    );
    expect(exportedData).not.toContain(sentinelPayload);
    expect(exportedData).not.toContain(sentinelCredential);
  });

  it('retains unsampled flags and optional state in safe AMQP carriers', () => {
    const active = trace.setSpanContext(context.active(), {
      traceId: '4bf92f3577b34da6a3ce929d0e0e4736',
      spanId: '00f067aa0ba902b7',
      traceFlags: TraceFlags.NONE,
      isRemote: false,
    });

    expect(context.with(active, activeAmqpTraceHeaders)).toEqual({
      traceparent: '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-00',
    });
    expect(
      extractAmqpTraceContext({
        traceparent: Buffer.from('00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01'),
        tracestate: Buffer.from('vendor=opaque'),
      }),
    ).toEqual({
      traceparent: '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01',
      tracestate: 'vendor=opaque',
    });
  });

  it('rejects malformed and mismatched carriers without retaining raw values', () => {
    expect(() => extractAmqpTraceContext({ traceparent: 'secret malformed header' })).toThrow(
      'AMQP trace carrier is invalid',
    );
    expect(() => extractAmqpTraceContext({ tracestate: 'vendor=opaque' })).toThrow(
      'AMQP trace carrier is invalid',
    );
    expect(() =>
      assertTraceContextConsistency(
        {
          traceparent: '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01',
        },
        {
          traceparent: '00-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-00f067aa0ba902b7-01',
        },
      ),
    ).toThrow('does not match');
  });

  it('does not end a timed-out consumer span until the handler settles', async () => {
    let settle: (() => void) | undefined;
    const operation = startMessagingConsumeSpan(
      {
        traceparent: '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01',
      },
      async () => new Promise<void>((resolve) => (settle = resolve)),
    );

    operation.markTimedOut();
    await provider.forceFlush();
    expect(exporter.getFinishedSpans()).toHaveLength(0);

    settle!();
    await operation.completion;
    await provider.forceFlush();
    expect(exporter.getFinishedSpans()).toHaveLength(1);
    expect(exporter.getFinishedSpans()[0]?.attributes).toMatchObject({
      'rei.operation.result': 'timed-out',
    });
  });

  it('exports categorical failed and cancelled producer results without error details', async () => {
    const failedSignal = new AbortController().signal;
    await expect(
      runOutboxPublishSpan(null, failedSignal, async () => {
        throw new Error('credential-must-not-be-exported');
      }),
    ).rejects.toThrow('credential-must-not-be-exported');

    const cancelled = new AbortController();
    cancelled.abort(new Error('cancelled-with-sensitive-reason'));
    await expect(
      runOutboxPublishSpan(null, cancelled.signal, async () => {
        throw new Error('payload-must-not-be-exported');
      }),
    ).rejects.toThrow('payload-must-not-be-exported');

    await provider.forceFlush();
    const spans = exporter.getFinishedSpans();
    expect(spans).toHaveLength(2);
    expect(spans.map(({ attributes, status }) => ({ attributes, status }))).toEqual([
      {
        attributes: { 'rei.operation.result': 'failed' },
        status: { code: SpanStatusCode.ERROR },
      },
      {
        attributes: { 'rei.operation.result': 'cancelled' },
        status: { code: SpanStatusCode.ERROR },
      },
    ]);
    const exportedData = JSON.stringify(
      spans.map(({ attributes, events, status }) => ({ attributes, events, status })),
    );
    expect(exportedData).not.toContain('credential-must-not-be-exported');
    expect(exportedData).not.toContain('cancelled-with-sensitive-reason');
    expect(exportedData).not.toContain('payload-must-not-be-exported');
  });
});
