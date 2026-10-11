import { describe, expect, it, vi } from 'vitest';
import { parseAskLiveRun, parseStructuredAskCreate } from '@rei/contracts';
import {
  DatabaseConnection,
  type DatabaseClient,
} from '../shared/persistence/database-connection.js';
import { PostgresTransactionRunner } from '../shared/persistence/postgres-transaction.js';
import { askDigest } from './ask-authority.js';
import { PostgresAskRunRepository } from './ask-run.pg-repository.js';

const owner = 'c'.repeat(43),
  key = 'k'.repeat(43);
const original = parseStructuredAskCreate({
  mode: 'structured-price-v1',
  threadId: '0199c8f2-2394-7ba0-8f9e-286378779211',
  placeId: null,
  query: 'Calculate.',
  locale: 'en',
  inputs: { priceMinorUnits: 100, currency: 'BRL', areaSquareMeters: 2 },
});
const run = parseAskLiveRun({
  basis: 'structured-price-v1',
  id: '0199c8f2-2394-7ba0-8f9e-286378779210',
  threadId: original.threadId,
  principalId: null,
  question: original.query,
  locale: original.locale,
  placeId: null,
  createdAt: '2026-10-11T00:00:00.000Z',
  updatedAt: '2026-10-11T00:00:00.000Z',
  state: 'queued',
  originalInputs: original.inputs,
  decision: null,
  result: null,
  terminal: null,
  steps: [],
});
const stored = {
  document: run,
  authority_digest: askDigest(owner),
  request_fingerprint: askDigest(
    JSON.stringify([
      original.mode,
      original.threadId,
      original.placeId,
      original.query,
      original.locale,
      original.inputs.priceMinorUnits,
      original.inputs.currency,
      original.inputs.areaSquareMeters,
    ]),
  ),
};

describe('retained Ask creation fence before thread preparation', () => {
  it.each([
    ['foreign null-thread replay', { ...original, threadId: null }, 'f'.repeat(43), 'forbidden'],
    ['owner null-thread changed body', { ...original, threadId: null }, owner, 'conflict'],
    ['owner changed query', { ...original, query: 'Changed.' }, owner, 'conflict'],
  ] as const)('%s makes no preparation insertion', async (_label, body, capability, kind) => {
    const connection = new DatabaseConnection('postgres://synthetic.invalid/ask');
    const query = vi
      .fn<DatabaseClient['query']>()
      .mockResolvedValueOnce([]) // BEGIN
      .mockResolvedValueOnce([]) // creation-key lock
      .mockResolvedValueOnce([{ id: run.id }])
      .mockResolvedValueOnce([stored])
      .mockResolvedValueOnce([]); // ROLLBACK
    vi.spyOn(connection, 'leaseClient').mockResolvedValue({ query, release: vi.fn() });
    const outbox = { append: vi.fn() };
    try {
      const repository = new PostgresAskRunRepository(
        connection,
        new PostgresTransactionRunner(connection),
        outbox,
      );
      await expect(repository.create(body, capability, key)).rejects.toMatchObject({ kind });
      expect(query.mock.calls.map(([sql]) => sql)).toEqual([
        'BEGIN',
        expect.stringContaining('pg_advisory_xact_lock'),
        'SELECT id::text FROM ask.run WHERE creation_key=$1',
        expect.stringContaining('JOIN ask.thread'),
        'ROLLBACK',
      ]);
      expect(outbox.append).not.toHaveBeenCalled();
    } finally {
      await connection.close();
    }
  });

  it('rechecks retained ownership and fingerprint under the second transaction fence', async () => {
    const connection = new DatabaseConnection('postgres://synthetic.invalid/ask');
    const query = vi
      .fn<DatabaseClient['query']>()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: run.id }])
      .mockResolvedValueOnce([stored])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: run.id }])
      .mockResolvedValueOnce([stored])
      .mockResolvedValueOnce([]);
    vi.spyOn(connection, 'leaseClient').mockResolvedValue({ query, release: vi.fn() });
    const outbox = { append: vi.fn() };
    try {
      const repository = new PostgresAskRunRepository(
        connection,
        new PostgresTransactionRunner(connection),
        outbox,
      );
      await expect(repository.create(original, owner, key)).resolves.toEqual(run);
      expect(
        query.mock.calls.filter(([sql]) => sql.includes('pg_advisory_xact_lock')),
      ).toHaveLength(2);
      expect(query.mock.calls.filter(([sql]) => sql.includes('JOIN ask.thread'))).toHaveLength(2);
      expect(query.mock.calls.some(([sql]) => sql.startsWith('INSERT'))).toBe(false);
      expect(outbox.append).not.toHaveBeenCalled();
    } finally {
      await connection.close();
    }
  });
});
