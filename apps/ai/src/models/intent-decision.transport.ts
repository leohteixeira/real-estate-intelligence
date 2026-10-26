import type { IntentDecisionRequest, IntentDecisionResponse } from '@rei/contracts';
export interface IntentDecisionTransport {
  execute(
    request: IntentDecisionRequest,
    grant: string,
    signal: AbortSignal,
    deadlineAt: number,
  ): Promise<IntentDecisionResponse>;
}
