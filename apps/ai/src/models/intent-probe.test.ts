import { mkdtemp, copyFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execa } from 'execa';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AnthropicFetch } from './anthropic-client';
import { runIntentProbe } from './intent-probe';
import { anthropicError, anthropicMessage } from './model-test.fixture';

type Fetch = NonNullable<AnthropicFetch>;
function providerFixture(fault?: 'provider' | 'wrong' | 'unconfident' | 'missing-usage') {
  let inFlight = 0;
  let maximum = 0;
  const fetch = vi.fn<Fetch>(async (url, init) => {
    maximum = Math.max(maximum, ++inFlight);
    expect(String(url)).toBe('https://api.anthropic.com/v1/messages');
    expect(JSON.parse(String(init?.body))).toMatchObject({
      model: 'claude-haiku-5-5',
      output_config: { format: { type: 'json_schema' } },
    });
    await Promise.resolve();
    inFlight--;
    if (fault === 'provider')
      return Response.json(anthropicError('secret-provider-body'), { status: 503 });
    return Response.json(
      anthropicMessage(
        JSON.stringify({
          intent: fault === 'wrong' ? 'unsupported' : 'price_per_square_meter',
          probability: fault === 'unconfident' ? 0.6 : 0.9,
        }),
        fault === 'missing-usage' ? { usage: undefined } : {},
      ),
    );
  });
  return { fetch, maximum: () => maximum };
}

afterEach(() => vi.unstubAllGlobals());

describe('bounded synthetic classifier probe', () => {
  it('measures one physical request per public case sequentially with its token usage', async () => {
    // The global must stay untouched: the probe only uses the transport it is handed.
    const ambient = vi.fn<typeof globalThis.fetch>();
    vi.stubGlobal('fetch', ambient);
    const fixture = providerFixture();
    const result = await runIntentProbe('secret-key', fixture.fetch);
    expect(result).toMatchObject({
      datasetVersion: 'ask-intents-v1',
      model: 'claude-haiku-5-5',
      promptVersion: 'ask-intent-classifier-prompt-v1',
      passed: true,
    });
    expect(fixture.fetch).toHaveBeenCalledTimes(2);
    expect(ambient).not.toHaveBeenCalled();
    expect(fixture.maximum()).toBe(1);
    expect(result.classifier.summary).toMatchObject({
      cases: 2,
      accuracy: 1,
      failed: 0,
      confidence: { confident: 2, expectationAccuracy: 1 },
      usage: { calls: 2, observed: 2, unavailable: 0, inputTokens: 24, outputTokens: 14 },
    });
    expect(result.classifier.summary.latencyMs.total).toBeGreaterThan(0);
    expect(
      result.classifier.rows.every(
        (row) => row.calls.length === 1 && row.calls.every((call) => call.latencyMs >= 0),
      ),
    ).toBe(true);
    expect(result.heuristic.summary).toMatchObject({ cases: 2, accuracy: 1, usage: { calls: 0 } });
    const serialized = JSON.stringify(result);
    for (const secret of ['secret-key', 'Calculate price', 'Qual é', '<question>'])
      expect(serialized).not.toContain(secret);
  });
  it.each(['provider', 'wrong', 'unconfident', 'missing-usage'] as const)(
    'reports %s honestly without fallback or retries',
    async (fault) => {
      const fixture = providerFixture(fault);
      const result = await runIntentProbe('secret-key', fixture.fetch);
      const answered = fault === 'unconfident' || fault === 'missing-usage';
      expect(result.passed).toBe(answered);
      expect(fixture.fetch).toHaveBeenCalledTimes(2);
      expect(result.classifier.summary.accuracy).toBe(answered ? 1 : 0);
      if (fault === 'provider') {
        expect(result.classifier.summary.failed).toBe(2);
        expect(result.classifier.rows.map((row) => row.failure)).toEqual([
          'transient',
          'transient',
        ]);
      }
      if (fault === 'unconfident')
        expect(result.classifier.summary.confidence).toMatchObject({
          confident: 0,
          expectationAccuracy: 0,
        });
      expect(result.classifier.summary.usage).toMatchObject(
        fault === 'provider' || fault === 'missing-usage'
          ? { calls: 2, observed: 0, unavailable: 2, inputTokens: null, outputTokens: null }
          : { calls: 2, observed: 2, inputTokens: 24, outputTokens: 14 },
      );
      expect(JSON.stringify(result)).not.toContain('secret');
    },
  );
  it('sanitizes initialization failure when the build is absent', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'rei-intent-cli-'));
    try {
      const script = join(directory, 'probe.mts');
      await copyFile(resolve('scripts/probe-intent-decision.ts'), script);
      const result = await execa(process.execPath, [script, '--live'], {
        env: { ANTHROPIC_API_KEY: 'private-unused-key' },
        reject: false,
      });
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toBe('Intent probe unavailable: build or probe initialization failed.');
      expect(result.stdout).toBe('');
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
  it.each([false, true])(
    'guards actual CLI with no build or provider modules (live=%s)',
    async (live) => {
      const directory = await mkdtemp(join(tmpdir(), 'rei-intent-cli-'));
      try {
        const script = join(directory, 'probe.mts');
        await copyFile(resolve('scripts/probe-intent-decision.ts'), script);
        const result = await execa(process.execPath, [script, ...(live ? ['--live'] : [])], {
          env: { ANTHROPIC_API_KEY: live ? '' : 'private-unused-key' },
          reject: false,
        });
        expect(result.exitCode).toBe(live ? 1 : 0);
        expect(result.all ?? result.stdout + result.stderr).not.toContain('private-unused-key');
        expect(live ? result.stderr : result.stdout).toContain(
          live ? 'ANTHROPIC_API_KEY is required' : 'Opt in with --live',
        );
      } finally {
        await rm(directory, { recursive: true, force: true });
      }
    },
  );
});
