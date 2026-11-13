import Anthropic from '@anthropic-ai/sdk';
import { ResilienceTimeoutError } from '@nestjs/resilience';
import { ModelExplanationFailure } from './language-model.port';
import { modelFailure } from './model-failure';

/** Both provider capabilities share the same closed failure vocabulary, without SDK causes. */
export function anthropicFailure(error: unknown, signal: AbortSignal): ModelExplanationFailure {
  if (
    signal.aborted ||
    error instanceof Anthropic.APIUserAbortError ||
    (error instanceof Error && error.name === 'AbortError')
  )
    return new ModelExplanationFailure('cancelled');
  if (error instanceof ModelExplanationFailure) return error;
  if (error instanceof ResilienceTimeoutError) return modelFailure(error, signal);
  // Network failure and SDK timeout carry no HTTP status and are the retryable transport class.
  if (error instanceof Anthropic.APIConnectionError)
    return new ModelExplanationFailure('transient');
  // Anything else unstructured, including malformed successful output, stays definitive.
  if (!(error instanceof Anthropic.APIError) || typeof error.status !== 'number')
    return new ModelExplanationFailure('rejected');
  // Only the documented structured discriminants; never messages, URLs or request bodies.
  if (error.status === 402 || error.type === 'billing_error')
    return new ModelExplanationFailure('exhausted');
  if (error.status === 401 || error.status === 403)
    return new ModelExplanationFailure('authentication');
  if (error.status === 408 || error.status === 429 || error.status >= 500)
    return new ModelExplanationFailure(
      'transient',
      providerRetryAfter(error.headers?.get('retry-after') ?? undefined),
    );
  return new ModelExplanationFailure('rejected');
}

/** Canonical bounded advice only; raw response headers never cross the adapter boundary. */
export function providerRetryAfter(
  value: string | undefined,
  now = Date.now(),
): number | undefined {
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
