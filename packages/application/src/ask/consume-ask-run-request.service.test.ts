import {
  AskRunRequested,
  type AskClaim,
  type AskLiveRun,
  type StructuredExecutionEvidence,
  type StructuredExecutionInput,
} from '@rei/domain';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ExternalFailure } from '../shared/external-failure.js';
import { ConsumeAskRunRequest } from './consume-ask-run-request.service.js';
import { askAdmissionPolicy } from './ask-admission.policy.js';
const identity = {
  version: 1 as const,
  eventId: '0199c8f2-2394-7ba0-8f9e-286378779212',
  runId: '0199c8f2-2394-7ba0-8f9e-286378779210',
  threadId: '0199c8f2-2394-7ba0-8f9e-286378779211',
};
const event = new AskRunRequested(identity, '2026-10-11T00:00:00.000Z');
const input: StructuredExecutionInput = {
  ...identity,
  executionId: '0199c8f2-2394-7ba0-8f9e-286378779213',
  step: 'structured-price-v1',
  query: 'Calculate.',
  locale: 'en',
  toolGrant: 'g'.repeat(43),
  inputs: { priceMinorUnits: 100, currency: 'BRL', areaSquareMeters: 2 },
};
const evidence: StructuredExecutionEvidence = {
  ...identity,
  executionId: input.executionId,
  step: input.step,
  outcome: 'price-calculated',
  visitedNodes: ['fixedDecision', 'priceTool'],
  receipt: {
    ...identity,
    executionId: input.executionId,
    operation: 'price-per-square-meter',
    inputs: input.inputs,
    receiptId: input.executionId,
    provenance: 'market-domain-v1',
    result: {
      kind: 'price_per_square_meter',
      minorUnits: 50,
      currency: 'BRL',
      areaUnit: 'm2',
      inputs: input.inputs,
      computedAt: '2026-10-11T00:00:00.000Z',
    },
  },
};
function harness() {
  const claim = vi.fn<() => Promise<AskClaim>>().mockResolvedValue({
    disposition: 'claimed',
    identity,
    input,
    expiresAt: '2026-10-11T00:00:30.000Z',
  });
  const complete = vi.fn().mockResolvedValue({});
  const execute = vi.fn().mockResolvedValue(evidence);
  return {
    claim,
    complete,
    execute,
    service: new ConsumeAskRunRequest({ claim, complete }, { execute }),
  };
}
afterEach(() => vi.useRealTimers());
describe('Ask requested delivery orchestration', () => {
  it('accepts matching text execution and refuses substituted structured evidence', async () => {
    const h = harness();
    const textInput = { ...input, step: 'text-price-v1' as const };
    const textEvidence = {
      ...evidence,
      step: 'text-price-v1' as const,
      visitedNodes: ['validatedInputs', 'priceTool'] as const,
    };
    h.claim.mockResolvedValue({
      disposition: 'claimed',
      identity,
      input: textInput,
      expiresAt: '2026-10-11T00:00:30.000Z',
    });
    h.execute.mockResolvedValueOnce(textEvidence);
    await h.service.execute(event, new AbortController().signal, Date.now() + 60000);
    expect(h.complete.mock.calls[0]![0].evidence).toEqual(textEvidence);
    h.complete.mockClear();
    h.execute.mockResolvedValueOnce(evidence);
    await h.service.execute(event, new AbortController().signal, Date.now() + 60000);
    expect(h.complete.mock.calls[0]![0]).toMatchObject({
      evidence: null,
      failure: 'execution_unavailable',
    });
  });
  it('bounds repeated busy admission to forty seconds without starting execution', async () => {
    vi.useFakeTimers();
    const h = harness();
    h.claim.mockResolvedValue({ disposition: 'busy', identity, retryAfterMs: 30000 });
    const pending = h.service.execute(event, new AbortController().signal, Date.now() + 60000);
    const rejected = expect(pending).rejects.toThrow('Ask admission unavailable.');
    await vi.advanceTimersByTimeAsync(40000);
    await rejected;
    expect(h.claim).toHaveBeenCalledTimes(2);
    expect(h.execute).not.toHaveBeenCalled();
    expect(h.complete).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
  it('waits for the persisted terminal acknowledgement after fixed execution', async () => {
    const h = harness();
    let release!: () => void;
    h.complete.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    let acknowledged = false;
    const pending = h.service
      .execute(event, new AbortController().signal, Date.now() + 60000)
      .then(() => {
        acknowledged = true;
      });
    await vi.waitFor(() => expect(h.complete).toHaveBeenCalledOnce());
    expect(acknowledged).toBe(false);
    expect(h.complete.mock.calls[0]![0]).toEqual({
      ...identity,
      executionId: input.executionId,
      evidence,
      failure: null,
    });
    release();
    await pending;
    expect(acknowledged).toBe(true);
  });
  it('waits through a valid 30-second busy lease without burning broker retries', async () => {
    vi.useFakeTimers();
    const h = harness();
    h.claim.mockResolvedValueOnce({ disposition: 'busy', identity, retryAfterMs: 30000 });
    const pending = h.service.execute(event, new AbortController().signal, Date.now() + 60000);
    await vi.advanceTimersByTimeAsync(29999);
    expect(h.execute).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    await pending;
    expect(h.claim).toHaveBeenCalledTimes(2);
    expect(h.execute).toHaveBeenCalledOnce();
  });
  it('rechecks a released sibling at the bounded policy hint without burning a broker retry', async () => {
    vi.useFakeTimers();
    const h = harness();
    h.claim.mockResolvedValueOnce({
      disposition: 'busy',
      identity,
      retryAfterMs: askAdmissionPolicy.maximumBusyRetryAfterMs,
    });
    const pending = h.service.execute(event, new AbortController().signal, Date.now() + 60000);
    await vi.advanceTimersByTimeAsync(999);
    expect(h.execute).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    await pending;
    expect(h.claim).toHaveBeenCalledTimes(2);
    expect(h.execute).toHaveBeenCalledOnce();
    expect(h.complete).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });
  it('replays terminal inbox acknowledgement without invoking executor', async () => {
    const h = harness();
    h.claim.mockResolvedValue({ disposition: 'terminal', identity, run: {} as AskLiveRun });
    await h.service.execute(event, new AbortController().signal, Date.now() + 60000);
    expect(h.execute).not.toHaveBeenCalled();
    expect(h.complete).not.toHaveBeenCalled();
  });
  it('records definitive executor failure but not cancellation or shutdown', async () => {
    const h = harness();
    h.execute.mockRejectedValue(
      new ExternalFailure({ kind: 'rejected', operation: 'run-executor' }),
    );
    await h.service.execute(event, new AbortController().signal, Date.now() + 60000);
    expect(h.complete.mock.calls[0]![0]).toEqual({
      ...identity,
      executionId: input.executionId,
      evidence: null,
      failure: 'execution_unavailable',
    });
    h.complete.mockClear();
    h.execute.mockRejectedValue(
      new ExternalFailure({ kind: 'cancelled', operation: 'run-executor' }),
    );
    await expect(
      h.service.execute(event, new AbortController().signal, Date.now() + 60000),
    ).rejects.toThrow();
    expect(h.complete).not.toHaveBeenCalled();
  });
  it.each(['cancelled', 'exhausted'] as const)(
    'preserves %s failure before its execution deadline without completing the run',
    async (kind) => {
      vi.useFakeTimers();
      const h = harness();
      const failure = new ExternalFailure({ kind, operation: 'run-executor.execute' });
      h.execute.mockRejectedValue(failure);
      await expect(
        h.service.execute(event, new AbortController().signal, Date.now() + 60000),
      ).rejects.toBe(failure);
      expect(h.execute).toHaveBeenCalledOnce();
      expect(h.complete).not.toHaveBeenCalled();
    },
  );
  it('cancels busy admission promptly and rejects forged retained event identity', async () => {
    vi.useFakeTimers();
    const h = harness(),
      stop = new AbortController();
    h.claim.mockResolvedValue({ disposition: 'busy', identity, retryAfterMs: 30000 });
    const pending = h.service.execute(event, stop.signal, Date.now() + 60000);
    const rejected = expect(pending).rejects.toThrow('Stopped');
    await vi.advanceTimersByTimeAsync(1);
    stop.abort(new Error('Stopped'));
    await rejected;
    expect(vi.getTimerCount()).toBe(0);
    expect(h.execute).not.toHaveBeenCalled();
    await expect(
      h.service.execute(
        { ...event, aggregateId: input.executionId as typeof event.aggregateId },
        new AbortController().signal,
        Date.now() + 60000,
      ),
    ).rejects.toThrow('Invalid Ask');
  });
});
