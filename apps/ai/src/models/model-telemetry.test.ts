import { channel } from 'node:diagnostics_channel';
import { describe, expect, it, vi } from 'vitest';
import { ModelExplanationFailure } from './language-model.port';
import { modelExplanationSettings as settings } from './model-explanation.settings';
import { generated } from './model-test.fixture';

const { add, addEvent, setAttribute, setStatus, end, start } = vi.hoisted(() => ({
  add: vi.fn(),
  addEvent: vi.fn(),
  setAttribute: vi.fn(),
  setStatus: vi.fn(),
  end: vi.fn(),
  start: vi.fn(),
}));
vi.mock('@opentelemetry/api', () => ({
  metrics: { getMeter: () => ({ createCounter: () => ({ add }) }) },
  SpanStatusCode: { OK: 1, ERROR: 2 },
  trace: {
    getActiveSpan: () => ({ addEvent }),
    getTracer: () => ({ startActiveSpan: start }),
  },
}));
import {
  ModelPolicyTelemetry,
  modelAttemptSpan,
  safeModelPolicyAttributes,
} from './model-telemetry';

describe('payload-free bounded model observability', () => {
  it('projects named typed policy events, ignores foreign/malformed messages, and removes lifecycle listeners', () => {
    vi.clearAllMocks();
    const telemetry = new ModelPolicyTelemetry();
    telemetry.onModuleInit();
    telemetry.onModuleInit();
    const diagnostics = channel('nestjs:resilience:retry');
    diagnostics.publish({
      type: 'retry',
      policy: settings.policies.retry,
      source: 'secret grant',
      error: new ModelExplanationFailure('transient'),
      prompt: 'private question',
      response: 'private response',
    });
    expect(add).toHaveBeenCalledExactlyOnceWith(1, {
      'dependency.name': 'model-explanation',
      'resilience.policy.name': settings.policies.retry,
      'resilience.event.type': 'retry',
      'rei.ai.route': 'anthropic-direct',
      'rei.ai.failure.kind': 'transient',
    });
    expect(addEvent).toHaveBeenCalledOnce();
    expect(
      safeModelPolicyAttributes({
        type: 'retry',
        policy: settings.policies.retry,
        error: Object.assign(new ModelExplanationFailure(), { kind: 'private arbitrary label' }),
      }),
    ).not.toHaveProperty('rei.ai.failure.kind');
    for (const message of [
      null,
      {},
      { type: 'fake', policy: settings.policies.retry },
      { type: 'retry', policy: 'foreign' },
      // Removed vocabulary: there is no fallback policy and no per-model breaker name.
      { type: 'fallback', policy: 'model-explanation.eligible-fallback' },
      { type: 'fallback', policy: settings.policies.retry },
      {
        type: 'circuit-open',
        policy: `${settings.policies.circuitBreaker}.vercel-ai-gateway.anthropic/claude-haiku-5.5`,
      },
    ])
      expect(safeModelPolicyAttributes(message)).toBeUndefined();
    telemetry.onModuleDestroy();
    telemetry.onModuleDestroy();
    diagnostics.publish({ type: 'retry', policy: settings.policies.retry });
    expect(add).toHaveBeenCalledOnce();
    expect(
      safeModelPolicyAttributes({
        type: 'circuit-open',
        policy: settings.policies.circuitBreaker,
        error: new Error('private provider payload'),
      }),
    ).toEqual({
      'dependency.name': 'model-explanation',
      'resilience.policy.name': 'model-explanation.circuit-breaker',
      'resilience.event.type': 'circuit-open',
      'rei.ai.route': 'anthropic-direct',
      'rei.ai.model': 'claude-haiku-5-5',
    });
  });
  it('records actual attempt model, provider, route, purpose, bounded usage and sanitized failures without payloads', async () => {
    vi.clearAllMocks();
    start.mockImplementation(async (_name, _options, work) =>
      work({ setAttribute, setStatus, end }),
    );
    const result = generated('private full response', 16);
    expect(await modelAttemptSpan(settings.model, async () => result)).toBe(result);
    expect(start.mock.calls[0]?.[1]).toEqual({
      attributes: {
        'rei.ai.model': 'claude-haiku-5-5',
        'rei.ai.route': 'anthropic-direct',
        'rei.ai.provider': 'anthropic',
        'rei.ai.usage': 'unavailable',
        'rei.ai.cost': 'unavailable',
        'rei.ai.attempt.purpose': 'explanation',
      },
    });
    expect(setAttribute).toHaveBeenCalledWith('rei.ai.usage', 'available');
    expect(setAttribute).toHaveBeenCalledWith('rei.ai.output_tokens', 16);
    expect(add).toHaveBeenCalledWith(16, {
      'rei.ai.model': 'claude-haiku-5-5',
      'rei.ai.route': 'anthropic-direct',
      'rei.ai.attempt.purpose': 'explanation',
    });
    expect(add).toHaveBeenCalledWith(1, {
      'rei.ai.model': 'claude-haiku-5-5',
      'rei.ai.route': 'anthropic-direct',
      'rei.ai.attempt.purpose': 'explanation',
      'rei.ai.outcome': 'succeeded',
    });
    await expect(
      modelAttemptSpan(settings.model, async () => {
        throw new ModelExplanationFailure('authentication');
      }),
    ).rejects.toMatchObject({ kind: 'authentication' });
    expect(setAttribute).toHaveBeenCalledWith('rei.ai.failure.kind', 'authentication');
    expect(start.mock.calls[1]?.[1]).toMatchObject({
      attributes: { 'rei.ai.usage': 'unavailable', 'rei.ai.cost': 'unavailable' },
    });
    expect(end).toHaveBeenCalledTimes(2);
    expect(
      JSON.stringify([start.mock.calls, add.mock.calls, setAttribute.mock.calls]),
    ).not.toContain('private');
  });
  it('never reports a price or privacy evidence: the provider returns token usage only', async () => {
    vi.clearAllMocks();
    start.mockImplementation(async (_name, _options, work) =>
      work({ setAttribute, setStatus, end }),
    );
    await modelAttemptSpan(settings.model, async () => generated('ready', 16));
    const recorded = JSON.stringify([start.mock.calls, add.mock.calls, setAttribute.mock.calls]);
    for (const removed of ['rei.ai.cost_usd', 'rei.ai.privacy.evidence_age_ms', 'gateway'])
      expect(recorded).not.toContain(removed);
    expect(setAttribute.mock.calls.some(([key]) => key === 'rei.ai.cost')).toBe(false);
  });
  it('does not invent usage for malformed output and bounds an unknown model value', async () => {
    vi.clearAllMocks();
    start.mockImplementation(async (_name, _options, work) =>
      work({ setAttribute, setStatus, end }),
    );
    for (const outputTokens of [undefined, 0, Number.NaN, 225]) {
      await modelAttemptSpan('untrusted model secret', async () => ({
        ...generated('ready'),
        outputTokens,
      }));
    }
    expect(setAttribute.mock.calls.some(([key]) => key === 'rei.ai.output_tokens')).toBe(false);
    expect(setAttribute).toHaveBeenCalledWith('rei.ai.usage', 'unavailable');
    expect(start.mock.calls[0]?.[1]).toMatchObject({
      attributes: { 'rei.ai.model': 'unapproved' },
    });
    await expect(
      modelAttemptSpan(settings.model, async () => {
        throw new Error('private unknown error');
      }),
    ).rejects.toThrow('private unknown error');
    expect(setAttribute).toHaveBeenCalledWith('rei.ai.failure.kind', 'transient');
  });
});
