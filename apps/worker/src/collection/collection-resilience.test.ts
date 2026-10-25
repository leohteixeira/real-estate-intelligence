import {
  ExternalFailure,
  ListingSourceAccessRefusal,
  type ListingSource,
  type RawListingDocument,
  type StoreRawSnapshotInput,
} from '@rei/application';
import { createSourceRegistration, type SourceRatePolicy } from '@rei/domain';
import { InMemoryRawSnapshotStore, InMemorySourceRegisterRepository } from '@rei/infrastructure';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  listingSourceResilienceSettings,
  rawSnapshotStoreResilienceSettings,
  type CollectionResilienceSettings,
} from './collection-resilience.settings';
import { ResilientListingSource } from './resilient-listing-source';
import { ResilientRawSnapshotStore } from './resilient-raw-snapshot-store';

const signal = () => new AbortController().signal;
const page = { documents: [], nextCursor: null, exhausted: true } as const;
const transient = (retryAfterMs?: number) =>
  new ExternalFailure({
    kind: 'transient',
    operation: 'collection.source.fetch-page',
    ...(retryAfterMs === undefined ? {} : { retryAfterMs }),
  });
const input: StoreRawSnapshotInput = {
  sourceId: 'synthetic-data',
  mediaType: 'application/json',
  synthetic: true,
  bytes: new Uint8Array([1, 2, 3]),
};

function register(
  rate: SourceRatePolicy = { status: 'configured', limit: 100, windowSeconds: 1 },
  images = false,
) {
  return new InMemorySourceRegisterRepository(
    ['first-source', 'second-source'].map((sourceId) =>
      createSourceRegistration({
        sourceId,
        displayLabel: 'Approved fixture port',
        category: 'listing',
        enabled: true,
        enabledAt: '2026-10-10T00:00:00Z',
        permissions: {
          collectionAllowed: true,
          imageFetchingAllowed: images,
          listingTextDisplayAllowed: false,
        },
        review: {
          outcome: 'allowed',
          reviewedAt: '2026-10-09T00:00:00Z',
          evidence: 'Fake registry only; no remote adapter.',
        },
        access: { method: 'remote-http', detail: 'Scripted in-process adapter.' },
        rate,
        licence: { status: 'licensed', label: 'Fixture', url: 'https://example.invalid/licence' },
      }),
    ),
  );
}

function settings(
  overrides: Partial<CollectionResilienceSettings> = {},
): CollectionResilienceSettings {
  return { ...listingSourceResilienceSettings, attemptTimeoutMs: 50, ...overrides };
}

function source(fetchPage = vi.fn(async () => page)): ListingSource {
  return { fetchPage, parse: vi.fn(async () => ({}) as never) };
}

async function failureKind(promise: Promise<unknown>) {
  try {
    await promise;
    return 'success';
  } catch (error) {
    return error instanceof ExternalFailure ? error.kind : 'unknown';
  }
}

describe('collection dependency resilience', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('uses named source/store defaults without manufacturing a fixture rate', async () => {
    expect(listingSourceResilienceSettings).toMatchObject({
      retry: { attempts: 5, baseDelayMs: 1_000, maxDelayMs: 300_000 },
      bulkhead: { maxConcurrent: 1, maxQueue: 4 },
      attemptTimeoutMs: 30_000,
    });
    expect(rawSnapshotStoreResilienceSettings).toMatchObject({
      retry: { baseDelayMs: 100, maxDelayMs: 30_000 },
      bulkhead: { maxConcurrent: 4, maxQueue: 8 },
      attemptTimeoutMs: 5_000,
    });
    const fixtureRegister = new InMemorySourceRegisterRepository([
      createSourceRegistration({
        sourceId: 'synthetic-data',
        displayLabel: 'Fixture',
        category: 'synthetic-listing',
        enabled: true,
        enabledAt: '2026-10-10T00:00:00Z',
        permissions: {
          collectionAllowed: true,
          imageFetchingAllowed: true,
          listingTextDisplayAllowed: true,
        },
        review: { outcome: 'not-required', reviewedAt: null, evidence: 'Fixture' },
        access: { method: 'repository-fixture', detail: 'Fixture' },
        rate: { status: 'not-applicable', limit: null, windowSeconds: null },
        licence: { status: 'not-applicable', label: 'Synthetic', url: null },
      }),
    ]);
    const adapter = source();
    const wrapped = new ResilientListingSource(adapter, fixtureRegister);
    await wrapped.fetchPage('synthetic-data', null, signal());
    expect(adapter.fetchPage).toHaveBeenCalledOnce();
    expect((await fixtureRegister.findById('synthetic-data'))?.rate.status).toBe('not-applicable');
  });

  it('honors canonical Retry-After and registry rate on timestamped attempts', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const at: number[] = [];
    const adapter = source(
      vi.fn(async () => {
        at.push(Date.now());
        if (at.length === 1) throw transient(300);
        return page;
      }),
    );
    const wrapped = new ResilientListingSource(
      adapter,
      register({ status: 'configured', limit: 1, windowSeconds: 1 }),
      settings(),
    );
    const result = wrapped.fetchPage('first-source', null, signal(), 2_000);
    await vi.advanceTimersByTimeAsync(999);
    expect(at).toEqual([0]);
    await vi.advanceTimersByTimeAsync(1);
    await result;
    expect(at).toEqual([0, 1_000]);
    expect(wrapped.policiesFor('first-source')?.retryBudget.state.retries).toBe(1);
  });

  it.each(['deadline', 'budget', 'attempts'] as const)(
    'retains Retry-After across calls when %s denies another retry',
    async (denial) => {
      vi.useFakeTimers();
      vi.setSystemTime(0);
      const at: number[] = [];
      const adapter = source(
        vi.fn(async () => {
          at.push(Date.now());
          if (at.length === 1) throw transient(200);
          return page;
        }),
      );
      const wrapped = new ResilientListingSource(
        adapter,
        register(),
        settings({
          retry: {
            ...listingSourceResilienceSettings.retry,
            attempts: denial === 'attempts' ? 1 : 5,
            lowTrafficRetryReserve: denial === 'budget' ? 0 : 1,
          },
        }),
      );
      await expect(
        wrapped.fetchPage('first-source', null, signal(), denial === 'deadline' ? 100 : 1_000),
      ).rejects.toMatchObject({ kind: 'exhausted', retryAfterMs: 200 });
      await vi.advanceTimersByTimeAsync(1);
      const next = wrapped.fetchPage('first-source', null, signal(), 1_000);
      await vi.advanceTimersByTimeAsync(198);
      expect(at).toEqual([0]);
      await vi.advanceTimersByTimeAsync(1);
      await next;
      expect(at).toEqual([0, 200]);
    },
  );

  it.each(['deadline', 'caller-abort', 'hold'] as const)(
    'retains source cooldown through a queued call ending with %s and isolates other sources',
    async (ending) => {
      vi.useFakeTimers();
      vi.setSystemTime(0);
      const repository = register();
      const at: Array<[string, number]> = [];
      let rejectFirst: ((error: unknown) => void) | undefined;
      const adapter = {
        ...source(),
        fetchPage: vi.fn(async (id: string) => {
          at.push([id, Date.now()]);
          if (at.length === 1)
            return new Promise<typeof page>((_resolve, reject) => {
              rejectFirst = reject;
            });
          return page;
        }),
      };
      const wrapped = new ResilientListingSource(
        adapter,
        repository,
        settings({
          retry: { ...listingSourceResilienceSettings.retry, lowTrafficRetryReserve: 0 },
        }),
      );
      const first = failureKind(wrapped.fetchPage('first-source', null, signal()));
      await vi.advanceTimersByTimeAsync(0);
      const controller = new AbortController();
      const queued = failureKind(
        wrapped.fetchPage(
          'first-source',
          null,
          controller.signal,
          ending === 'deadline' ? 25 : 1_000,
        ),
      );
      await vi.advanceTimersByTimeAsync(0);
      rejectFirst!(transient(200));
      expect(await first).toBe('exhausted');
      await wrapped.fetchPage('second-source', null, signal());
      await vi.advanceTimersByTimeAsync(25);
      if (ending === 'caller-abort') controller.abort();
      if (ending === 'hold') {
        await repository.holdAtomically('first-source', {
          reason: 'captcha',
          heldAt: new Date().toISOString(),
        });
        await vi.advanceTimersByTimeAsync(175);
      }
      expect(await queued).toBe(
        ending === 'caller-abort' ? 'cancelled' : ending === 'hold' ? 'forbidden' : 'exhausted',
      );
      expect(at).toEqual([
        ['first-source', 0],
        ['second-source', 0],
      ]);
      if (ending !== 'hold') {
        const later = wrapped.fetchPage('first-source', null, signal(), 1_000);
        await vi.advanceTimersByTimeAsync(174);
        expect(at).toHaveLength(2);
        await vi.advanceTimersByTimeAsync(1);
        await later;
        expect(at[2]).toEqual(['first-source', 200]);
      }
    },
  );

  it('preserves a rejected register rate wait as a canonical delay', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const adapter = source();
    const wrapped = new ResilientListingSource(
      adapter,
      register({ status: 'configured', limit: 1, windowSeconds: 1 }),
      settings({ rateMaxWaitMs: 0 }),
    );
    await wrapped.fetchPage('first-source', null, signal());
    await expect(wrapped.fetchPage('first-source', null, signal())).rejects.toMatchObject({
      kind: 'exhausted',
      retryAfterMs: 1_000,
    });
    await vi.advanceTimersByTimeAsync(200);
    await expect(wrapped.fetchPage('first-source', null, signal())).rejects.toMatchObject({
      kind: 'exhausted',
      retryAfterMs: 800,
    });
    expect(adapter.fetchPage).toHaveBeenCalledOnce();
  });

  it('performs no registry lookup when its whole-call deadline has already expired', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(100);
    const repository = register();
    const find = vi.spyOn(repository, 'findById');
    const adapter = source();
    const wrapped = new ResilientListingSource(adapter, repository, settings());
    await expect(wrapped.fetchPage('first-source', null, signal(), 100)).rejects.toMatchObject({
      kind: 'exhausted',
    });
    expect(find).not.toHaveBeenCalled();
    expect(adapter.fetchPage).not.toHaveBeenCalled();
  });

  it('preserves remaining cooldown on a later deadline failure', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const adapter = source(
      vi.fn(async () => {
        throw transient(200);
      }),
    );
    const wrapped = new ResilientListingSource(adapter, register(), settings());
    await expect(wrapped.fetchPage('first-source', null, signal(), 100)).rejects.toMatchObject({
      retryAfterMs: 200,
    });
    const short = wrapped.fetchPage('first-source', null, signal(), 25);
    const assertion = expect(short).rejects.toMatchObject({ kind: 'exhausted', retryAfterMs: 175 });
    await vi.advanceTimersByTimeAsync(25);
    await assertion;
    expect(adapter.fetchPage).toHaveBeenCalledOnce();
  });

  it.each(['deadline', 'caller-abort'] as const)(
    'bounds the initial registry lookup by %s even if persistence ignores cancellation',
    async (ending) => {
      vi.useFakeTimers();
      vi.setSystemTime(0);
      const repository = register();
      const find = repository.findById.bind(repository);
      const signals: AbortSignal[] = [];
      vi.spyOn(repository, 'findById').mockImplementation(async (id, scoped) => {
        signals.push(scoped!);
        await new Promise((resolve) => setTimeout(resolve, 150));
        return find(id);
      });
      const adapter = source();
      const wrapped = new ResilientListingSource(adapter, repository, settings());
      const controller = new AbortController();
      const result = failureKind(wrapped.fetchPage('first-source', null, controller.signal, 25));
      await vi.advanceTimersByTimeAsync(ending === 'deadline' ? 25 : 10);
      if (ending === 'caller-abort') controller.abort();
      expect(await result).toBe(ending === 'deadline' ? 'exhausted' : 'cancelled');
      expect(Date.now()).toBe(ending === 'deadline' ? 25 : 10);
      expect(signals[0]?.aborted).toBe(true);
      await vi.advanceTimersByTimeAsync(200);
      expect(adapter.fetchPage).not.toHaveBeenCalled();
    },
  );

  it('includes pending hold repair in the deadline and retains the refusal on cancellation', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const repository = register();
    const persist = repository.holdAtomically.bind(repository);
    vi.spyOn(repository, 'holdAtomically').mockRejectedValueOnce(new Error('Unavailable'));
    const adapter = source(
      vi.fn(async () => {
        throw new ListingSourceAccessRefusal('block');
      }),
    );
    const wrapped = new ResilientListingSource(adapter, repository, settings());
    expect(await failureKind(wrapped.fetchPage('first-source', null, signal()))).toBe('exhausted');
    const delayed = vi
      .spyOn(repository, 'holdAtomically')
      .mockImplementationOnce(async (id, hold, scoped) => {
        await new Promise((resolve) => setTimeout(resolve, 150));
        scoped?.throwIfAborted();
        return persist(id, hold, scoped);
      });
    const repair = failureKind(wrapped.fetchPage('first-source', null, signal(), 25));
    await vi.advanceTimersByTimeAsync(25);
    expect(await repair).toBe('exhausted');
    expect(delayed.mock.calls[1]?.[2]?.aborted).toBe(true);
    await vi.advanceTimersByTimeAsync(150);
    await expect(wrapped.fetchPage('first-source', null, signal())).rejects.toMatchObject({
      reason: 'block',
    });
    expect(adapter.fetchPage).toHaveBeenCalledOnce();
    expect(await repository.findById('first-source')).toMatchObject({
      enabled: false,
      hold: { reason: 'block' },
    });
  });

  it('uses factor-two full jitter, cap, and at most five attempts within the rolling budget', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const at: number[] = [];
    const wrapped = new ResilientListingSource(
      source(
        vi.fn(async () => {
          at.push(Date.now());
          if (at.length < 5) throw transient();
          return page;
        }),
      ),
      register(),
      settings({
        retry: {
          ...listingSourceResilienceSettings.retry,
          baseDelayMs: 100,
          maxDelayMs: 250,
          lowTrafficRetryReserve: 4,
        },
      }),
      Date.now,
      () => 1,
    );
    const result = wrapped.fetchPage('first-source', null, signal(), 5_000);
    await vi.advanceTimersByTimeAsync(800);
    await result;
    expect(at).toEqual([0, 100, 300, 550, 800]);
  });

  it('exhausts a low-traffic retry budget then replenishes after its rolling window', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const adapter = source(
      vi.fn(async () => {
        throw transient();
      }),
    );
    const wrapped = new ResilientListingSource(adapter, register(), settings(), Date.now, () => 0);
    const first = failureKind(wrapped.fetchPage('first-source', null, signal()));
    await vi.advanceTimersByTimeAsync(1);
    expect(await first).toBe('exhausted');
    expect(adapter.fetchPage).toHaveBeenCalledTimes(2);
    const second = failureKind(wrapped.fetchPage('first-source', null, signal()));
    await vi.advanceTimersByTimeAsync(1);
    expect(await second).toBe('exhausted');
    expect(adapter.fetchPage).toHaveBeenCalledTimes(3);
    await vi.advanceTimersByTimeAsync(60_000);
    const third = failureKind(wrapped.fetchPage('first-source', null, signal()));
    await vi.advanceTimersByTimeAsync(1);
    expect(await third).toBe('exhausted');
    expect(adapter.fetchPage).toHaveBeenCalledTimes(5);
  });

  it.each(['login-wall', 'captcha', 'block', 'access-denied'] as const)(
    'trips immediately and persists %s across wrapper recreation and ordinary enable',
    async (reason) => {
      const repository = register();
      const adapter = source(
        vi.fn(async () => {
          throw new ListingSourceAccessRefusal(reason);
        }),
      );
      const wrapped = new ResilientListingSource(adapter, repository);
      await expect(wrapped.fetchPage('first-source', null, signal())).rejects.toMatchObject({
        reason,
        kind: 'forbidden',
      });
      expect(wrapped.policiesFor('first-source')?.breaker.policy.state).toBe('open');
      expect(await repository.findById('first-source')).toMatchObject({
        enabled: false,
        hold: { reason },
      });
      expect(
        await repository.enableAtomically('first-source', new Date().toISOString()),
      ).toBeNull();
      await expect(
        new ResilientListingSource(adapter, repository).fetchPage('first-source', null, signal()),
      ).rejects.toMatchObject({ reason });
      expect(adapter.fetchPage).toHaveBeenCalledOnce();
    },
  );

  it('remembers a refusal while hold persistence fails, even after the breaker reopen interval', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const repository = register();
    const persist = vi
      .spyOn(repository, 'holdAtomically')
      .mockRejectedValueOnce(new Error('Unavailable fixture persistence.'))
      .mockResolvedValueOnce(null);
    const adapter = source(
      vi.fn(async () => {
        throw new ListingSourceAccessRefusal('captcha');
      }),
    );
    const wrapped = new ResilientListingSource(adapter, repository);
    expect(await failureKind(wrapped.fetchPage('first-source', null, signal()))).toBe('exhausted');
    await vi.advanceTimersByTimeAsync(31_000);
    expect(await failureKind(wrapped.fetchPage('first-source', null, signal()))).toBe('exhausted');
    await expect(wrapped.fetchPage('first-source', null, signal())).rejects.toMatchObject({
      reason: 'captcha',
    });
    expect(persist).toHaveBeenCalledTimes(3);
    expect(adapter.fetchPage).toHaveBeenCalledOnce();
    expect(await repository.findById('first-source')).toMatchObject({
      enabled: false,
      hold: { reason: 'captcha', heldAt: new Date(0).toISOString() },
    });
  });

  it('permits a later fetch only after explicit hold review and enablement', async () => {
    const repository = register();
    const adapter = source();
    await repository.holdAtomically('first-source', {
      reason: 'block',
      heldAt: '2026-10-10T00:00:00Z',
    });
    await repository.clearHoldAfterReview('first-source', '2026-10-10T00:00:01Z');
    expect((await repository.findById('first-source'))?.enabled).toBe(false);
    await repository.enableAtomically('first-source', '2026-10-10T00:00:02Z');
    await new ResilientListingSource(adapter, repository).fetchPage('first-source', null, signal());
    expect(adapter.fetchPage).toHaveBeenCalledOnce();
  });

  it.each(['rejected', 'unauthorized', 'forbidden', 'cancelled', 'exhausted'] as const)(
    'does not retry canonical %s failures',
    async (kind) => {
      const adapter = source(
        vi.fn(async () => {
          throw new ExternalFailure({ kind, operation: 'acquire' });
        }),
      );
      await expect(
        new ResilientListingSource(adapter, register()).fetchPage('first-source', null, signal()),
      ).rejects.toMatchObject({ kind });
      expect(adapter.fetchPage).toHaveBeenCalledOnce();
    },
  );

  it('never retries local parsing or wraps it in an acquisition policy', async () => {
    const adapter = source();
    vi.mocked(adapter.parse).mockRejectedValue(
      new ExternalFailure({ kind: 'rejected', operation: 'parse' }),
    );
    const wrapped = new ResilientListingSource(adapter, register());
    await expect(wrapped.parse({} as RawListingDocument, signal())).rejects.toMatchObject({
      kind: 'rejected',
    });
    expect(adapter.parse).toHaveBeenCalledOnce();
    expect(adapter.fetchPage).not.toHaveBeenCalled();
    const controller = new AbortController();
    controller.abort();
    expect(() => wrapped.parse({} as RawListingDocument, controller.signal)).toThrow();
  });

  it('bounds attempts and never retries past the remaining deadline', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const adapter = source(
      vi.fn(async () => {
        throw transient(100);
      }),
    );
    const wrapped = new ResilientListingSource(adapter, register(), settings());
    expect(await failureKind(wrapped.fetchPage('first-source', null, signal(), 149))).toBe(
      'exhausted',
    );
    expect(adapter.fetchPage).toHaveBeenCalledOnce();
    expect(await failureKind(wrapped.fetchPage('first-source', null, signal(), 0))).toBe(
      'exhausted',
    );
    expect(adapter.fetchPage).toHaveBeenCalledOnce();
  });

  it('includes a rate wait in the deadline and observes a durable hold after that wait', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const repository = register({ status: 'configured', limit: 1, windowSeconds: 1 });
    const adapter = source();
    const wrapped = new ResilientListingSource(adapter, repository, settings());
    await wrapped.fetchPage('first-source', null, signal());
    const timed = failureKind(wrapped.fetchPage('first-source', null, signal(), 300));
    await vi.advanceTimersByTimeAsync(300);
    expect(await timed).toBe('exhausted');
    expect(adapter.fetchPage).toHaveBeenCalledOnce();
    const held = failureKind(wrapped.fetchPage('first-source', null, signal(), 2_000));
    await vi.advanceTimersByTimeAsync(0);
    await repository.holdAtomically('first-source', {
      reason: 'block',
      heldAt: '2026-10-10T00:00:00Z',
    });
    await vi.advanceTimersByTimeAsync(1_000);
    expect(await held).toBe('forbidden');
    expect(adapter.fetchPage).toHaveBeenCalledOnce();
  });

  it.each(['backoff', 'rate', 'attempt', 'queue'] as const)(
    'cancels a %s wait without later adapter calls',
    async (waiting) => {
      vi.useFakeTimers();
      vi.setSystemTime(0);
      const controller = new AbortController();
      const adapter = source(
        vi.fn(async () => {
          if (waiting === 'backoff') throw transient(1_000);
          if (waiting === 'attempt' || waiting === 'queue')
            return new Promise<typeof page>(() => undefined);
          return page;
        }),
      );
      const wrapped = new ResilientListingSource(
        adapter,
        register({ status: 'configured', limit: 1, windowSeconds: 1 }),
        settings({ attemptTimeoutMs: 5_000 }),
      );
      let first: Promise<string> | undefined;
      if (waiting === 'rate') await wrapped.fetchPage('first-source', null, signal());
      if (waiting === 'queue') {
        first = failureKind(wrapped.fetchPage('first-source', null, signal(), 300));
        await vi.advanceTimersByTimeAsync(0);
      }
      const result = failureKind(wrapped.fetchPage('first-source', null, controller.signal));
      await vi.advanceTimersByTimeAsync(10);
      controller.abort();
      expect(await result).toBe('cancelled');
      const attempts = vi.mocked(adapter.fetchPage).mock.calls.length;
      await vi.advanceTimersByTimeAsync(5_000);
      if (first) await first;
      expect(adapter.fetchPage).toHaveBeenCalledTimes(attempts);
    },
  );

  it('isolates per-source bulkheads/breakers and storage capacity', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const adapter = source(
      vi.fn(async (sourceId) => {
        if (sourceId === 'first-source') return new Promise<typeof page>(() => undefined);
        return page;
      }),
    );
    const wrapped = new ResilientListingSource(adapter, register(), settings());
    const failed = failureKind(wrapped.fetchPage('first-source', null, signal(), 100));
    await vi.advanceTimersByTimeAsync(0);
    await expect(wrapped.fetchPage('second-source', null, signal())).resolves.toEqual(page);
    await expect(
      new ResilientRawSnapshotStore(new InMemoryRawSnapshotStore()).store(input, signal()),
    ).resolves.toMatchObject({ byteLength: 3 });
    expect(wrapped.policiesFor('first-source')).not.toBe(wrapped.policiesFor('second-source'));
    await vi.advanceTimersByTimeAsync(100);
    expect(await failed).toBe('exhausted');
  });

  it.each(['source', 'store'] as const)(
    'enforces the %s concurrency/queue ceilings and one-second queue expiry',
    async (dependency) => {
      vi.useFakeTimers();
      vi.setSystemTime(0);
      const adapter = vi.fn(async () => new Promise<never>(() => undefined));
      const sourceWrapper = new ResilientListingSource(
        source(adapter),
        register(),
        settings({ attemptTimeoutMs: 5_000 }),
      );
      const storeWrapper = new ResilientRawSnapshotStore({ store: adapter });
      const capacity = dependency === 'source' ? 1 : 4;
      const queue = dependency === 'source' ? 4 : 8;
      const results = Array.from({ length: capacity + queue + 1 }, () =>
        failureKind(
          dependency === 'source'
            ? sourceWrapper.fetchPage('first-source', null, signal(), 1_500)
            : storeWrapper.store(input, signal(), 1_500),
        ),
      );
      await vi.advanceTimersByTimeAsync(0);
      expect(adapter).toHaveBeenCalledTimes(capacity);
      expect(await results.at(-1)).toBe('exhausted');
      await vi.advanceTimersByTimeAsync(1_000);
      expect(await Promise.all(results.slice(capacity, capacity + queue))).toEqual(
        Array.from({ length: queue }, () => 'exhausted'),
      );
      await vi.advanceTimersByTimeAsync(500);
      expect(await Promise.all(results)).toEqual(
        Array.from({ length: results.length }, () => 'exhausted'),
      );
      await vi.advanceTimersByTimeAsync(10_000);
      expect(adapter).toHaveBeenCalledTimes(capacity);
    },
  );

  it('counts a fully retried failure as one breaker sample, not two attempts', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const adapter = source(
      vi.fn(async () => {
        throw transient();
      }),
    );
    const wrapped = new ResilientListingSource(
      adapter,
      register(),
      settings({
        circuitBreaker: { ...listingSourceResilienceSettings.circuitBreaker, minimumCalls: 2 },
      }),
      Date.now,
      () => 0,
    );
    const first = failureKind(wrapped.fetchPage('first-source', null, signal()));
    await vi.advanceTimersByTimeAsync(1);
    expect(await first).toBe('exhausted');
    expect(adapter.fetchPage).toHaveBeenCalledTimes(2);
    expect(wrapped.policiesFor('first-source')?.breaker.policy.state).toBe('closed');
    const second = failureKind(wrapped.fetchPage('first-source', null, signal()));
    await vi.advanceTimersByTimeAsync(1);
    expect(await second).toBe('exhausted');
    expect(adapter.fetchPage).toHaveBeenCalledTimes(3);
    expect(wrapped.policiesFor('first-source')?.breaker.policy.state).toBe('open');
  });

  it('counts logical failures and slow successes once and permits one recovery probe', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const adapter = source(
      vi.fn(async () => {
        await new Promise((resolve) => setTimeout(resolve, 20));
        return page;
      }),
    );
    const wrapped = new ResilientListingSource(
      adapter,
      register(),
      settings({
        circuitBreaker: {
          ...listingSourceResilienceSettings.circuitBreaker,
          minimumCalls: 2,
          slowCallThresholdMs: 10,
          openDurationMs: 100,
        },
      }),
    );
    for (let i = 0; i < 2; i++) {
      const result = wrapped.fetchPage('first-source', null, signal());
      await vi.advanceTimersByTimeAsync(20);
      await result;
    }
    expect(wrapped.policiesFor('first-source')?.breaker.policy.state).toBe('open');
    expect(await failureKind(wrapped.fetchPage('first-source', null, signal()))).toBe('exhausted');
    await vi.advanceTimersByTimeAsync(100);
    vi.mocked(adapter.fetchPage).mockResolvedValue(page);
    await wrapped.fetchPage('first-source', null, signal());
    expect(wrapped.policiesFor('first-source')?.breaker.policy.state).toBe('closed');
  });

  it('keeps identical content through storage retries and never disables the source', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const canonical = new InMemoryRawSnapshotStore();
    const bytes: number[][] = [];
    const adapter = {
      store: vi.fn(async (value: StoreRawSnapshotInput, attempt: AbortSignal) => {
        bytes.push([...value.bytes]);
        if (bytes.length === 1) throw transient();
        return canonical.store(value, attempt);
      }),
    };
    const wrapped = new ResilientRawSnapshotStore(
      adapter,
      { ...rawSnapshotStoreResilienceSettings, attemptTimeoutMs: 50 },
      Date.now,
      () => 1,
    );
    const result = wrapped.store({ ...input, bytes: Uint8Array.from(input.bytes) }, signal());
    await vi.advanceTimersByTimeAsync(100);
    await result;
    expect(bytes).toEqual([
      [1, 2, 3],
      [1, 2, 3],
    ]);
    expect(canonical.size).toBe(1);
  });

  it('maps unknown and timeout storage failures without successful fallback', async () => {
    const wrapped = new ResilientRawSnapshotStore({
      store: async () => {
        throw new Error('secret URL object key');
      },
    });
    const result = await failureKind(wrapped.store(input, signal()));
    expect(result).toBe('exhausted');
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const timed = new ResilientRawSnapshotStore(
      { store: async () => new Promise(() => undefined) },
      { ...rawSnapshotStoreResilienceSettings, attemptTimeoutMs: 20 },
      Date.now,
      () => 0,
    );
    const timeout = failureKind(timed.store(input, signal(), 100));
    await vi.advanceTimersByTimeAsync(100);
    expect(await timeout).toBe('exhausted');
  });
});

describe('shared page and photograph admission', () => {
  afterEach(() => vi.useRealTimers());
  it('charges photo attempts to the same per-source page limiter', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const fingerprintPhoto = vi.fn(async () => 'dhash64-v1:0000000000000000');
    const wrapped = new ResilientListingSource(
      { ...source(), fingerprintPhoto },
      register({ status: 'configured', limit: 1, windowSeconds: 1 }, true),
    );
    await wrapped.fetchPage('first-source', null, signal());
    const policies = wrapped.policiesFor('first-source');
    const photo = wrapped.fingerprintPhoto(
      'first-source',
      'https://fixture.invalid/photo',
      signal(),
    );
    await vi.advanceTimersByTimeAsync(999);
    expect(fingerprintPhoto).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(await photo).toBe('dhash64-v1:0000000000000000');
    expect(wrapped.policiesFor('first-source')).toBe(policies);
  });
  it('rechecks independent photo permission after a rate wait and preserves holds', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const registerPort = register({ status: 'configured', limit: 1, windowSeconds: 1 }, true);
    const find = registerPort.findById.bind(registerPort);
    let denied = false;
    vi.spyOn(registerPort, 'findById').mockImplementation(async (id) => {
      const current = await find(id);
      return current && denied
        ? { ...current, permissions: { ...current.permissions, imageFetchingAllowed: false } }
        : current;
    });
    const fingerprintPhoto = vi.fn(async () => 'dhash64-v1:0000000000000000');
    const wrapped = new ResilientListingSource({ ...source(), fingerprintPhoto }, registerPort);
    await wrapped.fetchPage('first-source', null, signal());
    const waiting = failureKind(
      wrapped.fingerprintPhoto('first-source', 'https://fixture.invalid/photo', signal()),
    );
    await vi.advanceTimersByTimeAsync(10);
    denied = true;
    await vi.advanceTimersByTimeAsync(990);
    expect(await waiting).toBe('forbidden');
    expect(fingerprintPhoto).not.toHaveBeenCalled();
    denied = false;
    fingerprintPhoto.mockImplementation(async () => {
      throw new ListingSourceAccessRefusal('block');
    });
    const refused = failureKind(
      wrapped.fingerprintPhoto('first-source', 'https://fixture.invalid/photo', signal()),
    );
    await vi.advanceTimersByTimeAsync(1000);
    expect(await refused).toBe('forbidden');
    expect((await find('first-source'))?.hold?.reason).toBe('block');
    expect(await failureKind(wrapped.fetchPage('first-source', null, signal()))).toBe('forbidden');
  });
});
