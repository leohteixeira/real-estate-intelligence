import { describe, expect, it, vi } from 'vitest';

import type { DatabaseConnection } from '../shared/persistence/database-connection.js';
import { PostgresTransactionRunner } from '../shared/persistence/postgres-transaction.js';
import { PostgresSourceRegisterRepository } from './postgres-source-register.repository.js';

function row(overrides: Record<string, unknown> = {}) {
  return {
    hold_reason: null,
    held_at: null,
    source_id: 'approved-source',
    source_label: 'Approved source',
    source_category: 'listing',
    enabled: false,
    enabled_at: null,
    collection_allowed: true,
    image_fetching_allowed: false,
    listing_text_display_allowed: true,
    permission_evidence: 'Reviewed permission.',
    reviewed_at: new Date('2026-10-09T00:00:00Z'),
    review_outcome: 'allowed',
    access_method: 'remote-http',
    access_policy: 'Reviewed endpoint.',
    rate_status: 'configured',
    rate_limit: 5,
    rate_window_seconds: 60,
    licence_status: 'licensed',
    licence_label: 'Open licence',
    licence_url: 'https://example.invalid/licence',
    ...overrides,
  };
}

describe('PostgresSourceRegisterRepository', () => {
  const hold = { reason: 'captcha', heldAt: '2026-10-10T12:00:00.000Z' } as const;

  it.each(['holdAtomically', 'clearHoldAfterReview'] as const)(
    'persists %s through abortable and ordinary queries, preserving the first hold',
    async (method) => {
      const heldRow = row({ hold_reason: 'captcha', held_at: new Date(hold.heldAt) });
      const query = vi.fn(async () => [method === 'holdAtomically' ? heldRow : row()]);
      const repository = new PostgresSourceRegisterRepository({
        query,
        queryAbortable: query,
      } as unknown as DatabaseConnection);
      for (const signal of [undefined, new AbortController().signal]) {
        const result =
          method === 'holdAtomically'
            ? await repository.holdAtomically('approved-source', hold, signal)
            : await repository.clearHoldAfterReview('approved-source', hold.heldAt, signal);
        expect(result?.hold).toEqual(method === 'holdAtomically' ? hold : null);
      }
      const sql = String(query.mock.calls[0]?.[0]);
      expect(sql).toContain(
        method === 'holdAtomically' ? 'COALESCE(hold_reason, $2)' : 'held_at <= $2',
      );
      expect(sql).not.toContain('enabled = true');
    },
  );

  it.each(['holdAtomically', 'clearHoldAfterReview'] as const)(
    'handles missing rows, sanitizes failures, and preserves cancellation in %s',
    async (method) => {
      const query = vi.fn(async () => [] as unknown[]);
      const repository = new PostgresSourceRegisterRepository({
        query,
        queryAbortable: query,
      } as unknown as DatabaseConnection);
      const call = (signal?: AbortSignal) =>
        method === 'holdAtomically'
          ? repository.holdAtomically('missing', hold, signal)
          : repository.clearHoldAfterReview('missing', hold.heldAt, signal);
      await expect(call()).resolves.toBeNull();
      await expect(call(new AbortController().signal)).resolves.toBeNull();
      query.mockRejectedValue(new Error('postgres://secret@private'));
      await expect(call()).rejects.toThrow('Source register persistence failed.');
      await expect(call(new AbortController().signal)).rejects.toThrow(
        'Source register persistence failed.',
      );
      const controller = new AbortController();
      const reason = new Error('cancel');
      controller.abort(reason);
      await expect(call(controller.signal)).rejects.toBe(reason);
    },
  );

  it.each([
    { fixture: row({ enabled: true, enabled_at: new Date() }), outcome: 'success' },
    {
      fixture: row({ hold_reason: 'captcha', held_at: new Date(hold.heldAt) }),
      outcome: 'captcha',
    },
    { fixture: row(), outcome: 'forbidden' },
    {
      fixture: row({ enabled: true, enabled_at: new Date(), collection_allowed: false }),
      outcome: 'malformed',
    },
    { fixture: null, outcome: 'forbidden' },
    { fixture: row({ held_at: new Date() }), outcome: 'malformed' },
  ])(
    'locks the source in the page transaction and fails closed: $outcome',
    async ({ fixture, outcome }) => {
      const query = vi.fn(async (sql: string) =>
        sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK' ? [] : fixture ? [fixture] : [],
      );
      const connection = {
        leaseClient: async () => ({ query, release: vi.fn() }),
        transactionIdentity: () => connection,
      } as unknown as DatabaseConnection;
      const repository = new PostgresSourceRegisterRepository(connection);
      const result = new PostgresTransactionRunner(connection).runInTransaction((transaction) =>
        repository.assertCollectible(transaction, 'approved-source'),
      );
      if (outcome === 'success') await expect(result).resolves.toBeUndefined();
      else if (outcome === 'captcha')
        await expect(result).rejects.toMatchObject({ reason: 'captcha' });
      else if (outcome === 'malformed')
        await expect(result).rejects.toThrow('Source register persistence failed.');
      else await expect(result).rejects.toMatchObject({ kind: 'forbidden' });
      expect(query.mock.calls[1]?.[0]).toContain('FOR SHARE');
      expect(query.mock.calls.at(-1)?.[0]).toBe(outcome === 'success' ? 'COMMIT' : 'ROLLBACK');
    },
  );

  it.each([
    { held_at: new Date() },
    { hold_reason: 'captcha' },
    { hold_reason: 'vendor-value', held_at: new Date() },
    { hold_reason: 'captcha', held_at: new Date(), enabled: true, enabled_at: new Date() },
  ])('rejects malformed hold metadata', async (overrides) => {
    const repository = new PostgresSourceRegisterRepository({
      query: vi.fn(async () => [row(overrides)]),
    } as unknown as DatabaseConnection);
    await expect(repository.findById('approved-source')).rejects.toThrow(
      'Source register persistence failed.',
    );
  });
  it('hydrates a complete source registration strictly', async () => {
    const query = vi.fn(async () => [row()]);
    const repository = new PostgresSourceRegisterRepository({
      query,
    } as unknown as DatabaseConnection);
    await expect(repository.findById('approved-source')).resolves.toMatchObject({
      sourceId: 'approved-source',
      category: 'listing',
      review: { outcome: 'allowed', reviewedAt: '2026-10-09T00:00:00.000Z' },
      rate: { status: 'configured', limit: 5, windowSeconds: 60 },
    });
  });

  it('uses one conditional update and preserves the first enablement timestamp', async () => {
    const queryAbortable = vi.fn(async () => [
      row({ enabled: true, enabled_at: new Date('2026-10-10T12:00:00Z') }),
    ]);
    const repository = new PostgresSourceRegisterRepository({
      queryAbortable,
    } as unknown as DatabaseConnection);
    const signal = new AbortController().signal;
    await expect(
      repository.enableAtomically('approved-source', '2026-10-10T13:00:00Z', signal),
    ).resolves.toMatchObject({ enabledAt: '2026-10-10T12:00:00.000Z' });
    const [statement, parameters, receivedSignal] = queryAbortable.mock.calls[0]!;
    expect(statement).toContain('UPDATE collection.source_register');
    expect(statement).toContain('enabled_at = COALESCE(enabled_at');
    expect(statement).toContain("review_outcome = 'allowed'");
    expect(statement).toContain("rate_status = 'configured'");
    expect(parameters).toEqual(['approved-source', '2026-10-10T13:00:00Z']);
    expect(receivedSignal).toBe(signal);
  });

  it('lists only enabled rows in deterministic source-ID order', async () => {
    const query = vi.fn(async (statement: string) => {
      expect(statement).toContain('WHERE enabled = true');
      expect(statement).toContain('ORDER BY source_id ASC');
      return [
        row({ source_id: 'alpha', source_label: 'Alpha', enabled: true, enabled_at: new Date() }),
        row({ source_id: 'beta', source_label: 'Beta', enabled: true, enabled_at: new Date() }),
      ];
    });
    const repository = new PostgresSourceRegisterRepository({
      query,
    } as unknown as DatabaseConnection);
    await expect(repository.listEnabled()).resolves.toEqual([
      expect.objectContaining({ sourceId: 'alpha', enabled: true }),
      expect.objectContaining({ sourceId: 'beta', enabled: true }),
    ]);
  });

  it('fails closed on malformed rows and sanitizes persistence failures', async () => {
    const malformed = new PostgresSourceRegisterRepository({
      query: vi.fn(async () => [row({ rate_limit: 0 })]),
    } as unknown as DatabaseConnection);
    await expect(malformed.findById('approved-source')).rejects.toThrow(
      'Source register persistence failed.',
    );

    const failed = new PostgresSourceRegisterRepository({
      query: vi.fn(async () => {
        throw new Error('postgres://operator:secret@db/internal');
      }),
    } as unknown as DatabaseConnection);
    const error = await failed.findById('approved-source').catch((reason: unknown) => reason);
    expect(error).toEqual(expect.any(Error));
    expect(String(error)).not.toMatch(/operator|secret|db\/internal/);
  });

  it('preserves the exact abort reason', async () => {
    const controller = new AbortController();
    const reason = new Error('cancelled by operator');
    const queryAbortable = vi.fn(async () => {
      controller.abort(reason);
      throw reason;
    });
    const repository = new PostgresSourceRegisterRepository({
      queryAbortable,
    } as unknown as DatabaseConnection);
    await expect(repository.findById('approved-source', controller.signal)).rejects.toBe(reason);
  });
});
