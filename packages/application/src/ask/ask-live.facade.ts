import type { AskRunRepository, AskVisitorAdmission } from './ask-run.repository.js';
import type { AskLiveRun, TextAskCreateInput, PriceInputRefusalReason } from '@rei/domain';
export const ASK_LIVE_FACADE = Symbol('ASK_LIVE_FACADE');
export type TextAskAdmission =
  | { readonly kind: 'accepted'; readonly run: AskLiveRun }
  | { readonly kind: 'refused'; readonly reason: PriceInputRefusalReason };
export interface AskLiveFacade extends AskRunRepository {
  createRouted(
    request: import('@rei/domain').RoutedAskCreateInput,
    capability: string,
    key: string,
    admission: AskVisitorAdmission,
    signal?: AbortSignal,
  ): Promise<AskLiveRun>;
  createText(
    request: TextAskCreateInput,
    capability: string,
    key: string,
    admission: AskVisitorAdmission,
    signal?: AbortSignal,
  ): Promise<TextAskAdmission>;
}
