import { describe, expect, it } from 'vitest';
import { askDeliveryPolicy, askExecutionBudget, queuedAskExpired } from './ask-delivery.policy.js';

describe('bounded Ask delivery', () => {
  it('defines the three-total pending bound and fixed two-minute queue lifetime', () => {
    expect(askDeliveryPolicy.pendingLimit).toBe(3);
    expect(askDeliveryPolicy.queueLifetimeMs).toBe(120_000);
  });
  it('nests the graph deadline inside claimed work, the lease and several leases in the lifetime', () => {
    expect(askExecutionBudget).toEqual({
      graphDeadlineMs: 20_000,
      claimedWorkMs: 27_000,
      claimLeaseMs: 30_000,
    });
    expect(askExecutionBudget.graphDeadlineMs).toBeLessThan(askExecutionBudget.claimedWorkMs);
    expect(askExecutionBudget.claimedWorkMs).toBeLessThan(askExecutionBudget.claimLeaseMs);
    // One full attempt, a reclaim and a second full attempt still fit the run lifetime.
    expect(askExecutionBudget.claimLeaseMs * 3).toBeLessThanOrEqual(
      askDeliveryPolicy.queueLifetimeMs,
    );
  });
  it('expires only queued work at the inclusive deadline', () => {
    expect(queuedAskExpired('queued', 120_000, 119_999)).toBe(false);
    expect(queuedAskExpired('queued', 120_000, 120_000)).toBe(true);
    for (const state of ['running', 'completed', 'failed', 'expired'] as const)
      expect(queuedAskExpired(state, 120_000, 120_001)).toBe(false);
  });
});
