import type { AskLiveRun } from './ask-live.types.js';

/**
 * One lifetime bounds every admission: unstarted work expires at it, and started or confirmed work
 * that no live claim has finished by then (counted from admission or from its confirmation) fails.
 */
export const askDeliveryPolicy = Object.freeze({ pendingLimit: 3, queueLifetimeMs: 120_000 });
/**
 * Nested budgets of one claimed execution, innermost first. Each must fit inside the next so a
 * normal question finishes in a single claim and a timed-out one is reclaimed without a long idle
 * lease: the AI graph deadline, the worker's bound on execution plus completion measured from the
 * claim, and the fenced claim lease. Several leases fit `askDeliveryPolicy.queueLifetimeMs`.
 */
export const askExecutionBudget = Object.freeze({
  graphDeadlineMs: 20_000,
  claimedWorkMs: 27_000,
  claimLeaseMs: 30_000,
});
/** Persistence supplies its own clock observation; a running claim fails, it never queue-expires. */
export function queuedAskExpired(
  state: AskLiveRun['state'],
  deadline: number,
  now: number,
): boolean {
  return state === 'queued' && deadline <= now;
}
