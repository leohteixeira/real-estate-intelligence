import type { SourceRegisterRepository } from '@rei/application';
import { describe, expect, it, vi } from 'vitest';

import type { DatabaseConnection } from '../shared/persistence/database-connection.js';
import { PostgresCollectionFacade } from './postgres-collection.facade.js';

const runId = '0199c8f2-2394-7ba0-8f9e-286378779210';
const snapshotId = '0199c8f2-2394-7ba0-8f9e-286378779211';
const manifestHash = `sha256:${'1'.repeat(64)}`;

function sources(overrides: Partial<SourceRegisterRepository> = {}): SourceRegisterRepository {
  return {
    findById: vi.fn(async () => null),
    enableAtomically: vi.fn(async () => null),
    listEnabled: vi.fn(async () => []),
    ...overrides,
  };
}

describe('PostgresCollectionFacade', () => {
  it('returns independent source permissions and denies unknown sources by default', async () => {
    const findById = vi.fn(async (sourceId: string) =>
      sourceId === 'known-source'
        ? ({
            permissions: {
              collectionAllowed: true,
              imageFetchingAllowed: false,
              listingTextDisplayAllowed: true,
            },
          } as Awaited<ReturnType<SourceRegisterRepository['findById']>>)
        : null,
    );
    const facade = new PostgresCollectionFacade({} as DatabaseConnection, sources({ findById }));

    await expect(facade.getSourcePermissions('known-source')).resolves.toEqual({
      sourceId: 'known-source',
      collectionAllowed: true,
      imageFetchingAllowed: false,
      listingTextDisplayAllowed: true,
    });
    await expect(facade.getSourcePermissions('missing-source')).resolves.toEqual({
      sourceId: 'missing-source',
      collectionAllowed: false,
      imageFetchingAllowed: false,
      listingTextDisplayAllowed: false,
    });
  });

  it('strictly maps completed runs and returns null when no run exists', async () => {
    const query = vi.fn(async (_statement: string, parameters?: readonly unknown[]) =>
      parameters?.[0] === runId
        ? [
            {
              run_id: runId,
              source_id: 'synthetic-data',
              started_at: new Date('2026-10-10T11:59:58Z'),
              completed_at: new Date('2026-10-10T12:00:00Z'),
              observed_count: 2,
              parsed_count: 1,
              suppressed_count: 1,
              failed_count: 0,
              manifest_hash: manifestHash,
              source_listing_ids: ['SYN-SP-0001', 'SYN-SP-0002'],
            },
          ]
        : [],
    );
    const facade = new PostgresCollectionFacade(
      { query } as unknown as DatabaseConnection,
      sources(),
    );

    await expect(facade.getRun(runId)).resolves.toEqual({
      runId,
      sourceId: 'synthetic-data',
      startedAt: '2026-10-10T11:59:58.000Z',
      completedAt: '2026-10-10T12:00:00.000Z',
      counts: { observed: 2, parsed: 1, suppressed: 1, failed: 0 },
      observedSourceListingIds: ['SYN-SP-0001', 'SYN-SP-0002'],
      manifestHash,
    });
    expect(query.mock.calls[0]?.[0]).toContain("run.status = 'completed'");
    await expect(facade.getRun('0199c8f2-2394-7ba0-8f9e-286378779299')).resolves.toBeNull();
  });

  it('rejects malformed run rows', async () => {
    const facade = new PostgresCollectionFacade(
      {
        query: vi.fn(async () => [
          {
            run_id: runId,
            source_id: 'synthetic-data',
            started_at: new Date(),
            completed_at: new Date(),
            observed_count: '2',
            parsed_count: 1,
            suppressed_count: 1,
            failed_count: 0,
            manifest_hash: manifestHash,
            source_listing_ids: [],
          },
        ]),
      } as unknown as DatabaseConnection,
      sources(),
    );

    await expect(facade.getRun(runId)).rejects.toThrow(
      'Collection persistence returned a malformed run.',
    );
  });

  it('strictly maps snapshot hashes and distinguishes absent and malformed rows', async () => {
    const query = vi.fn(async (_statement: string, parameters?: readonly unknown[]) => {
      if (parameters?.[0] === snapshotId) return [{ content_hash: manifestHash }];
      if (parameters?.[0] === 'malformed') return [{ content_hash: 42 }];
      return [];
    });
    const facade = new PostgresCollectionFacade(
      { query } as unknown as DatabaseConnection,
      sources(),
    );

    await expect(facade.getSnapshotHash(snapshotId)).resolves.toBe(manifestHash);
    await expect(facade.getSnapshotHash('missing')).resolves.toBeNull();
    await expect(facade.getSnapshotHash('malformed')).rejects.toThrow(
      'Collection persistence returned a malformed hash.',
    );
  });

  it('delegates enabled listing with the caller cancellation signal', async () => {
    const controller = new AbortController();
    const listEnabled = vi.fn(async () => []);
    const facade = new PostgresCollectionFacade({} as DatabaseConnection, sources({ listEnabled }));

    await expect(facade.listEnabledSources(controller.signal)).resolves.toEqual([]);
    expect(listEnabled).toHaveBeenCalledWith(controller.signal);
  });
});
