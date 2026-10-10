import { describe, expect, it } from 'vitest';

import {
  AUDIT_TRACE_REQUESTED_TYPE,
  AUDIT_TRACE_REQUESTED_VERSION,
  AuditTraceRequested,
} from './trace-requested.event.js';

describe('AuditTraceRequested', () => {
  it('creates the stable payload-free technical event with an explicit empty trace slot', () => {
    const event = new AuditTraceRequested({
      eventId: '0199c8f2-2394-7ba0-8f9e-286378779219',
      aggregateId: '0199c8f2-2394-7ba0-9f9e-286378779220',
      occurredAt: '2026-10-10T12:30:00.000Z',
    });

    expect(event).toMatchObject({
      type: AUDIT_TRACE_REQUESTED_TYPE,
      version: AUDIT_TRACE_REQUESTED_VERSION,
      traceContext: null,
      payload: {},
    });
    expect(Object.isFrozen(event.payload)).toBe(true);
  });

  it('retains a validated vendor-neutral trace context', () => {
    const traceContext = {
      traceparent: '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-00',
      tracestate: 'vendor=opaque',
    };
    const event = new AuditTraceRequested({
      eventId: '0199c8f2-2394-7ba0-8f9e-286378779219',
      aggregateId: '0199c8f2-2394-7ba0-9f9e-286378779220',
      occurredAt: '2026-10-10T12:30:00.000Z',
      traceContext,
    });

    expect(event.traceContext).toEqual(traceContext);
    expect(event.traceContext).not.toBe(traceContext);
    expect(Object.isFrozen(event.traceContext)).toBe(true);
  });
});
