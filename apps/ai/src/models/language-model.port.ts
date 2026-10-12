/** Vendor-free single-attempt capability. Only facts or fixed public probe text reach this port. */
export const LANGUAGE_MODEL = Symbol('LANGUAGE_MODEL');
export interface LanguageModelRequest {
  readonly model: string;
  readonly route: 'vercel-ai-gateway';
  readonly prompt: string;
  readonly maxOutputTokens: number;
  readonly zeroDataRetention: true;
}
export interface LanguageModelResult {
  readonly text: string;
  readonly outputTokens: number | undefined;
  readonly model: string;
  readonly route: 'vercel-ai-gateway';
  readonly metadata: unknown;
  readonly warnings: readonly unknown[];
}
export interface LanguageModel {
  generate(request: LanguageModelRequest, signal: AbortSignal): Promise<LanguageModelResult>;
}
export class ModelExplanationFailure extends Error {
  public constructor(
    public readonly kind:
      | 'policy'
      | 'rejected'
      | 'authentication'
      | 'budget'
      | 'cancelled'
      | 'exhausted'
      | 'transient' = 'transient',
  ) {
    super('Model explanation unavailable.');
  }
}
