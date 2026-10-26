import { mkdtemp, copyFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execa } from 'execa';
import { experimental_decide as decide } from 'ai';
import { askIntents } from '@rei/contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runIntentProbe } from './intent-probe';

function sdkFixture(
  fault?: 'privacy' | 'provider' | 'classification-provider' | 'wrong' | 'missing-cost',
) {
  let inFlight = 0;
  let maximum = 0;
  const phases: string[] = [];
  const fetch = vi.fn<typeof globalThis.fetch>(async (_url, init) => {
    maximum = Math.max(maximum, ++inFlight);
    const body: { state: string } = JSON.parse(String(init?.body));
    const phase = body.state.includes('Public privacy capability probe')
      ? 'privacy'
      : 'classification';
    phases.push(phase);
    expect(body).toMatchObject({ providerOptions: { gateway: { zeroDataRetention: true } } });
    await Promise.resolve();
    inFlight--;
    if (fault === 'provider' || (fault === 'classification-provider' && phase === 'classification'))
      return Response.json({ error: { message: 'secret-provider-body' } }, { status: 503 });
    const choice = fault === 'wrong' ? 'unsupported' : 'price_per_square_meter';
    return Response.json({
      answers: {
        intent: {
          type: 'choice',
          choice,
          probabilities: Object.fromEntries(
            askIntents.map((label) => [label, label === choice ? 0.9 : 0.02]),
          ),
        },
      },
      providerMetadata:
        fault === 'privacy'
          ? { gateway: { arbitrary: 'secret-metadata' } }
          : {
              gateway: {
                routing: {
                  planningReasoning:
                    'ZDR requested: 1 attempts → 1 ZDR attempts. ZDR execution order: jev(system)',
                },
                ...(fault === 'missing-cost' ? {} : { cost: phase === 'privacy' ? 0.001 : 0.002 }),
                arbitrary: 'secret-metadata',
              },
            },
      warnings: [],
    });
  });
  vi.stubGlobal('fetch', fetch);
  return { measured: decide, phases, fetch, maximum: () => maximum };
}

afterEach(() => vi.unstubAllGlobals());

describe('bounded synthetic Jev probe', () => {
  it('measures both physical phases sequentially and includes their costs', async () => {
    const fixture = sdkFixture();
    const result = await runIntentProbe('secret-key', fixture.measured);
    expect(result.passed).toBe(true);
    expect(fixture.phases).toEqual(['privacy', 'classification', 'privacy', 'classification']);
    expect(fixture.maximum()).toBe(1);
    expect(result.jev.summary).toMatchObject({
      cases: 2,
      accuracy: 1,
      failed: 0,
      costUsd: {
        calls: 4,
        observed: 4,
        unavailable: 0,
        totalUsd: 0.006,
        privacy: { totalUsd: 0.002 },
        classification: { totalUsd: 0.004 },
      },
    });
    expect(result.jev.summary.latencyMs.total).toBeGreaterThan(0);
    expect(result.jev.rows.every((row) => row.calls.every((call) => call.latencyMs >= 0))).toBe(
      true,
    );
    const serialized = JSON.stringify(result);
    for (const secret of ['secret-key', 'secret-metadata', 'Calculate price', 'Qual é'])
      expect(serialized).not.toContain(secret);
  });
  it.each(['privacy', 'provider', 'classification-provider', 'wrong', 'missing-cost'] as const)(
    'reports %s honestly without fallback or retries',
    async (fault) => {
      const fixture = sdkFixture(fault);
      const result = await runIntentProbe('secret-key', fixture.measured);
      expect(result.passed).toBe(fault === 'missing-cost');
      expect(fixture.fetch).toHaveBeenCalledTimes(
        fault === 'privacy' || fault === 'provider' ? 2 : 4,
      );
      expect(result.jev.summary.accuracy).toBe(fault === 'missing-cost' ? 1 : 0);
      if (fault === 'privacy' || fault === 'provider') {
        expect(fixture.phases).toEqual(['privacy', 'privacy']);
        expect(result.jev.summary.failed).toBe(2);
        expect(result.jev.rows.map((row) => row.failure)).toEqual(
          fault === 'privacy' ? ['policy', 'policy'] : ['transient', 'transient'],
        );
      }
      if (fault === 'classification-provider') {
        expect(result.jev.summary.failed).toBe(2);
        expect(result.jev.summary.costUsd.privacy.totalUsd).toBe(0.002);
        expect(result.jev.summary.costUsd.classification.unavailable).toBe(2);
      }
      if (fault !== 'wrong') expect(result.jev.summary.costUsd.totalUsd).toBeNull();
      expect(JSON.stringify(result)).not.toContain('secret');
    },
  );
  it('sanitizes initialization failure when the build is absent', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'rei-intent-cli-'));
    try {
      const script = join(directory, 'probe.mts');
      await copyFile(resolve('scripts/probe-intent-decision.ts'), script);
      const result = await execa(process.execPath, [script, '--live'], {
        env: { AI_GATEWAY_API_KEY: 'private-unused-key' },
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
          env: {
            AI_GATEWAY_API_KEY: live ? '' : 'private-unused-key',
            ANTHROPIC_API_KEY: 'private-unused-key',
          },
          reject: false,
        });
        expect(result.exitCode).toBe(live ? 1 : 0);
        expect(result.all ?? result.stdout + result.stderr).not.toContain('private-unused-key');
        expect(live ? result.stderr : result.stdout).toContain(
          live ? 'AI_GATEWAY_API_KEY is required' : 'Opt in with --live',
        );
      } finally {
        await rm(directory, { recursive: true, force: true });
      }
    },
  );
});
