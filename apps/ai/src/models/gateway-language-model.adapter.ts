import {
  createGateway,
  GatewayError,
  GatewayForbiddenError,
  GatewayAuthenticationError,
  GatewayInvalidRequestError,
  GatewayFailedDependencyError,
  GatewayModelNotFoundError,
  GatewayNotFoundError,
  GatewayResponseError,
  type GatewayProviderOptions,
} from '@ai-sdk/gateway';
import { generateText, APICallError } from 'ai';
import { ResilienceTimeoutError } from '@nestjs/resilience';
import {
  ModelExplanationFailure,
  type LanguageModel,
  type LanguageModelRequest,
  type LanguageModelResult,
} from './language-model.port';
import { exhaustedGatewayQuota } from './gateway-quota';
import { modelFailure } from './model-failure';

/** No direct-provider integration; no SDK retries, tools, caching or payload telemetry. */
export class GatewayLanguageModelAdapter implements LanguageModel {
  public constructor(
    private readonly apiKey: string | undefined,
    private readonly sdkGenerate: typeof generateText = generateText,
    private readonly gatewayFactory: typeof createGateway = createGateway,
  ) {}
  public async generate(
    request: LanguageModelRequest,
    signal: AbortSignal,
  ): Promise<LanguageModelResult> {
    if (signal.aborted) throw new ModelExplanationFailure('cancelled');
    if (!this.apiKey || request.route !== 'vercel-ai-gateway' || request.zeroDataRetention !== true)
      throw new ModelExplanationFailure('policy');
    try {
      const result = await this.sdkGenerate({
        model: this.gatewayFactory({ apiKey: this.apiKey })(request.model),
        prompt: request.prompt,
        maxOutputTokens: request.maxOutputTokens,
        maxRetries: 0,
        abortSignal: signal,
        providerOptions: { gateway: { zeroDataRetention: true } satisfies GatewayProviderOptions },
        telemetry: { isEnabled: false, recordInputs: false, recordOutputs: false },
      });
      signal.throwIfAborted();
      return {
        text: result.text,
        outputTokens: result.usage.outputTokens,
        model: result.response.modelId,
        route: request.route,
        metadata: result.providerMetadata,
        warnings: result.warnings ?? [],
      };
    } catch (error) {
      if (signal.aborted || (error instanceof Error && error.name === 'AbortError'))
        throw modelFailure(error, signal);
      if (error instanceof ModelExplanationFailure) throw error;
      if (GatewayForbiddenError.isInstance(error)) throw new ModelExplanationFailure('policy');
      if (GatewayAuthenticationError.isInstance(error))
        throw new ModelExplanationFailure('authentication');
      if (
        GatewayInvalidRequestError.isInstance(error) ||
        GatewayFailedDependencyError.isInstance(error) ||
        GatewayModelNotFoundError.isInstance(error) ||
        GatewayNotFoundError.isInstance(error) ||
        GatewayResponseError.isInstance(error)
      )
        throw new ModelExplanationFailure('rejected');
      if (exhaustedGatewayQuota(error)) throw new ModelExplanationFailure('exhausted');
      // Successful-but-malformed SDK output can throw during normalization. Only
      // recognized transport/HTTP/attempt-timeout errors are transient candidates.
      if (
        !APICallError.isInstance(error) &&
        !GatewayError.isInstance(error) &&
        !(error instanceof ResilienceTimeoutError)
      )
        throw new ModelExplanationFailure('rejected');
      const status =
        APICallError.isInstance(error) || GatewayError.isInstance(error)
          ? error.statusCode
          : undefined;
      throw new ModelExplanationFailure(
        status === 401 || status === 403
          ? 'authentication'
          : status !== undefined && status < 500 && status !== 429 && status !== 408
            ? 'rejected'
            : 'transient',
      );
    }
  }
}
