import { createGateway, type GatewayProviderOptions } from '@ai-sdk/gateway';
import { generateText } from 'ai';
import {
  ModelExplanationFailure,
  type LanguageModel,
  type LanguageModelRequest,
  type LanguageModelResult,
} from './language-model.port';
import { gatewayFailure } from './gateway-failure';

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
      throw gatewayFailure(error, signal);
    }
  }
}
