import { parseAskClaim, parseAskLiveRun } from '@rei/contracts';
import { describe, expect, it } from 'vitest';
import { InMemoryRunDispatch } from './in-memory-run-dispatch.adapter.js';
const identity = {
    version: 1 as const,
    eventId: '0199c8f2-2394-7ba0-8f9e-286378779212',
    runId: '0199c8f2-2394-7ba0-8f9e-286378779210',
    threadId: '0199c8f2-2394-7ba0-8f9e-286378779211',
  },
  executionId = '0199c8f2-2394-7ba0-8f9e-286378779213',
  at = '2026-10-11T00:00:00.000Z';
const failed = parseAskLiveRun({
  basis: 'structured-price-v1',
  id: identity.runId,
  threadId: identity.threadId,
  principalId: null,
  question: 'Calculate.',
  locale: 'en',
  placeId: null,
  createdAt: at,
  updatedAt: at,
  state: 'failed',
  originalInputs: { priceMinorUnits: 100, currency: 'BRL', areaSquareMeters: 2 },
  decision: { source: 'fixed-structured-v1', intent: 'price_per_square_meter', decidedAt: at },
  result: null,
  terminal: { state: 'failed', reason: 'execution_unavailable', at },
  steps: [
    { sequence: 1, phase: 'calculating', at },
    { sequence: 2, phase: 'failed', at },
  ],
});
const signal = () => new AbortController().signal;
describe('isolated test-only dispatch replay double', () => {
  it('emulates bounded busy then terminal replay without leaking captured/returned mutations', async () => {
    const seed = structuredClone(failed),
      fake = new InMemoryRunDispatch(
        [
          parseAskClaim({ disposition: 'busy', identity, retryAfterMs: 30 }),
          parseAskClaim({ disposition: 'terminal', identity, run: seed }),
        ],
        seed,
      );
    expect((await fake.claim(identity, signal(), Date.now() + 1000)).disposition).toBe('busy');
    const terminal = await fake.claim(identity, signal(), Date.now() + 1000);
    if (terminal.disposition !== 'terminal') throw new Error('Missing terminal.');
    Object.assign(terminal.run, { question: 'changed' });
    Object.assign(seed, { question: 'seed changed' });
    const replay = await fake.claim(identity, signal(), Date.now() + 1000);
    if (replay.disposition !== 'terminal') throw new Error('Missing terminal.');
    expect(replay.run.question).toBe('Calculate.');
    const request = {
      ...identity,
      executionId,
      evidence: null,
      failure: 'execution_unavailable' as const,
    };
    expect(await fake.complete(request, signal(), Date.now() + 1000)).toEqual(failed);
    Object.assign(fake.completions[0]!, { executionId: identity.runId });
    expect(fake.completions[0]!.executionId).toBe(executionId);
    Object.assign(fake.requests[0]!, { runId: identity.threadId });
    expect(fake.requests[0]!.runId).toBe(identity.runId);
  });
  it('emulates dependency failure, cancellation, deadline and foreign receipt correlation', async () => {
    const claims = [parseAskClaim({ disposition: 'terminal', identity, run: failed })];
    const fake = new InMemoryRunDispatch(claims, failed),
      stop = new AbortController();
    stop.abort();
    await expect(fake.claim(identity, stop.signal, Date.now() + 1000)).rejects.toMatchObject({
      kind: 'cancelled',
    });
    await expect(fake.claim(identity, signal(), Date.now() - 1)).rejects.toMatchObject({
      kind: 'transient',
    });
    await expect(
      fake.claim({ ...identity, eventId: identity.runId }, signal(), Date.now() + 1000),
    ).rejects.toMatchObject({ kind: 'rejected' });
    await expect(
      new InMemoryRunDispatch(claims, failed, 'transient').claim(
        identity,
        signal(),
        Date.now() + 1000,
      ),
    ).rejects.toMatchObject({ kind: 'transient' });
  });
});
