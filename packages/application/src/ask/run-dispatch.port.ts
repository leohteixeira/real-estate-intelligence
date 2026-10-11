import type { AskClaim, AskCompletion, AskLiveRun, AskRequestedIdentity } from '@rei/domain';
export const RUN_DISPATCH = Symbol('RUN_DISPATCH');
export interface RunDispatch {
  claim(identity: AskRequestedIdentity, signal: AbortSignal, deadlineAt: number): Promise<AskClaim>;
  complete(request: AskCompletion, signal: AbortSignal, deadlineAt: number): Promise<AskLiveRun>;
}
