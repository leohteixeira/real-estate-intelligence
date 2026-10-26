import type { IntentDecision } from '@rei/domain';
export const INTENT_DECIDER = Symbol('INTENT_DECIDER');
/** Classifies labels only; operands and arithmetic remain deterministic Market work. */
export interface IntentDecider {
  decide(
    query: string,
    locale: 'en' | 'pt-BR',
    signal: AbortSignal,
    deadlineAt: number,
  ): Promise<IntentDecision>;
}
