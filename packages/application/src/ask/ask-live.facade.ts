import type { AskRunRepository } from './ask-run.repository.js';
import type { AskLiveRun, TextAskCreate, PriceInputRefusalReason } from '@rei/domain';
export const ASK_LIVE_FACADE = Symbol('ASK_LIVE_FACADE');
export type TextAskAdmission =
  | { readonly kind: 'accepted'; readonly run: AskLiveRun }
  | { readonly kind: 'refused'; readonly reason: PriceInputRefusalReason };
export interface AskLiveFacade extends AskRunRepository {
  createText(
    request: TextAskCreate,
    capability: string,
    key: string,
    signal?: AbortSignal,
  ): Promise<TextAskAdmission>;
}
