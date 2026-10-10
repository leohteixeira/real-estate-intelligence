import { describe, expect, it, vi } from 'vitest';

import { CollectionRunLimiter } from './collection-run-limiter';

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe('CollectionRunLimiter', () => {
  it('bounds global work and serializes runs for the same source', async () => {
    const limiter = new CollectionRunLimiter(2);
    const first = deferred();
    const second = deferred();
    const active: string[] = [];
    const work = (name: string, gate: ReturnType<typeof deferred>) => async () => {
      active.push(name);
      await gate.promise;
      active.splice(active.indexOf(name), 1);
      return name;
    };

    const aurora1 = limiter.run('aurora', new AbortController().signal, work('aurora-1', first));
    const aurora2 = limiter.run(
      'aurora',
      new AbortController().signal,
      vi.fn(async () => 'aurora-2'),
    );
    const brisa = limiter.run('brisa', new AbortController().signal, work('brisa', second));
    await vi.waitFor(() => expect(active).toEqual(['aurora-1', 'brisa']));

    first.resolve();
    await expect(aurora1).resolves.toBe('aurora-1');
    await expect(aurora2).resolves.toBe('aurora-2');
    second.resolve();
    await expect(brisa).resolves.toBe('brisa');
  });

  it('removes an aborted waiter without starting its work', async () => {
    const limiter = new CollectionRunLimiter(1);
    const gate = deferred();
    const running = limiter.run('aurora', new AbortController().signal, async () => gate.promise);
    const controller = new AbortController();
    const queuedWork = vi.fn(async () => undefined);
    const queued = limiter.run('brisa', controller.signal, queuedWork);

    controller.abort(new Error('delivery stopped'));
    await expect(queued).rejects.toThrow('delivery stopped');
    gate.resolve();
    await running;
    expect(queuedWork).not.toHaveBeenCalled();
  });
});
