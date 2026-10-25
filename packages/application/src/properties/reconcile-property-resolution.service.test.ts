import { describe, expect, it } from 'vitest';
import { INITIAL_RESOLUTION_CONFIGURATION } from '@rei/domain';
import { Transaction, type TransactionRunner } from '../shared/index.js';
import { InMemoryPropertyResolutionRepository } from './in-memory-property-resolution.repository.js';
import { ReconcilePropertyResolution } from './reconcile-property-resolution.service.js';
class Scope extends Transaction {
  public constructor() {
    super();
  }
}
const transactions: TransactionRunner = {
  runInTransaction: async (work, signal) => {
    signal?.throwIfAborted();
    return work(new Scope());
  },
};
describe('property resolution application transaction', () => {
  it('rescans persisted inputs and makes an unchanged restart a no-op', async () => {
    const repository = new InMemoryPropertyResolutionRepository();
    expect(
      await new ReconcilePropertyResolution(repository, transactions).execute(
        new AbortController().signal,
      ),
    ).toBe(1);
    expect(
      await new ReconcilePropertyResolution(repository, transactions).execute(
        new AbortController().signal,
      ),
    ).toBe(0);
    expect(repository.configuration).toEqual(INITIAL_RESOLUTION_CONFIGURATION);
  });
  it('propagates actual failure/cancellation for the existing cycle to recover without partial decisions', async () => {
    const repository = new InMemoryPropertyResolutionRepository();
    repository.failure = new Error('owned commit failure');
    await expect(
      new ReconcilePropertyResolution(repository, transactions).execute(
        new AbortController().signal,
      ),
    ).rejects.toThrow('owned commit failure');
    expect(repository.configuration).toBeNull();
    const controller = new AbortController();
    controller.abort(new Error('owned cancellation'));
    await expect(
      new ReconcilePropertyResolution(repository, transactions).execute(controller.signal),
    ).rejects.toThrow('owned cancellation');
    repository.failure = null;
    expect(
      await new ReconcilePropertyResolution(repository, transactions).execute(
        new AbortController().signal,
      ),
    ).toBe(1);
  });
  it('validates configuration before entering a persistence transaction', async () => {
    const repository = new InMemoryPropertyResolutionRepository();
    await expect(
      new ReconcilePropertyResolution(repository, transactions, {
        ...INITIAL_RESOLUTION_CONFIGURATION,
        id: '',
      }).execute(new AbortController().signal),
    ).rejects.toThrow();
    expect(repository.configuration).toBeNull();
  });
});
