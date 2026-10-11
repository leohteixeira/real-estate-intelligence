import { Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import type { ResilienceEvent } from '@nestjs/resilience';
import { metrics, trace } from '@opentelemetry/api';
import { channel, type Channel } from 'node:diagnostics_channel';
import { priceToolResilienceSettings } from './price-per-square-meter-resilience.settings';
const names = new Set<string>(Object.values(priceToolResilienceSettings.policies));
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
export function safePricePolicyAttributes(event: ResilienceEvent) {
  return names.has(event.policy)
    ? {
        'dependency.name': 'price-tool',
        'resilience.policy.name': event.policy,
        'resilience.event.type': event.type,
      }
    : undefined;
}
@Injectable()
export class PriceToolTelemetry implements OnModuleInit, OnModuleDestroy {
  readonly #counter = metrics
    .getMeter('rei.ai.price-tool')
    .createCounter('rei.resilience.policy.events');
  readonly #listeners: Array<{ channel: Channel; listener: (message: unknown) => void }> = [];
  public onModuleInit(): void {
    for (const type of types) {
      const diagnostics = channel(`nestjs:resilience:${type}`);
      const listener = (message: unknown) => {
        const attributes = safePricePolicyAttributes(message as ResilienceEvent);
        if (attributes) {
          this.#counter.add(1, attributes);
          trace.getActiveSpan()?.addEvent(`resilience.${type}`, attributes);
        }
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
