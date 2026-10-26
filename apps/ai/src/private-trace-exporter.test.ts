import { createTraceState, SpanKind, SpanStatusCode, TraceFlags } from '@opentelemetry/api';
import { InMemorySpanExporter, type ReadableSpan } from '@opentelemetry/sdk-trace-base';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { describe, expect, it } from 'vitest';
import { intentResilienceSettings } from './models/intent-resilience.settings';
import { graphCheckpointResilienceSettings } from './graph/graph-checkpoint-resilience.settings';
import { priceToolResilienceSettings } from './tools/price-per-square-meter-resilience.settings';
import { safeAiDependencyPolicyAttributes } from './shared/ai-policy.telemetry';
import { safePricePolicyAttributes } from './tools/price-tool.telemetry';
import { PrivateTraceExporter, privateTraceSpan } from './private-trace-exporter';
describe('complete SDK export privacy boundary', () => {
  it('preserves real identity, parents, timings and categorical failures while removing every arbitrary text surface', async () => {
    const sentinel = 'private-export-sentinel';
    const context = {
      traceId: '1'.repeat(32),
      spanId: '2'.repeat(16),
      traceFlags: TraceFlags.SAMPLED,
      traceState: createTraceState(`key=${sentinel}`),
    };
    const policyAttributes = [
      ...Object.values(intentResilienceSettings.policies),
      ...Object.values(graphCheckpointResilienceSettings.policies),
      ...Object.values(priceToolResilienceSettings.policies),
    ].map((policy) => {
      const event = { policy, type: 'retry' };
      const attributes =
        safeAiDependencyPolicyAttributes(event) ?? safePricePolicyAttributes(event);
      if (!attributes) throw new Error('Expected safe existing dependency policy.');
      return attributes;
    });
    const raw: ReadableSpan = {
      name: sentinel,
      kind: SpanKind.INTERNAL,
      spanContext: () => context,
      parentSpanContext: { ...context, spanId: '3'.repeat(16) },
      startTime: [1, 0],
      endTime: [2, 0],
      duration: [1, 0],
      ended: true,
      status: { code: SpanStatusCode.ERROR, message: sentinel },
      attributes: { 'db.statement': sentinel, 'http.url': sentinel, 'rei.ask.outcome': 'failed' },
      events: [
        ...policyAttributes.map((attributes) => ({
          name: 'resilience.retry',
          time: [1, 0] as [number, number],
          attributes,
        })),
        {
          name: 'resilience.retry',
          time: [1, 0],
          attributes: {
            'dependency.name': sentinel,
            'resilience.policy.name': sentinel,
            'resilience.event.type': 'retry',
          },
        },
        { name: sentinel, time: [1, 0], attributes: { secret: sentinel } },
        {
          name: 'resilience.timeout',
          time: [1, 0],
          attributes: { 'resilience.event.type': 'timeout', secret: sentinel },
        },
      ],
      links: [{ context, attributes: { secret: sentinel } }],
      resource: resourceFromAttributes({ 'service.name': sentinel, secret: sentinel }),
      instrumentationScope: { name: sentinel, version: sentinel, schemaUrl: sentinel },
      droppedAttributesCount: 0,
      droppedEventsCount: 0,
      droppedLinksCount: 0,
    };
    const projected = privateTraceSpan(raw);
    expect(JSON.stringify({ ...projected, context: projected.spanContext() })).not.toContain(
      sentinel,
    );
    expect(projected.spanContext()).toMatchObject({
      traceId: context.traceId,
      spanId: context.spanId,
    });
    expect(projected.parentSpanContext?.spanId).toBe('3'.repeat(16));
    expect(projected.status).toEqual({ code: SpanStatusCode.ERROR });
    expect(projected.duration).toEqual(raw.duration);
    expect(projected.events).toHaveLength(policyAttributes.length + 2);
    expect(raw.status.message).toBe(sentinel);
    const memory = new InMemorySpanExporter();
    const exporter = new PrivateTraceExporter(memory);
    await new Promise<void>((resolve) => exporter.export([raw], () => resolve()));
    expect(memory.getFinishedSpans()).toHaveLength(1);
    const exported = memory.getFinishedSpans()[0]!;
    expect(
      exported.events.slice(0, policyAttributes.length).map((event) => event.attributes),
    ).toEqual(policyAttributes);
    expect(exported.events[policyAttributes.length]?.attributes).toEqual({
      'resilience.event.type': 'retry',
    });
    expect(JSON.stringify(exported)).not.toContain(sentinel);
    await exporter.forceFlush();
    await exporter.shutdown();
  });
});
