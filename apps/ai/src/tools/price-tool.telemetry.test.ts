import { channel } from 'node:diagnostics_channel';
import { describe, expect, it, vi } from 'vitest';
const { add, addEvent } = vi.hoisted(() => ({ add: vi.fn(), addEvent: vi.fn() }));
vi.mock('@opentelemetry/api', () => ({
  metrics: { getMeter: () => ({ createCounter: () => ({ add }) }) },
  trace: { getActiveSpan: () => ({ addEvent }) },
}));
import { PriceToolTelemetry, safePricePolicyAttributes } from './price-tool.telemetry';
describe('categorical price dependency telemetry', () => {
  it('keeps only named low-cardinality attributes and unsubscribes every listener', () => {
    add.mockClear();
    addEvent.mockClear();
    const telemetry = new PriceToolTelemetry();
    telemetry.onModuleInit();
    const diagnostics = channel('nestjs:resilience:fallback');
    diagnostics.publish({
      type: 'fallback',
      policy: 'price-tool.fail-closed',
      source: 'secret-grant',
      error: new Error('sensitive payload'),
    });
    expect(add).toHaveBeenCalledExactlyOnceWith(1, {
      'dependency.name': 'price-tool',
      'resilience.policy.name': 'price-tool.fail-closed',
      'resilience.event.type': 'fallback',
    });
    expect(addEvent).toHaveBeenCalledExactlyOnceWith('resilience.fallback', {
      'dependency.name': 'price-tool',
      'resilience.policy.name': 'price-tool.fail-closed',
      'resilience.event.type': 'fallback',
    });
    diagnostics.publish({ type: 'fallback', policy: 'unrelated', error: 'secret' });
    expect(add).toHaveBeenCalledTimes(1);
    telemetry.onModuleDestroy();
    diagnostics.publish({ type: 'fallback', policy: 'price-tool.fail-closed', error: 'secret' });
    expect(add).toHaveBeenCalledTimes(1);
    telemetry.onModuleDestroy();
    expect(
      safePricePolicyAttributes({ type: 'timeout', policy: 'unknown', timeoutMs: 1 }),
    ).toBeUndefined();
  });
});
