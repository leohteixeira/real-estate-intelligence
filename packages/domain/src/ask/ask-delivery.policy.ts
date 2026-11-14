import type { AskLiveRun } from './ask-live.types.js';

/**
 * One lifetime bounds every admission: unstarted work expires at it, and started or confirmed work
 * that no live claim has finished by then (counted from admission or from its confirmation) fails.
 */
export const askDeliveryPolicy = Object.freeze({ pendingLimit: 3, queueLifetimeMs: 120_000 });
/** Persistence supplies its own clock observation; a running claim fails, it never queue-expires. */
export function queuedAskExpired(
  state: AskLiveRun['state'],
  deadline: number,
  now: number,
): boolean {
  return state === 'queued' && deadline <= now;
}
