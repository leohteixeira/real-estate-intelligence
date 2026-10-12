import { describe, expect, it } from 'vitest';
import { askDeliveryPolicy, queuedAskExpired } from './ask-delivery.policy.js';

describe('bounded Ask delivery', () => {
  it('defines the three-total pending bound and fixed two-minute queue lifetime', () => {
    expect(askDeliveryPolicy.pendingLimit).toBe(3);
    expect(askDeliveryPolicy.queueLifetimeMs).toBe(120_000);
  });
  it('expires only queued work at the inclusive deadline', () => {
    expect(queuedAskExpired('queued', 120_000, 119_999)).toBe(false);
    expect(queuedAskExpired('queued', 120_000, 120_000)).toBe(true);
    for (const state of ['running', 'completed', 'failed', 'expired'] as const)
      expect(queuedAskExpired(state, 120_000, 120_001)).toBe(false);
  });
});
