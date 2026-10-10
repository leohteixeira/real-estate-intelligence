import { ExternalFailure, isExternalFailure } from '@rei/application';

export type RabbitMqPublishPhase = 'connection' | 'publish' | 'confirm';

const NETWORK_CODES = new Set([
  'EAI_AGAIN',
  'ECONNREFUSED',
  'ECONNRESET',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'ENOTFOUND',
  'EPIPE',
  'ETIMEDOUT',
]);

interface RabbitMqErrorShape {
  readonly code?: unknown;
  readonly replyCode?: unknown;
  readonly retryAfterMs?: unknown;
}

function errorShape(error: unknown): RabbitMqErrorShape {
  return typeof error === 'object' && error !== null ? (error as RabbitMqErrorShape) : {};
}

function retryAfter(error: unknown): number | undefined {
  const value = errorShape(error).retryAfterMs;
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined;
}

function isTimeoutReason(reason: unknown): boolean {
  if (typeof reason !== 'object' || reason === null) return false;
  const value = reason as { readonly name?: unknown; readonly code?: unknown };
  return (
    value.name === 'TimeoutError' ||
    value.name === 'ResilienceTimeoutError' ||
    value.code === 'TIMEOUT'
  );
}

/** Maps RabbitMQ and transport details to the application port's closed failure vocabulary. */
export function translateRabbitMqPublisherFailure(
  error: unknown,
  signal: AbortSignal,
  phase: RabbitMqPublishPhase,
): ExternalFailure {
  if (isExternalFailure(error)) return error;

  if (signal.aborted) {
    return new ExternalFailure({
      kind: isTimeoutReason(signal.reason) ? 'transient' : 'cancelled',
      operation: 'event-publisher.publish',
    });
  }

  const { code, replyCode } = errorShape(error);
  if (
    replyCode === 403 ||
    replyCode === 530 ||
    code === 403 ||
    code === 530 ||
    code === 'ACCESS_REFUSED' ||
    code === 'NOT_ALLOWED'
  ) {
    return new ExternalFailure({ kind: 'unauthorized', operation: 'event-publisher.publish' });
  }
  if (
    phase === 'publish' &&
    (replyCode === 311 ||
      replyCode === 312 ||
      replyCode === 406 ||
      code === 311 ||
      code === 312 ||
      code === 406 ||
      code === 'PRECONDITION_FAILED')
  ) {
    return new ExternalFailure({ kind: 'rejected', operation: 'event-publisher.publish' });
  }
  if (phase === 'confirm' && error instanceof Error && error.message === 'message nacked') {
    return new ExternalFailure({ kind: 'rejected', operation: 'event-publisher.publish' });
  }
  if (typeof code === 'string' && NETWORK_CODES.has(code)) {
    return new ExternalFailure({
      kind: 'transient',
      operation: 'event-publisher.publish',
      retryAfterMs: retryAfter(error),
    });
  }

  // Connection loss, an operation timeout, and a missing/negative publisher confirm all have an
  // ambiguous delivery outcome. Retrying is safe because the stable event id is the message id.
  return new ExternalFailure({
    kind: 'transient',
    operation: 'event-publisher.publish',
    retryAfterMs: retryAfter(error),
  });
}
