import { describe, expect, it } from 'vitest';

import { immutableTraceContext } from './trace-context.js';
import { DomainValidationError } from './validation-error.js';

const validTraceparent = '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01';

describe('W3C trace context', () => {
  it('validates and freezes traceparent and tracestate', () => {
    const traceContext = immutableTraceContext({
      traceparent: validTraceparent,
      tracestate: 'vendor=value, tenant@system=opaque value',
    });

    expect(traceContext).toEqual({
      traceparent: validTraceparent,
      tracestate: 'vendor=value, tenant@system=opaque value',
    });
    expect(Object.isFrozen(traceContext)).toBe(true);
  });

  it('retains only the vendor-neutral W3C carrier fields', () => {
    const input = { traceparent: validTraceparent, vendorSpan: 'must-not-cross' };

    expect(immutableTraceContext(input)).toEqual({ traceparent: validTraceparent });
  });

  it('snapshots accessor-backed carrier fields before validation', () => {
    let traceparentReads = 0;
    let tracestateReads = 0;
    const traceContext = {
      get traceparent(): string {
        traceparentReads += 1;
        return traceparentReads === 1 ? validTraceparent : 'garbage';
      },
      get tracestate(): string | undefined {
        tracestateReads += 1;
        return tracestateReads === 1 ? undefined : 'garbage';
      },
    };

    expect(immutableTraceContext(traceContext)).toEqual({
      traceparent: validTraceparent,
    });
    expect(traceparentReads).toBe(1);
    expect(tracestateReads).toBe(1);
  });

  it('accepts W3C optional whitespace and a leading space in a member value', () => {
    const tracestate = '\tvendor= leading-space\t, other=value ';

    expect(immutableTraceContext({ traceparent: validTraceparent, tracestate })).toEqual({
      traceparent: validTraceparent,
      tracestate,
    });
  });

  it.each([
    'garbage',
    '01-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01',
    '00-00000000000000000000000000000000-00f067aa0ba902b7-01',
    '00-4bf92f3577b34da6a3ce929d0e0e4736-0000000000000000-01',
    '00-4BF92F3577B34DA6A3CE929D0E0E4736-00f067aa0ba902b7-01',
  ])('rejects invalid traceparent %s', (traceparent) => {
    expect(() => immutableTraceContext({ traceparent })).toThrow(DomainValidationError);
  });

  it.each([
    '',
    'UPPER=value',
    'vendor=',
    'vendor=value\u0000',
    'vendor=value,vendor=other',
    '\r\nvendor=value',
    'vendor=value\r\n',
    'vendor=value,\r\nother=value',
    '\u00a0vendor=value',
  ])('rejects invalid tracestate %s', (tracestate) => {
    expect(() => immutableTraceContext({ traceparent: validTraceparent, tracestate })).toThrow(
      DomainValidationError,
    );
  });

  it('rejects tracestate outside the W3C bounds', () => {
    const tooManyMembers = Array.from({ length: 33 }, (_, index) => `k${index}=v`).join(',');

    expect(() =>
      immutableTraceContext({ traceparent: validTraceparent, tracestate: 'a'.repeat(513) }),
    ).toThrow(DomainValidationError);
    expect(() =>
      immutableTraceContext({ traceparent: validTraceparent, tracestate: tooManyMembers }),
    ).toThrow(DomainValidationError);
  });
});
