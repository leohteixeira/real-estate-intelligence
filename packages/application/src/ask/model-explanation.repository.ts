import type { ModelExplanationRequest, ModelExplanationResponse } from '@rei/domain';
export const MODEL_EXPLANATION_REPOSITORY = Symbol('MODEL_EXPLANATION_REPOSITORY');
/** API-owned, fenced durable budget and accepted explanation capability. */
export interface ModelExplanationRepository {
  execute(
    request: ModelExplanationRequest,
    grant: string,
    signal: AbortSignal,
  ): Promise<ModelExplanationResponse>;
}
