import { ExternalFailure } from '@rei/application';
import { describe, expect, it, vi } from 'vitest';
import { ResilientRunDispatch } from './resilient-run-dispatch';
import { readRunDispatchConfig } from './run-dispatch.config';
const identity = {
  version: 1 as const,
  eventId: '0199c8f2-2394-7ba0-8f9e-286378779212',
  runId: '0199c8f2-2394-7ba0-8f9e-286378779210',
  threadId: '0199c8f2-2394-7ba0-8f9e-286378779211',
};
describe('named Ask worker dispatch policies', () => {
  it('returns typed busy feedback without retrying a successful claim', async () => {
    const claim = vi.fn().mockResolvedValue({ disposition: 'busy', identity, retryAfterMs: 30000 }),
      complete = vi.fn();
    const dispatch = new ResilientRunDispatch({ claim, complete });
    expect(await dispatch.claim(identity, new AbortController().signal, Date.now() + 1000)).toEqual(
      { disposition: 'busy', identity, retryAfterMs: 30000 },
    );
    expect(claim).toHaveBeenCalledOnce();
  });
  it('sanitizes rejected attempts and does not call adapter after cancellation/deadline', async () => {
    const claim = vi
        .fn()
        .mockRejectedValue(
          new ExternalFailure({ kind: 'transient', operation: 'run-dispatch.claim' }),
        ),
      complete = vi.fn(),
      dispatch = new ResilientRunDispatch({ claim, complete }),
      stop = new AbortController();
    await expect(dispatch.claim(identity, stop.signal, Date.now() + 1000)).rejects.toMatchObject({
      kind: 'transient',
      operation: 'run-dispatch',
    });
    expect(claim).toHaveBeenCalledOnce();
    stop.abort();
    await expect(dispatch.claim(identity, stop.signal, Date.now() + 1000)).rejects.toMatchObject({
      kind: 'cancelled',
    });
    await expect(
      dispatch.claim(identity, new AbortController().signal, Date.now() - 1),
    ).rejects.toMatchObject({ kind: 'exhausted' });
    expect(claim).toHaveBeenCalledOnce();
  });
  it('treats empty dispatch config as disabled and validates nonempty secrets/origins', () => {
    expect(readRunDispatchConfig({})).toBeUndefined();
    expect(readRunDispatchConfig({ ASK_DISPATCH_SECRET: '' })).toBeUndefined();
    expect(() =>
      readRunDispatchConfig({ ASK_DISPATCH_SECRET: 'short', API_BASE_URL: 'http://api:8200' }),
    ).toThrow();
    expect(
      readRunDispatchConfig({
        ASK_DISPATCH_SECRET: 's'.repeat(43),
        API_BASE_URL: 'http://api:8200',
      }),
    ).toEqual({ secret: 's'.repeat(43), baseUrl: 'http://api:8200' });
  });
});
