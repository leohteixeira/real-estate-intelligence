import { isSpanContextValid, trace } from '@opentelemetry/api';
import { immutableTraceContext, type TraceContext } from '@rei/domain';

/** Captures only the active span's validated W3C fields at the HTTP boundary. */
export function captureActiveTraceContext(): TraceContext | null {
  const spanContext = trace.getActiveSpan()?.spanContext();
  if (!spanContext || !isSpanContextValid(spanContext)) {
    return null;
  }

  const traceparent = [
    '00',
    spanContext.traceId,
    spanContext.spanId,
    spanContext.traceFlags.toString(16).padStart(2, '0'),
  ].join('-');
  const tracestate = spanContext.traceState?.serialize();
  return immutableTraceContext(
    tracestate === undefined || tracestate.length === 0
      ? { traceparent }
      : { traceparent, tracestate },
  );
}
