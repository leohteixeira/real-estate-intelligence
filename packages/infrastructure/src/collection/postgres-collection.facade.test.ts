import type { SourceRegisterRepository } from '@rei/application';
import { describe, expect, it, vi } from 'vitest';

import type { DatabaseConnection } from '../shared/persistence/database-connection.js';
import { PostgresCollectionFacade } from './postgres-collection.facade.js';

const runId = '0199c8f2-2394-7ba0-8f9e-286378779210';
const snapshotId = '0199c8f2-2394-7ba0-8f9e-286378779211';
const manifestHash = `sha256:${'1'.repeat(64)}`;
const expected = {
  sourceId: 'synthetic-data',
  sourceListingId: 'SYN-SP-0001',
  sourceUrl: 'https://synthetic.invalid/listings/SYN-SP-0001',
  runId,
  snapshotId,
  contentHash: manifestHash,
  observedAt: '2026-10-10T12:00:00.000Z',
};
const reference = {
  source_id: expected.sourceId,
  source_listing_id: expected.sourceListingId,
  source_url: expected.sourceUrl,
  run_id: runId,
  snapshot_id: snapshotId,
  content_hash: manifestHash,
  observed_at: new Date(expected.observedAt),
  synthetic: true,
  raw_hash: manifestHash,
  generation_source_id: null,
  generation_hash: null,
  collected_at: null,
  expires_at: null,
  available: null,
  deleted: null,
};

function sources(overrides: Partial<SourceRegisterRepository> = {}): SourceRegisterRepository {
  return {
    findById: vi.fn(async () => null),
    enableAtomically: vi.fn(async () => null),
    listEnabled: vi.fn(async () => []),
    ...overrides,
  };
}

describe('PostgresCollectionFacade', () => {
  it('exposes only exact committed synthetic metadata and defaults missing or foreign references to unavailable', async () => {
    const query = vi.fn(async () => [reference]);
    const facade = new PostgresCollectionFacade(
      { query } as unknown as DatabaseConnection,
      sources(),
    );
    await expect(facade.getSnapshotMetadata(expected)).resolves.toEqual({
      availability: 'available',
      collectedAt: expected.observedAt,
      expiresAt: null,
    });
    expect(query.mock.calls[0]?.[0]).toContain('collection.snapshot_observation');
    for (const [field, value] of Object.entries({
      source_id: 'foreign',
      source_listing_id: 'foreign',
      source_url: 'https://foreign.invalid',
      run_id: 'foreign',
      snapshot_id: 'foreign',
      content_hash: `sha256:${'2'.repeat(64)}`,
      observed_at: new Date('2026-10-09T12:00:00Z'),
      raw_hash: null,
      synthetic: false,
    })) {
      query.mockResolvedValue([{ ...reference, [field]: value }]);
      await expect(facade.getSnapshotMetadata(expected)).resolves.toEqual({
        availability: 'unavailable',
        collectedAt: expected.observedAt,
        expiresAt: null,
      });
    }
    query.mockResolvedValue([]);
    await expect(facade.getSnapshotMetadata(expected)).resolves.toEqual({
      availability: 'unavailable',
      collectedAt: expected.observedAt,
      expiresAt: null,
    });
    query.mockRejectedValue(new Error('Database unavailable.'));
    await expect(facade.getSnapshotMetadata(expected)).rejects.toThrow('Database unavailable.');
  });
  it('uses confirmed matching real generations and fails closed exactly at fixed expiry independently of deletion', async () => {
    const collectedAt = '2026-10-10T12:00:01.000Z',
      expiresAt = '2026-11-09T12:00:01.000Z';
    const real = {
      ...reference,
      synthetic: null,
      raw_hash: null,
      generation_source_id: expected.sourceId,
      generation_hash: expected.contentHash,
      collected_at: new Date(collectedAt),
      expires_at: new Date(expiresAt),
      available: true,
      deleted: false,
    };
    const query = vi.fn(async () => [real]);
    let now = '2026-11-09T12:00:00.999Z';
    const facade = new PostgresCollectionFacade(
      { query } as unknown as DatabaseConnection,
      sources(),
      { now: () => now },
    );
    await expect(facade.getSnapshotMetadata(expected)).resolves.toEqual({
      availability: 'available',
      collectedAt,
      expiresAt,
    });
    for (const replacement of [
      { available: false },
      { deleted: true },
      { generation_source_id: 'foreign' },
      { generation_hash: `sha256:${'2'.repeat(64)}` },
      { expires_at: new Date('2026-11-10T12:00:01Z') },
    ]) {
      query.mockResolvedValue([{ ...real, ...replacement }]);
      expect((await facade.getSnapshotMetadata(expected)).availability).toBe('unavailable');
    }
    query.mockResolvedValue([real]);
    now = 'invalid-clock';
    await expect(facade.getSnapshotMetadata(expected)).resolves.toEqual({
      availability: 'unavailable',
      collectedAt: expected.observedAt,
      expiresAt: null,
    });
    for (now of [expiresAt, '2026-11-09T12:00:01.001Z']) {
      await expect(facade.getSnapshotMetadata(expected)).resolves.toEqual({
        availability: 'expired',
        collectedAt,
        expiresAt,
      });
    }
    query.mockResolvedValue([{ ...real, available: false, deleted: true }]);
    expect((await facade.getSnapshotMetadata(expected)).availability).toBe('expired');
  });
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
              changed_count: 0,
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
      counts: { observed: 2, parsed: 1, changed: 0, suppressed: 1, failed: 0 },
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
