import { privateTraceAttributes, privateTraceName } from '@rei/contracts';
import { resourceFromAttributes } from '@opentelemetry/resources';
import type { SpanExporter, ReadableSpan } from '@opentelemetry/sdk-trace-base';

/** Project a complete immutable SDK span immediately before serialization. */
export function privateTraceSpan(span: ReadableSpan): ReadableSpan {
  const identity = (value: ReturnType<ReadableSpan['spanContext']>) => ({
    traceId: value.traceId,
    spanId: value.spanId,
    traceFlags: value.traceFlags,
  });
  const service = span.resource.attributes['service.name'];
  return {
    kind: span.kind,
    startTime: span.startTime,
    endTime: span.endTime,
    duration: span.duration,
    ended: span.ended,
    droppedAttributesCount: span.droppedAttributesCount,
    droppedEventsCount: span.droppedEventsCount,
    droppedLinksCount: span.droppedLinksCount,
    name: privateTraceName(span.name),
    spanContext: () => identity(span.spanContext()),
    parentSpanContext: span.parentSpanContext ? identity(span.parentSpanContext) : undefined,
    status: { code: span.status.code },
    attributes: privateTraceAttributes(span.attributes),
    events: span.events
      .filter(
        (event) =>
          event.name === 'ask.graph.transition' ||
          /^resilience\.(retry|timeout|circuit-open|circuit-half-open|circuit-closed|circuit-rejected|bulkhead-rejected|rate-limited|fallback)$/.test(
            event.name,
          ),
      )
      .map((event) => ({
        name: event.name,
        time: event.time,
        attributes: privateTraceAttributes(event.attributes ?? {}),
        droppedAttributesCount: 0,
      })),
    links: span.links.map((link) => ({
      context: identity(link.context),
      attributes: privateTraceAttributes(link.attributes ?? {}),
      droppedAttributesCount: 0,
    })),
    resource: resourceFromAttributes({
      'service.name':
        typeof service === 'string' &&
        /^real-estate-intelligence-(api|worker|ai|collection-command|snapshot-reparse-command|listing-removal-command|resumable-collection-command|source-enable|run-command)$/.test(
          service,
        )
          ? service
          : 'real-estate-intelligence',
    }),
    instrumentationScope: { name: 'rei.private-telemetry' },
  };
}
export class PrivateTraceExporter implements SpanExporter {
  public constructor(private readonly delegate: SpanExporter) {}
  public export(spans: ReadableSpan[], callback: Parameters<SpanExporter['export']>[1]): void {
    this.delegate.export(spans.map(privateTraceSpan), callback);
  }
  public shutdown(): Promise<void> {
    return this.delegate.shutdown();
  }
  public forceFlush(): Promise<void> {
    return this.delegate.forceFlush?.() ?? Promise.resolve();
  }
}
