import {
  context,
  createTraceState,
  isSpanContextValid,
  ROOT_CONTEXT,
  SpanKind,
  SpanStatusCode,
  trace,
  type Context,
  type Span,
  type TraceFlags,
} from '@opentelemetry/api';
import { immutableTraceContext, type TraceContext } from '@rei/domain';

const tracer = trace.getTracer('rei.infrastructure.event-delivery');
const TRACEPARENT_HEADER = 'traceparent';
const TRACESTATE_HEADER = 'tracestate';

export type AmqpHeaders = Readonly<Record<string, unknown>>;
export interface AmqpTraceHeaders {
  readonly traceparent?: string;
  readonly tracestate?: string;
}

function spanContextFrom(traceContext: TraceContext): Context {
  const canonical = immutableTraceContext(traceContext);
  const [, traceId, spanId, flags] = canonical.traceparent.split('-');
  return trace.setSpanContext(ROOT_CONTEXT, {
    traceId: traceId!,
    spanId: spanId!,
    traceFlags: Number.parseInt(flags!, 16) as TraceFlags,
    traceState: canonical.tracestate ? createTraceState(canonical.tracestate) : undefined,
    isRemote: true,
  });
}

function parentContext(traceContext: TraceContext | null | undefined): Context {
  if (traceContext === undefined) return context.active();
  return traceContext === null ? ROOT_CONTEXT : spanContextFrom(traceContext);
}

function resultFor(error: unknown, signal?: AbortSignal): 'cancelled' | 'failed' | 'timed-out' {
  if (
    (error instanceof Error && error.name === 'TimeoutError') ||
    (signal?.reason instanceof Error && signal.reason.name === 'TimeoutError')
  ) {
    return 'timed-out';
  }
  if (signal?.aborted || (error instanceof Error && error.name === 'AbortError')) {
    return 'cancelled';
  }
  return 'failed';
}

function completeSuccessfully(span: Span): void {
  span.setAttribute('rei.operation.result', 'succeeded');
  span.setStatus({ code: SpanStatusCode.OK });
}

function completeWithFailure(span: Span, result: 'cancelled' | 'failed' | 'timed-out'): void {
  span.setAttribute('rei.operation.result', result);
  span.setStatus({ code: SpanStatusCode.ERROR });
}

async function runSpan<TResult>(
  name: 'collection.run' | 'outbox.append' | 'outbox.publish',
  kind: SpanKind,
  durableParent: TraceContext | null | undefined,
  signal: AbortSignal | undefined,
  work: () => Promise<TResult>,
): Promise<TResult> {
  return tracer.startActiveSpan(name, { kind }, parentContext(durableParent), async (span) => {
    try {
      const result = await work();
      completeSuccessfully(span);
      return result;
    } catch (error) {
      completeWithFailure(span, resultFor(error, signal));
      throw error;
    } finally {
      span.end();
    }
  });
}

/** Creates the causal root for one owner-operated collection command. */
export function runCollectionOperationSpan<TResult>(
  signal: AbortSignal,
  work: (traceContext: TraceContext | null) => Promise<TResult>,
): Promise<TResult> {
  return runSpan('collection.run', SpanKind.INTERNAL, null, signal, () =>
    work(activeTraceContext()),
  );
}

/** Instruments an append without changing the active transaction context. */
export function runOutboxAppendSpan<TResult>(work: () => Promise<TResult>): Promise<TResult> {
  return runSpan('outbox.append', SpanKind.INTERNAL, undefined, undefined, work);
}

/** Creates one producer span from the immutable request context around all publish retries. */
export function runOutboxPublishSpan<TResult>(
  traceContext: TraceContext | null,
  signal: AbortSignal,
  work: () => Promise<TResult>,
): Promise<TResult> {
  return runSpan('outbox.publish', SpanKind.PRODUCER, traceContext, signal, work);
}

export interface TracedConsumerOperation<TResult> {
  readonly completion: Promise<TResult>;
  markTimedOut(): void;
}

/**
 * Activates a consumer span for the underlying handler promise. A timeout can mark the span while
 * deliberately leaving it open until that promise settles.
 */
export function startMessagingConsumeSpan<TResult>(
  traceContext: TraceContext | null,
  work: () => Promise<TResult>,
): TracedConsumerOperation<TResult> {
  let spanReference: Span | undefined;
  let timedOut = false;
  const completion = tracer.startActiveSpan(
    'messaging.consume',
    { kind: SpanKind.CONSUMER },
    parentContext(traceContext),
    async (span) => {
      spanReference = span;
      try {
        const result = await work();
        if (!timedOut) completeSuccessfully(span);
        return result;
      } catch (error) {
        if (!timedOut) completeWithFailure(span, resultFor(error));
        throw error;
      } finally {
        span.end();
      }
    },
  );

  return Object.freeze({
    completion,
    markTimedOut: (): void => {
      timedOut = true;
      if (spanReference) completeWithFailure(spanReference, 'timed-out');
    },
  });
}

function activeTraceContext(): TraceContext | null {
  const spanContext = trace.getActiveSpan()?.spanContext();
  if (!spanContext || !isSpanContextValid(spanContext)) return null;
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

/** Produces only validated W3C headers from the active producer span. */
export function activeAmqpTraceHeaders(): AmqpTraceHeaders {
  const active = activeTraceContext();
  return active === null ? {} : amqpTraceHeaders(active);
}

export function amqpTraceHeaders(traceContext: TraceContext): AmqpTraceHeaders {
  const canonical = immutableTraceContext(traceContext);
  return Object.freeze(
    canonical.tracestate === undefined
      ? { [TRACEPARENT_HEADER]: canonical.traceparent }
      : {
          [TRACEPARENT_HEADER]: canonical.traceparent,
          [TRACESTATE_HEADER]: canonical.tracestate,
        },
  );
}

function headerString(value: unknown, maximumBytes: number): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value === 'string') {
    if (Buffer.byteLength(value, 'utf8') > maximumBytes) {
      throw new Error('AMQP trace carrier is invalid.');
    }
    return value;
  }
  if (Buffer.isBuffer(value)) {
    if (value.byteLength > maximumBytes) throw new Error('AMQP trace carrier is invalid.');
    return value.toString('utf8');
  }
  throw new Error('AMQP trace carrier is invalid.');
}

/** Extracts an absent or strictly validated W3C carrier without retaining raw headers. */
export function extractAmqpTraceContext(headers: AmqpHeaders | undefined): TraceContext | null {
  const traceparent = headerString(headers?.[TRACEPARENT_HEADER], 55);
  const tracestate = headerString(headers?.[TRACESTATE_HEADER], 512);
  if (traceparent === undefined && tracestate === undefined) return null;
  if (traceparent === undefined) throw new Error('AMQP trace carrier is invalid.');

  try {
    return immutableTraceContext(
      tracestate === undefined ? { traceparent } : { traceparent, tracestate },
    );
  } catch {
    throw new Error('AMQP trace carrier is invalid.');
  }
}

function traceId(traceContext: TraceContext): string {
  return traceContext.traceparent.slice(3, 35);
}

/** Prevents a transport carrier from being attached to a different durable causal origin. */
export function assertTraceContextConsistency(
  durable: TraceContext | null,
  transport: TraceContext | null,
): void {
  if (durable !== null && transport !== null && traceId(durable) !== traceId(transport)) {
    throw new Error('AMQP trace carrier does not match the durable event context.');
  }
}
