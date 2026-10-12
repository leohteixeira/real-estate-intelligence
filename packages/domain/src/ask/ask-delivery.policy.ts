import type { AskLiveRun } from './ask-live.types.js';

export const askDeliveryPolicy = Object.freeze({ pendingLimit: 3, queueLifetimeMs: 120_000 });
/** Persistence supplies its own clock observation; running claims never queue-expire. */
export function queuedAskExpired(
  state: AskLiveRun['state'],
  deadline: number,
  now: number,
): boolean {
  return state === 'queued' && deadline <= now;
}
