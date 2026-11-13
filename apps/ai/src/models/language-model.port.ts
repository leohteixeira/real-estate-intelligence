/** Vendor-free single-attempt capability. Only versioned instructions and receipt facts reach it. */
export const LANGUAGE_MODEL = Symbol('LANGUAGE_MODEL');
export interface LanguageModelRequest {
  readonly model: string;
  readonly route: 'anthropic-direct';
  readonly prompt: string;
  readonly maxOutputTokens: number;
}
export interface LanguageModelResult {
  readonly text: string;
  readonly outputTokens: number | undefined;
  readonly model: string;
  readonly route: 'anthropic-direct';
}
export interface LanguageModel {
  generate(request: LanguageModelRequest, signal: AbortSignal): Promise<LanguageModelResult>;
}
export class ModelExplanationFailure extends Error {
  public readonly retryAfterMs: number | undefined;
  public constructor(
    public readonly kind:
      | 'policy'
      | 'rejected'
      | 'authentication'
      | 'budget'
      | 'cancelled'
      | 'exhausted'
      | 'transient' = 'transient',
    retryAfterMs?: number,
  ) {
    super('Model explanation unavailable.');
    this.retryAfterMs =
      kind === 'transient' &&
      retryAfterMs !== undefined &&
      Number.isFinite(retryAfterMs) &&
      retryAfterMs >= 0 &&
      retryAfterMs <= 2_147_483_647
        ? Math.ceil(retryAfterMs)
        : undefined;
  }
}
