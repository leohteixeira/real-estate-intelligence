import { ResilienceTimeoutError } from '@nestjs/resilience';
import { ModelExplanationFailure } from './language-model.port';

/** Caller/deadline cancellation wins over an attempt timeout or provider outcome. */
export function modelFailure(error: unknown, signal: AbortSignal): ModelExplanationFailure {
  if (signal.aborted || (error instanceof Error && error.name === 'AbortError'))
    return new ModelExplanationFailure('cancelled');
  if (error instanceof ModelExplanationFailure) return error;
  if (error instanceof ResilienceTimeoutError) return new ModelExplanationFailure('transient');
  return new ModelExplanationFailure('transient');
}

export function recordModelFailure(error: unknown): boolean {
  return (
    error instanceof ModelExplanationFailure &&
    (error.kind === 'transient' || error.kind === 'exhausted')
  );
}
