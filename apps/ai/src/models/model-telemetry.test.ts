import { channel } from 'node:diagnostics_channel';
import { describe, expect, it, vi } from 'vitest';
import { ModelExplanationFailure } from './language-model.port';
import { modelExplanationSettings as settings } from './model-explanation.settings';
import { acknowledged } from './model-test.fixture';

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
    const diagnostics = channel('nestjs:resilience:fallback');
    diagnostics.publish({
      type: 'fallback',
      policy: settings.policies.fallback,
      source: 'secret grant',
      error: new ModelExplanationFailure('exhausted'),
      prompt: 'private question',
      response: 'private response',
    });
    expect(add).toHaveBeenCalledExactlyOnceWith(1, {
      'dependency.name': 'model-explanation',
      'resilience.policy.name': settings.policies.fallback,
      'resilience.event.type': 'fallback',
      'rei.ai.route': settings.route,
      'rei.ai.failure.kind': 'exhausted',
    });
    expect(addEvent).toHaveBeenCalledOnce();
    expect(
      safeModelPolicyAttributes({
        type: 'fallback',
        policy: settings.policies.fallback,
        error: Object.assign(new ModelExplanationFailure(), { kind: 'private arbitrary label' }),
      }),
    ).not.toHaveProperty('rei.ai.failure.kind');
    for (const message of [
      null,
      {},
      { type: 'fake', policy: settings.policies.fallback },
      { type: 'fallback', policy: 'foreign' },
    ])
      expect(safeModelPolicyAttributes(message)).toBeUndefined();
    telemetry.onModuleDestroy();
    telemetry.onModuleDestroy();
    diagnostics.publish({ type: 'fallback', policy: settings.policies.fallback });
    expect(add).toHaveBeenCalledOnce();
    expect(
      safeModelPolicyAttributes({
        type: 'circuit-open',
        policy: `${settings.policies.circuitBreaker}.${settings.route}.${settings.secondary}`,
        error: new Error('private provider payload'),
      }),
    ).toEqual({
      'dependency.name': 'model-explanation',
      'resilience.policy.name': `${settings.policies.circuitBreaker}.${settings.route}.${settings.secondary}`,
      'resilience.event.type': 'circuit-open',
      'rei.ai.route': settings.route,
      'rei.ai.model': settings.secondary,
    });
  });
  it('records actual attempt route, purpose, bounded usage/evidence age and sanitized failures without payloads', async () => {
    vi.clearAllMocks();
    start.mockImplementation(async (_name, _options, work) =>
      work({ setAttribute, setStatus, end }),
    );
    const result = acknowledged(settings.primary, 'private full response', 16);
    expect(await modelAttemptSpan(settings.primary, 'explanation', 12.4, async () => result)).toBe(
      result,
    );
    expect(start.mock.calls[0]?.[1]).toEqual({
      attributes: {
        'rei.ai.model': settings.primary,
        'rei.ai.route': settings.route,
        'rei.ai.provider': settings.route,
        'rei.ai.usage': 'unavailable',
        'rei.ai.cost': 'unavailable',
        'rei.ai.attempt.purpose': 'explanation',
        'rei.ai.privacy.evidence_age_ms': 12,
      },
    });
    expect(setAttribute).toHaveBeenCalledWith('rei.ai.output_tokens', 16);
    expect(add).toHaveBeenCalledWith(1, {
      'rei.ai.model': settings.primary,
      'rei.ai.route': settings.route,
      'rei.ai.attempt.purpose': 'explanation',
      'rei.ai.outcome': 'succeeded',
    });
    await expect(
      modelAttemptSpan(settings.secondary, 'privacy-probe', 999999, async () => {
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
    for (const [, attributes] of add.mock.calls)
      expect(attributes).not.toHaveProperty('rei.ai.privacy.evidence_age_ms');
  });
  it('exports supplied finite Gateway cost only, including zero, without exposing raw metadata', async () => {
    vi.clearAllMocks();
    start.mockImplementation(async (_name, _options, work) =>
      work({ setAttribute, setStatus, end }),
    );
    for (const cost of [0, 0.001]) {
      await modelAttemptSpan(settings.primary, 'explanation', 1, async () => ({
        ...acknowledged(settings.primary),
        metadata: { gateway: { cost }, secret: 'private metadata' },
      }));
      expect(setAttribute).toHaveBeenCalledWith('rei.ai.cost_usd', cost);
    }
    vi.clearAllMocks();
    for (const cost of ['0.1', -1, NaN, Infinity, undefined])
      await modelAttemptSpan(settings.primary, 'explanation', 1, async () => ({
        ...acknowledged(settings.primary),
        metadata: { gateway: { cost } },
      }));
    expect(setAttribute.mock.calls.some(([key]) => key === 'rei.ai.cost_usd')).toBe(false);
  });
  it('does not invent usage for malformed output and bounds unknown model/evidence values', async () => {
    vi.clearAllMocks();
    start.mockImplementation(async (_name, _options, work) =>
      work({ setAttribute, setStatus, end }),
    );
    for (const outputTokens of [undefined, 0, Number.NaN, 225]) {
      await modelAttemptSpan('untrusted model secret', 'privacy-probe', Number.NaN, async () => ({
        ...acknowledged(settings.primary),
        outputTokens,
      }));
    }
    expect(setAttribute.mock.calls.some(([key]) => key === 'rei.ai.output_tokens')).toBe(false);
    expect(setAttribute).toHaveBeenCalledWith('rei.ai.usage', 'unavailable');
    expect(start.mock.calls[0]?.[1]).toMatchObject({
      attributes: { 'rei.ai.model': 'unapproved', 'rei.ai.privacy.evidence_age_ms': 0 },
    });
    await expect(
      modelAttemptSpan(settings.primary, 'explanation', -1, async () => {
        throw new Error('private unknown error');
      }),
    ).rejects.toThrow('private unknown error');
    expect(setAttribute).toHaveBeenCalledWith('rei.ai.failure.kind', 'transient');
  });
});
