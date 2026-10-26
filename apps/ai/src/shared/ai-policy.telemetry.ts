import { channel, type Channel } from 'node:diagnostics_channel';
import { Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { metrics, trace } from '@opentelemetry/api';
import { intentResilienceSettings } from '../models/intent-resilience.settings';
import { graphCheckpointResilienceSettings } from '../graph/graph-checkpoint-resilience.settings';

const dependencies = new Map<string, string>([
  ...Object.values(intentResilienceSettings.policies).map((name) => [name, 'intent'] as const),
  ...Object.values(graphCheckpointResilienceSettings.policies).map(
    (name) => [name, 'checkpoint'] as const,
  ),
]);
const types = [
  'retry',
  'timeout',
  'circuit-open',
  'circuit-half-open',
  'circuit-closed',
  'circuit-rejected',
  'bulkhead-rejected',
  'rate-limited',
  'fallback',
] as const;

/** Discard arbitrary error, source, payload and timing properties from diagnostic events. */
export function safeAiDependencyPolicyAttributes(message: unknown) {
  if (
    typeof message !== 'object' ||
    message === null ||
    !('policy' in message) ||
    !('type' in message) ||
    typeof message.policy !== 'string' ||
    !dependencies.has(message.policy) ||
    !types.some((type) => type === message.type)
  )
    return undefined;
  return {
    'dependency.name': dependencies.get(message.policy)!,
    'resilience.policy.name': message.policy,
    'resilience.event.type': String(message.type),
  };
}

@Injectable()
export class AiDependencyPolicyTelemetry implements OnModuleInit, OnModuleDestroy {
  readonly #counter = metrics
    .getMeter('rei.ai.dependencies')
    .createCounter('rei.resilience.policy.events');
  readonly #listeners: Array<{ channel: Channel; listener: (message: unknown) => void }> = [];
  public onModuleInit(): void {
    if (this.#listeners.length) return;
    for (const type of types) {
      const diagnostics = channel(`nestjs:resilience:${type}`);
      const listener = (message: unknown) => {
        const attributes = safeAiDependencyPolicyAttributes(message);
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
