import { DomainValidationError } from './validation-error.js';

/** Vendor-neutral W3C trace context carried across durable boundaries. */
export interface TraceContext {
  readonly traceparent: string;
  readonly tracestate?: string;
}

const TRACEPARENT_PATTERN = /^00-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})$/;
const SIMPLE_KEY_PATTERN = /^[a-z][a-z0-9_*/-]{0,255}$/;
const TENANT_KEY_PART_PATTERN = /^[a-z0-9][a-z0-9_*/-]{0,240}$/;
const SYSTEM_KEY_PART_PATTERN = /^[a-z][a-z0-9_*/-]{0,13}$/;
const TRACESTATE_VALUE_PATTERN =
  /^[\x20-\x2b\x2d-\x3c\x3e-\x7e]{0,255}[\x21-\x2b\x2d-\x3c\x3e-\x7e]$/;

function isValidTracestateKey(key: string): boolean {
  const separator = key.indexOf('@');
  if (separator === -1) {
    return SIMPLE_KEY_PATTERN.test(key);
  }

  return (
    key.indexOf('@', separator + 1) === -1 &&
    TENANT_KEY_PART_PATTERN.test(key.slice(0, separator)) &&
    SYSTEM_KEY_PART_PATTERN.test(key.slice(separator + 1))
  );
}

function trimW3cOptionalWhitespace(value: string): string {
  let start = 0;
  let end = value.length;

  while (start < end && (value.charCodeAt(start) === 0x20 || value.charCodeAt(start) === 0x09)) {
    start += 1;
  }
  while (
    end > start &&
    (value.charCodeAt(end - 1) === 0x20 || value.charCodeAt(end - 1) === 0x09)
  ) {
    end -= 1;
  }

  return value.slice(start, end);
}

function validateTracestate(tracestate: string): void {
  if (tracestate.length === 0 || tracestate.length > 512) {
    throw new DomainValidationError(
      'tracestate must contain between 1 and 512 characters when supplied.',
      'tracestate',
    );
  }

  const members = tracestate.split(',');
  if (members.length > 32) {
    throw new DomainValidationError(
      'tracestate must contain at most 32 list members.',
      'tracestate',
    );
  }

  const keys = new Set<string>();
  for (const member of members) {
    const normalizedMember = trimW3cOptionalWhitespace(member);
    const equalsIndex = normalizedMember.indexOf('=');
    const key = normalizedMember.slice(0, equalsIndex);
    const value = normalizedMember.slice(equalsIndex + 1);
    if (
      equalsIndex < 1 ||
      !isValidTracestateKey(key) ||
      !TRACESTATE_VALUE_PATTERN.test(value) ||
      keys.has(key)
    ) {
      throw new DomainValidationError(
        'tracestate must be a valid W3C list-member string.',
        'tracestate',
      );
    }
    keys.add(key);
  }
}

export function immutableTraceContext(traceContext: TraceContext): TraceContext {
  const { traceparent, tracestate } = traceContext;
  const match = TRACEPARENT_PATTERN.exec(traceparent);
  if (
    match === null ||
    match[1] === '00000000000000000000000000000000' ||
    match[2] === '0000000000000000'
  ) {
    throw new DomainValidationError(
      'traceparent must be a valid W3C version 00 value.',
      'traceparent',
    );
  }

  if (tracestate !== undefined) {
    validateTracestate(tracestate);
  }

  return Object.freeze(tracestate === undefined ? { traceparent } : { traceparent, tracestate });
}
