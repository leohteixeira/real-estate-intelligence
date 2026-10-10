import { context, createTraceState, trace, TraceFlags } from '@opentelemetry/api';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { captureActiveTraceContext } from './trace-context';

const provider = new NodeTracerProvider({ spanProcessors: [] });

beforeAll(() => {
  provider.register();
});

afterAll(async () => {
  await provider.shutdown();
  trace.disable();
  context.disable();
});

describe('captureActiveTraceContext', () => {
  it('returns null without a valid active span', () => {
    expect(captureActiveTraceContext()).toBeNull();
  });

  it('captures sampling flags and optional state without exposing vendor objects', () => {
    const active = trace.setSpanContext(context.active(), {
      traceId: '4bf92f3577b34da6a3ce929d0e0e4736',
      spanId: '00f067aa0ba902b7',
      traceFlags: TraceFlags.NONE,
      traceState: createTraceState('vendor=opaque'),
      isRemote: false,
    });

    const captured = context.with(active, captureActiveTraceContext);

    expect(captured).toEqual({
      traceparent: '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-00',
      tracestate: 'vendor=opaque',
    });
    expect(Object.isFrozen(captured)).toBe(true);
  });
});
