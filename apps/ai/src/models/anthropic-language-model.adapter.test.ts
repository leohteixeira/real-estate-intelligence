import { ResilienceTimeoutError } from '@nestjs/resilience';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AnthropicFetch } from './anthropic-client';
import { anthropicFailure, providerRetryAfter } from './anthropic-failure';
import { AnthropicLanguageModelAdapter } from './anthropic-language-model.adapter';
import { ModelExplanationFailure } from './language-model.port';
import { modelExplanationSettings as settings } from './model-explanation.settings';
import { anthropicError, anthropicMessage } from './model-test.fixture';

// The real pinned SDK runs in every test; only its documented `fetch` option is replaced.
type Fetch = NonNullable<AnthropicFetch>;
const key = 'offline-fixture-not-a-real-key';
const request = {
  model: settings.model,
  route: settings.route,
  prompt: 'public fixed text',
  maxOutputTokens: 16,
};
const adapter = (fetch: Fetch) => new AnthropicLanguageModelAdapter(key, fetch);
const live = () => new AbortController().signal;

describe('single-attempt Anthropic Messages adapter', () => {
  afterEach(() => vi.unstubAllEnvs());
  it('sends one direct request with only the documented controls and the service credential', async () => {
    // Ambient SDK variables must not reroute the request or replace the credential.
    vi.stubEnv('ANTHROPIC_BASE_URL', 'https://ambient.invalid');
    vi.stubEnv('ANTHROPIC_AUTH_TOKEN', 'ambient-token-not-used');
    const fetch = vi.fn<Fetch>(async () => Response.json(anthropicMessage('ready')));
    expect(await adapter(fetch).generate(request, live())).toEqual({
      text: 'ready',
      outputTokens: 7,
      model: settings.model,
      route: settings.route,
    });
    expect(fetch).toHaveBeenCalledOnce();
    const [url, init] = fetch.mock.calls[0]!;
    expect(String(url)).toBe('https://api.anthropic.com/v1/messages');
    const headers = new Headers(init?.headers);
    expect(headers.get('x-api-key')).toBe(key);
    expect(headers.get('authorization')).toBeNull();
    expect(headers.get('x-stainless-retry-count')).toBe('0');
    // No system text, tools, caching, metadata, sampling or fallback fields: prompt and bounds only.
    expect(JSON.parse(String(init?.body))).toEqual({
      model: 'claude-haiku-5-5',
      max_tokens: 16,
      thinking: { type: 'disabled' },
      output_config: { effort: 'low' },
      messages: [{ role: 'user', content: 'public fixed text' }],
    });
  });
  it('accepts a dated snapshot of the requested model and reports the requested identifier', async () => {
    const fetch = vi.fn<Fetch>(async () =>
      Response.json(anthropicMessage('ready', { model: 'claude-haiku-5-5-20260801' })),
    );
    expect((await adapter(fetch).generate(request, live())).model).toBe(settings.model);
  });
  it('fails closed without credentials, on another route and on pre-cancellation, before transmission', async () => {
    const fetch = vi.fn<Fetch>(async () => Response.json(anthropicMessage('ready')));
    await expect(
      new AnthropicLanguageModelAdapter(undefined, fetch).generate(request, live()),
    ).rejects.toMatchObject({ kind: 'policy' });
    const rerouted = { ...request };
    expect(Reflect.set(rerouted, 'route', 'vercel-ai-gateway')).toBe(true);
    await expect(adapter(fetch).generate(rerouted, live())).rejects.toMatchObject({
      kind: 'policy',
    });
    const controller = new AbortController();
    controller.abort();
    await expect(adapter(fetch).generate(request, controller.signal)).rejects.toMatchObject({
      kind: 'cancelled',
    });
    expect(fetch).not.toHaveBeenCalled();
  });
  it.each([
    [401, 'authentication_error', 'authentication'],
    [403, 'permission_error', 'authentication'],
    [400, 'invalid_request_error', 'rejected'],
    [404, 'not_found_error', 'rejected'],
    [413, 'request_too_large', 'rejected'],
    [422, 'invalid_request_error', 'rejected'],
    [408, 'timeout_error', 'transient'],
    [429, 'rate_limit_error', 'transient'],
    [500, 'api_error', 'transient'],
    [503, 'api_error', 'transient'],
    [529, 'overloaded_error', 'transient'],
    [402, 'billing_error', 'exhausted'],
    [400, 'billing_error', 'exhausted'],
  ] as const)(
    'classifies HTTP %s %s as %s with one attempt and no provider text',
    async (status, type, kind) => {
      const fetch = vi.fn<Fetch>(async () => Response.json(anthropicError(type), { status }));
      const failure: unknown = await adapter(fetch)
        .generate(request, live())
        .catch((error: unknown) => error);
      expect(failure).toBeInstanceOf(ModelExplanationFailure);
      expect(failure).toMatchObject({ kind, message: 'Model explanation unavailable.' });
      expect(failure).not.toHaveProperty('cause');
      expect(JSON.stringify(failure)).not.toContain('private');
      expect(fetch).toHaveBeenCalledOnce();
    },
  );
  it.each([
    [{ error: { type: 'rate_limit_error', message: 'billing_error' } }, 429, 'transient'],
    [{ error: { type: 'billing_error_suffix' } }, 400, 'rejected'],
    [{ error: { type: 42 } }, 400, 'rejected'],
    [{ error: { message: 'Your credit balance is too low' } }, 400, 'rejected'],
    [{ error: { type: 'billing_error' } }, 401, 'exhausted'],
  ] as const)(
    'reads exhaustion only from the structured discriminant, never from a message (%j)',
    async (body, status, kind) => {
      const fetch = vi.fn<Fetch>(async () => Response.json(body, { status }));
      await expect(adapter(fetch).generate(request, live())).rejects.toMatchObject({
        kind,
        message: 'Model explanation unavailable.',
      });
    },
  );
  it.each(['connection reset', 'connect timeout', '502 HTML', '503 nonconforming JSON'] as const)(
    'sanitizes %s as transient while preserving only canonical retry advice',
    async (fault) => {
      const fetch = vi.fn<Fetch>(async () => {
        if (fault === 'connection reset' || fault === 'connect timeout')
          throw new TypeError('fetch failed', {
            cause: Object.assign(new Error('private network detail'), {
              code: fault === 'connection reset' ? 'ECONNRESET' : 'UND_ERR_CONNECT_TIMEOUT',
            }),
          });
        return fault === '502 HTML'
          ? new Response('<html>private upstream failure</html>', {
              status: 502,
              headers: { 'retry-after': '0.2' },
            })
          : Response.json(
              { unexpected: 'private upstream detail' },
              { status: 503, headers: { 'retry-after': '0.2' } },
            );
      });
      const failure: unknown = await adapter(fetch)
        .generate(request, live())
        .catch((error: unknown) => error);
      expect(failure).toMatchObject({
        kind: 'transient',
        message: 'Model explanation unavailable.',
        retryAfterMs: fault === '502 HTML' || fault === '503 nonconforming JSON' ? 200 : undefined,
      });
      expect(failure).not.toHaveProperty('cause');
      expect(JSON.stringify(failure)).not.toContain('private');
      expect(fetch).toHaveBeenCalledOnce();
    },
  );
  it.each([
    ['empty object', {}, 'rejected'],
    ['refusal', anthropicMessage('', { stop_reason: 'refusal', content: [] }), 'policy'],
    ['truncated output', anthropicMessage('partial', { stop_reason: 'max_tokens' }), 'rejected'],
    ['tool use stop', anthropicMessage('ready', { stop_reason: 'tool_use' }), 'rejected'],
    ['another model', anthropicMessage('ready', { model: 'claude-opus-5-5' }), 'rejected'],
    ['a longer model name', anthropicMessage('ready', { model: 'claude-haiku-5-5-x' }), 'rejected'],
    ['missing content', anthropicMessage('ready', { content: undefined }), 'rejected'],
    ['malformed text block', anthropicMessage('', { content: [{ type: 'text' }] }), 'rejected'],
  ] as const)('refuses a successful response with %s as %s', async (_name, body, kind) => {
    const fetch = vi.fn<Fetch>(async () => Response.json(body));
    await expect(adapter(fetch).generate(request, live())).rejects.toMatchObject({
      kind,
      message: 'Model explanation unavailable.',
    });
    expect(fetch).toHaveBeenCalledOnce();
  });
  it('refuses a successful non-JSON body as definitive', async () => {
    const fetch = vi.fn<Fetch>(async () => new Response('<html>private</html>'));
    await expect(adapter(fetch).generate(request, live())).rejects.toMatchObject({
      kind: 'rejected',
    });
  });
  it.each([undefined, null, { input_tokens: 1 }, { output_tokens: '7' }])(
    'leaves usage %j unavailable for the caller to refuse instead of inventing a count',
    async (usage) => {
      const fetch = vi.fn<Fetch>(async () => Response.json(anthropicMessage('ready', { usage })));
      expect((await adapter(fetch).generate(request, live())).outputTokens).toBeUndefined();
    },
  );
  it('joins text blocks and ignores non-text blocks', async () => {
    const fetch = vi.fn<Fetch>(async () =>
      Response.json(
        anthropicMessage('', {
          content: [
            { type: 'thinking', thinking: '', signature: 'fixture' },
            { type: 'text', text: 'first ' },
            { type: 'text', text: 'second' },
          ],
        }),
      ),
    );
    expect((await adapter(fetch).generate(request, live())).text).toBe('first second');
  });
  it('caller cancellation dominates a provider failure and malformed successful output', async () => {
    for (const reply of [
      () => Response.json({}),
      () => Response.json(anthropicError('billing_error'), { status: 402 }),
    ]) {
      const controller = new AbortController();
      const fetch = vi.fn<Fetch>(async () => {
        controller.abort(new Error('offline private cancellation reason'));
        return reply();
      });
      await expect(adapter(fetch).generate(request, controller.signal)).rejects.toMatchObject({
        kind: 'cancelled',
        message: 'Model explanation unavailable.',
      });
      expect(fetch).toHaveBeenCalledOnce();
    }
  });
  it('aborts the pending request when the caller cancels', async () => {
    const controller = new AbortController();
    const fetch = vi.fn<Fetch>(
      async (_url, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener(
            'abort',
            () => reject(new DOMException('Aborted', 'AbortError')),
            { once: true },
          );
          controller.abort();
        }),
    );
    await expect(adapter(fetch).generate(request, controller.signal)).rejects.toMatchObject({
      kind: 'cancelled',
    });
  });
});

describe('closed provider failure vocabulary', () => {
  it.each([new TypeError('private normalization payload'), new Error('private output'), null])(
    'definitively rejects unstructured failures without exposing a cause (%s)',
    (error) => {
      const failure = anthropicFailure(error, live());
      expect(failure).toMatchObject({
        kind: 'rejected',
        message: 'Model explanation unavailable.',
      });
      expect(failure).not.toHaveProperty('cause');
    },
  );
  it('keeps typed failures and maps a policy timeout or abort without a provider status', () => {
    const typed = new ModelExplanationFailure('budget');
    expect(anthropicFailure(typed, live())).toBe(typed);
    expect(anthropicFailure(new ResilienceTimeoutError(3500, 'fixture-timeout'), live()).kind).toBe(
      'transient',
    );
    expect(
      anthropicFailure(new DOMException('private abort reason', 'AbortError'), live()).kind,
    ).toBe('cancelled');
    const controller = new AbortController();
    controller.abort();
    expect(anthropicFailure(typed, controller.signal).kind).toBe('cancelled');
  });
  it('bounds finite, non-negative retry advice and refuses malformed header values', () => {
    expect(providerRetryAfter('0.2')).toBe(200);
    expect(providerRetryAfter('31')).toBe(31000);
    expect(providerRetryAfter('999999999999')).toBe(2_147_483_647);
    expect(providerRetryAfter(new Date(Date.now() + 10000).toUTCString())).toBeLessThanOrEqual(
      10000,
    );
    for (const value of [undefined, '', '-1', 'NaN', 'Infinity', '1e3', 'soon', 'x'.repeat(65)])
      expect(providerRetryAfter(value)).toBeUndefined();
    expect(providerRetryAfter(new Date(Date.now() - 10000).toUTCString())).toBeUndefined();
  });
});
