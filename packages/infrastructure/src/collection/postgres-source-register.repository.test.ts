import { describe, expect, it, vi } from 'vitest';

import type { DatabaseConnection } from '../shared/persistence/database-connection.js';
import { PostgresSourceRegisterRepository } from './postgres-source-register.repository.js';

function row(overrides: Record<string, unknown> = {}) {
  return {
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
