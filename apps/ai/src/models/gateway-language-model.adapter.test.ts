import { describe, expect, it, vi } from 'vitest';
import { APICallError } from 'ai';
import {
  GatewayForbiddenError,
  GatewayAuthenticationError,
  GatewayInvalidRequestError,
  GatewayInternalServerError,
  GatewayRateLimitError,
  GatewayResponseError,
} from '@ai-sdk/gateway';
import { ResilienceTimeoutError } from '@nestjs/resilience';
import { GatewayLanguageModelAdapter } from './gateway-language-model.adapter';
const sdk = vi.hoisted(() => ({ generate: vi.fn(), gateway: vi.fn(), select: vi.fn() }));
vi.mock('ai', async (original) => ({
  ...(await original<typeof import('ai')>()),
  generateText: sdk.generate,
}));
vi.mock('@ai-sdk/gateway', async (original) => ({
  ...(await original<typeof import('@ai-sdk/gateway')>()),
  createGateway: sdk.gateway,
}));
const request = {
  model: 'anthropic/claude-haiku-5.5',
  route: 'vercel-ai-gateway' as const,
  prompt: 'public fixed text',
  maxOutputTokens: 16,
  zeroDataRetention: true as const,
};
describe('single-attempt gateway SDK adapter', () => {
  it('uses the actual typed SDK controls without retries, private telemetry or direct provider credentials', async () => {
    sdk.gateway.mockReturnValue(sdk.select);
    sdk.select.mockReturnValue('selected-model');
    sdk.generate.mockResolvedValue({
      text: 'ready',
      usage: { outputTokens: 1 },
      response: { modelId: request.model },
      providerMetadata: { gateway: {} },
      warnings: [],
    });
    const signal = new AbortController().signal;
    expect(
      await new GatewayLanguageModelAdapter('fixture-not-a-real-key').generate(request, signal),
    ).toEqual({
      text: 'ready',
      outputTokens: 1,
      model: request.model,
      route: request.route,
      metadata: { gateway: {} },
      warnings: [],
    });
    expect(sdk.generate.mock.lastCall?.[0]).toMatchObject({
      maxRetries: 0,
      maxOutputTokens: 16,
      abortSignal: signal,
      providerOptions: { gateway: { zeroDataRetention: true } },
      telemetry: { isEnabled: false, recordInputs: false, recordOutputs: false },
    });
    expect(sdk.gateway.mock.lastCall?.[0]).toEqual({ apiKey: 'fixture-not-a-real-key' });
    expect(sdk.select.mock.lastCall?.[0]).toBe(request.model);
  });
  it('fails closed without credentials and with pre-cancellation, before SDK transmission', async () => {
    sdk.generate.mockClear();
    await expect(
      new GatewayLanguageModelAdapter(undefined).generate(request, new AbortController().signal),
    ).rejects.toMatchObject({ kind: 'policy' });
    const controller = new AbortController();
    controller.abort();
    await expect(
      new GatewayLanguageModelAdapter('fixture').generate(request, controller.signal),
    ).rejects.toMatchObject({ kind: 'cancelled' });
    expect(sdk.generate).not.toHaveBeenCalled();
  });
  it.each([
    [401, 'authentication'],
    [403, 'authentication'],
    [400, 'rejected'],
    [404, 'rejected'],
    [408, 'transient'],
    [429, 'transient'],
    [503, 'transient'],
  ] as const)('classifies SDK HTTP %s without leaking provider text', async (statusCode, kind) => {
    sdk.gateway.mockReturnValue(sdk.select);
    sdk.generate.mockRejectedValue(
      new APICallError({
        message: 'secret provider payload',
        url: 'https://fixture.invalid',
        requestBodyValues: {},
        statusCode,
      }),
    );
    await expect(
      new GatewayLanguageModelAdapter('fixture').generate(request, new AbortController().signal),
    ).rejects.toMatchObject({ kind, message: 'Model explanation unavailable.' });
  });
  it.each([new TypeError('private normalization payload'), new Error('private output'), null])(
    'definitively rejects unstructured SDK failures without exposing a cause (%s)',
    async (error) => {
      sdk.generate.mockRejectedValue(error);
      await expect(
        new GatewayLanguageModelAdapter('fixture').generate(request, new AbortController().signal),
      ).rejects.toMatchObject({ kind: 'rejected', message: 'Model explanation unavailable.' });
    },
  );
  it('retains a recognized SDK transport failure without HTTP status as transient', async () => {
    sdk.generate.mockRejectedValue(
      new APICallError({
        message: 'private transport payload',
        url: 'https://fixture.invalid',
        requestBodyValues: {},
        isRetryable: true,
      }),
    );
    await expect(
      new GatewayLanguageModelAdapter('fixture').generate(request, new AbortController().signal),
    ).rejects.toMatchObject({ kind: 'transient', message: 'Model explanation unavailable.' });
  });
  it.each([
    [new GatewayForbiddenError({ message: 'secret policy payload' }), 'policy'],
    [new GatewayAuthenticationError({ message: 'secret credentials' }), 'authentication'],
    [new GatewayInvalidRequestError({ message: 'private request' }), 'rejected'],
    [new GatewayResponseError({ response: { question: 'private' } }), 'rejected'],
    [new GatewayRateLimitError(), 'transient'],
    [new GatewayInternalServerError(), 'transient'],
    [new DOMException('private abort reason', 'AbortError'), 'cancelled'],
    [new ResilienceTimeoutError(3500, 'fixture-timeout'), 'transient'],
  ] as const)(
    'uses SDK structured error classes without exposing their payload (%s)',
    async (error, kind) => {
      sdk.generate.mockRejectedValue(error);
      await expect(
        new GatewayLanguageModelAdapter('fixture').generate(request, new AbortController().signal),
      ).rejects.toMatchObject({ kind, message: 'Model explanation unavailable.' });
    },
  );
  it.each([
    [402, 'quota_for_entity_exceeded'],
    [402, 'insufficient_funds'],
    [429, 'insufficient_quota'],
    [429, 'credit_balance_exhausted'],
    [429, 'organization_usage_limit_exceeded'],
  ] as const)(
    'recognizes documented structured quota %s/%s through the actual Gateway cause',
    async (statusCode, code) => {
      const cause = new APICallError({
        message: 'private balance and key',
        url: 'https://fixture.invalid',
        requestBodyValues: { prompt: 'private' },
        statusCode,
        data: { error: { type: code, code, message: 'private balance' } },
      });
      sdk.generate.mockRejectedValue(new GatewayInternalServerError({ cause, statusCode }));
      await expect(
        new GatewayLanguageModelAdapter('fixture').generate(request, new AbortController().signal),
      ).rejects.toMatchObject({ kind: 'exhausted', message: 'Model explanation unavailable.' });
      expect(sdk.generate.mock.lastCall?.[0].maxRetries).toBe(0);
    },
  );
  it.each([
    [{ error: { type: 'quota_for_entity_exceeded' } }, undefined, 402, 'exhausted'],
    [undefined, '{"error":{"type":"quota_for_entity_exceeded"}}', 402, 'exhausted'],
    [undefined, '{"error":{"type":"insufficient_quota"}}', 429, 'exhausted'],
    [
      undefined,
      '{"error":{"type":"insufficient_quota","message":"' + 'x'.repeat(4096) + '"}}',
      429,
      'transient',
    ],
    [undefined, '{malformed', 429, 'transient'],
    [{ error: { type: 42 } }, undefined, 429, 'transient'],
    [
      { error: { type: 'rate_limit_exceeded', message: 'insufficient_quota' } },
      undefined,
      429,
      'transient',
    ],
    [{ error: { type: 'insufficient_quota_suffix' } }, undefined, 429, 'transient'],
    [{ error: { type: 'insufficient_quota' } }, undefined, 401, 'authentication'],
    [{ error: { type: 'quota_for_entity_exceeded' } }, undefined, 400, 'rejected'],
  ] as const)(
    'bounds and sanitizes quota parsing without guessing from messages (%j)',
    async (data, responseBody, statusCode, kind) => {
      sdk.generate.mockRejectedValue(
        new APICallError({
          message: 'insufficient_quota private payload',
          url: 'https://fixture.invalid',
          requestBodyValues: {},
          statusCode,
          data,
          responseBody,
        }),
      );
      await expect(
        new GatewayLanguageModelAdapter('fixture').generate(request, new AbortController().signal),
      ).rejects.toMatchObject({ kind, message: 'Model explanation unavailable.' });
    },
  );
  it('caller cancellation dominates a package timeout/quota and never retains an SDK cause', async () => {
    const controller = new AbortController();
    sdk.generate.mockImplementation(async () => {
      controller.abort(new ResilienceTimeoutError(1, 'caller-deadline'));
      throw new GatewayInternalServerError({ message: 'private' });
    });
    await expect(
      new GatewayLanguageModelAdapter('fixture').generate(request, controller.signal),
    ).rejects.toMatchObject({ kind: 'cancelled', message: 'Model explanation unavailable.' });
  });
});
