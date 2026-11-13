import { channel, type Channel } from 'node:diagnostics_channel';
import { Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import type { ResilienceEvent } from '@nestjs/resilience';
import { metrics, SpanStatusCode, trace } from '@opentelemetry/api';
import { ModelExplanationFailure, type LanguageModelResult } from './language-model.port';
import { modelExplanationSettings as settings } from './model-explanation.settings';

const types: ReadonlyArray<ResilienceEvent['type']> = [
  'retry',
  'timeout',
  'circuit-open',
  'circuit-half-open',
  'circuit-closed',
  'circuit-rejected',
  'bulkhead-rejected',
  'rate-limited',
];
const names = new Set<string>(Object.values(settings.policies));
const failureKinds = new Set<string>([
  'policy',
  'rejected',
  'authentication',
  'budget',
  'cancelled',
  'exhausted',
  'transient',
]);
function safeFailureKind(error: unknown): ModelExplanationFailure['kind'] | undefined {
  return error instanceof ModelExplanationFailure && failureKinds.has(error.kind)
    ? error.kind
    : undefined;
}

/** Allowlisted categorical projection, not the SDK/policy event's arbitrary error or source. */
export function safeModelPolicyAttributes(message: unknown) {
  if (
    typeof message !== 'object' ||
    message === null ||
    !('policy' in message) ||
    !('type' in message) ||
    typeof message.policy !== 'string' ||
    !names.has(message.policy) ||
    !types.some((type) => type === message.type)
  )
    return undefined;
  const failure = 'error' in message ? safeFailureKind(message.error) : undefined;
  return {
    'dependency.name': 'model-explanation',
    'resilience.policy.name': message.policy,
    'resilience.event.type': String(message.type),
    'rei.ai.route': settings.route,
    ...(message.policy === settings.policies.circuitBreaker
      ? { 'rei.ai.model': settings.model }
      : {}),
    ...(failure ? { 'rei.ai.failure.kind': failure } : {}),
  };
}

@Injectable()
export class ModelPolicyTelemetry implements OnModuleInit, OnModuleDestroy {
  readonly #counter = metrics
    .getMeter('rei.ai.model-explanation')
    .createCounter('rei.resilience.policy.events');
  readonly #listeners: Array<{ channel: Channel; listener: (message: unknown) => void }> = [];
  public onModuleInit(): void {
    if (this.#listeners.length > 0) return;
    for (const type of types) {
      const diagnostics = channel(`nestjs:resilience:${type}`);
      const listener = (message: unknown) => {
        const attributes = safeModelPolicyAttributes(message);
        if (!attributes) return;
        this.#counter.add(1, attributes);
        trace.getActiveSpan()?.addEvent(`resilience.${type}`, attributes);
      };
      diagnostics.subscribe(listener);
      this.#listeners.push({ channel: diagnostics, listener });
    }
  }
  public onModuleDestroy(): void {
    for (const entry of this.#listeners) entry.channel.unsubscribe(entry.listener);
    this.#listeners.length = 0;
  }
}

/** A span covers the actual policy-wrapped attempt and validated bounded usage, never its text. */
export async function modelAttemptSpan(
  model: string,
  work: () => Promise<LanguageModelResult>,
): Promise<LanguageModelResult> {
  const purpose = 'explanation';
  const attributes = {
    'rei.ai.model': model === settings.model ? model : 'unapproved',
    'rei.ai.route': settings.route,
    'rei.ai.provider': settings.provider,
    'rei.ai.usage': 'unavailable',
    // The Messages API reports token usage, not a price; cost stays explicitly unavailable.
    'rei.ai.cost': 'unavailable',
    'rei.ai.attempt.purpose': purpose,
  };
  const meter = metrics.getMeter('rei.ai.model-explanation');
  const metricAttributes = {
    'rei.ai.model': attributes['rei.ai.model'],
    'rei.ai.route': attributes['rei.ai.route'],
    'rei.ai.attempt.purpose': purpose,
  };
  return trace
    .getTracer('rei.ai.model-explanation')
    .startActiveSpan('ask.model.attempt', { attributes }, async (span) => {
      const started = performance.now();
      try {
        const result = await work();
        span.setAttribute(
          'rei.ai.usage',
          Number.isSafeInteger(result.outputTokens) &&
            (result.outputTokens ?? 0) > 0 &&
            (result.outputTokens ?? 0) <= settings.explanationTokens
            ? 'available'
            : 'unavailable',
        );
        if (
          Number.isSafeInteger(result.outputTokens) &&
          result.outputTokens !== undefined &&
          result.outputTokens > 0 &&
          result.outputTokens <= settings.explanationTokens
        ) {
          span.setAttribute('rei.ai.output_tokens', result.outputTokens);
          meter
            .createCounter('rei.ai.model.output_tokens')
            .add(result.outputTokens, metricAttributes);
        }
        meter
          .createCounter('rei.ai.model.attempts')
          .add(1, { ...metricAttributes, 'rei.ai.outcome': 'succeeded' });
        span.setStatus({ code: SpanStatusCode.OK });
        return result;
      } catch (error) {
        const kind = safeFailureKind(error) ?? 'transient';
        span.setAttribute('rei.ai.failure.kind', kind);
        meter
          .createCounter('rei.ai.model.attempts')
          .add(1, { ...metricAttributes, 'rei.ai.outcome': kind });
        span.setStatus({ code: SpanStatusCode.ERROR });
        throw error;
      } finally {
        span.setAttribute('rei.ai.duration_ms', Math.max(0, performance.now() - started));
        span.end();
      }
    });
}
