import { ExternalFailure } from '@rei/application';
import { describe, expect, it, vi } from 'vitest';

import { ResilientRawSnapshotStore } from './resilient-raw-snapshot-store';
import {
  rawSnapshotReadResilienceSettings,
  rawSnapshotDeleteResilienceSettings,
} from './collection-resilience.settings';

describe('snapshot content resilience', () => {
  it('uses independent named read and delete policies and propagates attempt cancellation', async () => {
    const adapter = {
      store: vi.fn(),
      read: vi.fn(async () => new Uint8Array([1])),
      delete: vi.fn(async () => {}),
    };
    const store = new ResilientRawSnapshotStore(adapter);
    const signal = new AbortController().signal;
    expect(await store.read('opaque-key', signal, Date.now() + 1000)).toEqual(new Uint8Array([1]));
    await store.delete('opaque-key', signal, Date.now() + 1000);
    expect(adapter.read).toHaveBeenCalledWith('opaque-key', expect.any(AbortSignal));
    expect(adapter.delete).toHaveBeenCalledWith('opaque-key', expect.any(AbortSignal));
    expect(rawSnapshotReadResilienceSettings.dependency).toBe('raw-snapshot-read');
    expect(rawSnapshotDeleteResilienceSettings.dependency).toBe('raw-snapshot-delete');
    expect(store.readPolicies).not.toBe(store.policies);
    expect(store.deletePolicies).not.toBe(store.readPolicies);
  });

  it.each(['read', 'delete'] as const)(
    'fails closed when an adapter lacks %s capability',
    async (operation) => {
      const store = new ResilientRawSnapshotStore({ store: vi.fn() });
      expect(() => store[operation]('opaque-key', new AbortController().signal)).toThrow(
        ExternalFailure,
      );
    },
  );

  it.each(['read', 'delete'] as const)(
    'does not retry a rejected %s or perform an expired attempt',
    async (operation) => {
      const adapter = { store: vi.fn(), read: vi.fn(), delete: vi.fn() };
      adapter[operation].mockRejectedValue(
        new ExternalFailure({ kind: 'rejected', operation: 'fixture' }),
      );
      const store = new ResilientRawSnapshotStore(adapter);
      await expect(
        store[operation]('opaque-key', new AbortController().signal),
      ).rejects.toMatchObject({ kind: 'rejected' });
      expect(adapter[operation]).toHaveBeenCalledOnce();
      await expect(
        store[operation]('opaque-key', new AbortController().signal, Date.now() - 1),
      ).rejects.toBeInstanceOf(ExternalFailure);
      expect(adapter[operation]).toHaveBeenCalledOnce();
    },
  );
});
