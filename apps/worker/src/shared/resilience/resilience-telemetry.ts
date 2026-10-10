import { Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import type { ResilienceEvent } from '@nestjs/resilience';
import { metrics, trace, type Attributes } from '@opentelemetry/api';
import { channel, type Channel } from 'node:diagnostics_channel';

import {
  EVENT_PUBLISHER_DEPENDENCY,
  eventPublisherResilienceSettings,
} from './event-publisher-resilience.settings';

const EVENT_TYPES: readonly ResilienceEvent['type'][] = [
  'retry',
  'timeout',
  'circuit-open',
  'circuit-half-open',
  'circuit-closed',
  'circuit-rejected',
  'bulkhead-rejected',
  'rate-limited',
  'fallback',
];

const POLICY_NAMES = new Set(Object.values(eventPublisherResilienceSettings.policies));
type DiagnosticsListener = (message: unknown, name: string | symbol) => void;

export function safePolicyAttributes(event: ResilienceEvent): Attributes | undefined {
  if (!POLICY_NAMES.has(event.policy)) return undefined;
  const attributes: Attributes = {
    'dependency.name': EVENT_PUBLISHER_DEPENDENCY,
    'resilience.policy.name': event.policy,
    'resilience.event.type': event.type,
  };
  switch (event.type) {
    case 'retry':
      attributes['resilience.retry.attempt'] = event.attempt;
      attributes['resilience.retry.delay_ms'] = event.delayMs;
      break;
    case 'timeout':
      attributes['resilience.timeout_ms'] = event.timeoutMs;
      break;
    case 'circuit-open':
    case 'circuit-half-open':
    case 'circuit-closed':
      attributes['resilience.circuit.from'] = event.from;
      attributes['resilience.circuit.to'] = event.to;
      break;
    case 'circuit-rejected':
    case 'rate-limited':
      attributes['resilience.retry_after_ms'] = event.retryAfterMs;
      break;
    case 'bulkhead-rejected':
      attributes['resilience.bulkhead.reason'] = event.reason;
      attributes['resilience.bulkhead.active'] = event.active;
      attributes['resilience.bulkhead.queued'] = event.queued;
      break;
    case 'fallback':
      break;
  }
  return attributes;
}

function safeCounterAttributes(event: ResilienceEvent): Attributes | undefined {
  const attributes = safePolicyAttributes(event);
  if (!attributes) return undefined;
  const boundedAttributes = { ...attributes };
  delete boundedAttributes['resilience.retry.delay_ms'];
  delete boundedAttributes['resilience.retry_after_ms'];
  return boundedAttributes;
}

/** Bridges package diagnostics to low-cardinality OpenTelemetry signals without raw errors. */
@Injectable()
export class ResilienceTelemetry implements OnModuleInit, OnModuleDestroy {
  readonly #counter = metrics
    .getMeter('real-estate-intelligence.worker.resilience')
    .createCounter('rei.resilience.policy.events', {
      description: 'Resilience policy events for outbound dependencies.',
    });
  readonly #subscriptions: Array<{ channel: Channel; listener: DiagnosticsListener }> = [];

  public onModuleInit(): void {
    for (const type of EVENT_TYPES) {
      const diagnosticsChannel = channel(`nestjs:resilience:${type}`);
      const listener: DiagnosticsListener = (message) => this.record(message as ResilienceEvent);
      diagnosticsChannel.subscribe(listener);
      this.#subscriptions.push({ channel: diagnosticsChannel, listener });
    }
  }

  public onModuleDestroy(): void {
    for (const subscription of this.#subscriptions) {
      subscription.channel.unsubscribe(subscription.listener);
    }
    this.#subscriptions.length = 0;
  }

  public record(event: ResilienceEvent): void {
    const spanAttributes = safePolicyAttributes(event);
    const counterAttributes = safeCounterAttributes(event);
    if (!spanAttributes || !counterAttributes) return;
    try {
      this.#counter.add(1, counterAttributes);
      trace.getActiveSpan()?.addEvent('resilience.policy', spanAttributes);
    } catch {
      // Observability must never change the dependency call's outcome.
    }
  }
}
