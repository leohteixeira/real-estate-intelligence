import {
  GatewayError,
  GatewayForbiddenError,
  GatewayAuthenticationError,
  GatewayInvalidRequestError,
  GatewayFailedDependencyError,
  GatewayModelNotFoundError,
  GatewayNotFoundError,
  GatewayResponseError,
} from '@ai-sdk/gateway';
import { APICallError } from 'ai';
import { ResilienceTimeoutError } from '@nestjs/resilience';
import { ModelExplanationFailure } from './language-model.port';
import { exhaustedGatewayQuota } from './gateway-quota';
import { modelFailure } from './model-failure';

/** Both SDK capabilities share the same closed failure vocabulary, without SDK causes. */
export function gatewayFailure(error: unknown, signal: AbortSignal): ModelExplanationFailure {
  if (signal.aborted || (error instanceof Error && error.name === 'AbortError'))
    return modelFailure(error, signal);
  if (error instanceof ModelExplanationFailure) return error;
  if (GatewayForbiddenError.isInstance(error)) return new ModelExplanationFailure('policy');
  if (GatewayAuthenticationError.isInstance(error))
    return new ModelExplanationFailure('authentication');
  if (
    GatewayInvalidRequestError.isInstance(error) ||
    GatewayFailedDependencyError.isInstance(error) ||
    GatewayModelNotFoundError.isInstance(error) ||
    GatewayNotFoundError.isInstance(error)
  )
    return new ModelExplanationFailure('rejected');
  // The SDK also wraps failed HTTP/transport calls as response errors. Only a
  // recognized unsuccessful call may proceed; malformed successful output stays definitive.
  if (
    GatewayResponseError.isInstance(error) &&
    (!APICallError.isInstance(error.cause) ||
      (error.cause.statusCode === undefined
        ? !error.cause.isRetryable
        : error.cause.statusCode < 400))
  )
    return new ModelExplanationFailure('rejected');
  if (exhaustedGatewayQuota(error)) return new ModelExplanationFailure('exhausted');
  if (
    !APICallError.isInstance(error) &&
    !GatewayError.isInstance(error) &&
    !(error instanceof ResilienceTimeoutError)
  )
    return new ModelExplanationFailure('rejected');
  const cause = GatewayError.isInstance(error) ? error.cause : error;
  const status = APICallError.isInstance(cause)
    ? cause.statusCode
    : GatewayError.isInstance(error)
      ? error.statusCode
      : undefined;
  const advice = APICallError.isInstance(cause)
    ? gatewayRetryAfter(cause.responseHeaders?.['retry-after'])
    : undefined;
  return new ModelExplanationFailure(
    status === 401 || status === 403
      ? 'authentication'
      : status !== undefined && status < 500 && status !== 429 && status !== 408
        ? 'rejected'
        : 'transient',
    advice,
  );
}

/** Canonical bounded advice only; raw response headers never cross the adapter boundary. */
export function gatewayRetryAfter(value: string | undefined, now = Date.now()): number | undefined {
  if (value === undefined || value.length > 64) return undefined;
  const text = value.trim();
  const delay = /^\d+(?:\.\d+)?$/.test(text)
    ? Number(text) * 1000
    : /^(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun), /.test(text)
      ? Date.parse(text) - now
      : Number.NaN;
  return Number.isFinite(delay) && delay >= 0
    ? Math.min(2_147_483_647, Math.ceil(delay))
    : undefined;
}
