import type {
  ModelExplanationRequest,
  ModelExplanationResponse,
  ModelExplanation,
  PriceToolReceipt,
} from '@rei/contracts';
export const MODEL_EXPLANATION = Symbol('MODEL_EXPLANATION');
export interface ModelExplanationTransport {
  execute(
    request: ModelExplanationRequest,
    grant: string,
    signal: AbortSignal,
    deadlineAt: number,
  ): Promise<ModelExplanationResponse>;
}
export interface ModelExplanationContext {
  readonly version: 1;
  readonly eventId: string;
  readonly runId: string;
  readonly threadId: string;
  readonly executionId: string;
  readonly checkpointGrant: string;
  readonly locale: 'en' | 'pt-BR';
}
export interface ModelExplainer {
  explain(
    receipt: PriceToolReceipt,
    context: ModelExplanationContext,
    signal: AbortSignal,
    deadlineAt: number,
  ): Promise<ModelExplanation>;
}
