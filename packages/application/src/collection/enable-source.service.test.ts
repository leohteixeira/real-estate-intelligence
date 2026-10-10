import {
  createSourceRegistration,
  decideSourceEnablement,
  type SourceRegistration,
} from '@rei/domain';
import { describe, expect, it, vi } from 'vitest';

import type { Clock } from '../shared/index.js';
import { EnableSource } from './enable-source.service.js';
import type { SourceRegisterRepository } from './source-register.repository.js';

function source(overrides: Partial<SourceRegistration> = {}): SourceRegistration {
  return createSourceRegistration({
    sourceId: 'approved-source',
    displayLabel: 'Approved source',
    category: 'listing',
    enabled: false,
    enabledAt: null,
    permissions: {
      collectionAllowed: true,
      imageFetchingAllowed: false,
      listingTextDisplayAllowed: false,
    },
    review: {
      outcome: 'allowed',
      reviewedAt: '2026-10-09T00:00:00Z',
      evidence: 'Reviewed permission.',
    },
    access: { method: 'remote-http', detail: 'Reviewed endpoint.' },
    rate: { status: 'configured', limit: 5, windowSeconds: 60 },
    licence: {
      status: 'licensed',
      label: 'Open licence',
      url: 'https://example.invalid/licence',
    },
    ...overrides,
  });
}

function fixture(current: SourceRegistration | null) {
  const enabled =
    current && decideSourceEnablement(current).eligible
      ? source({ ...current, enabled: true, enabledAt: '2026-10-10T12:00:00Z' })
      : null;
  const repository: SourceRegisterRepository = {
    findById: vi.fn(async () => current),
    enableAtomically: vi.fn(async () => enabled),
    listEnabled: vi.fn(async () => []),
  };
  const clock: Clock = { now: vi.fn(() => '2026-10-10T12:00:00Z') };
  return { service: new EnableSource(repository, clock), repository, clock, enabled };
}

describe('EnableSource', () => {
  it('enables an eligible source with one atomic repository transition', async () => {
    const context = fixture(source());
    const signal = new AbortController().signal;
    await expect(context.service.execute('approved-source', signal)).resolves.toEqual({
      status: 'enabled',
      source: context.enabled,
    });
    expect(context.repository.enableAtomically).toHaveBeenCalledWith(
      'approved-source',
      '2026-10-10T12:00:00Z',
      signal,
    );
  });

  it('reports an already enabled source without rewriting its timestamp', async () => {
    const current = source({ enabled: true, enabledAt: '2026-10-10T10:00:00Z' });
    const context = fixture(current);
    await expect(
      context.service.execute('approved-source', new AbortController().signal),
    ).resolves.toEqual({ status: 'already-enabled', source: current });
    expect(context.repository.enableAtomically).not.toHaveBeenCalled();
  });

  it('distinguishes unknown and each fail-closed policy refusal', async () => {
    const unknown = fixture(null);
    await expect(
      unknown.service.execute('missing-source', new AbortController().signal),
    ).resolves.toEqual({ status: 'not-found', sourceId: 'missing-source' });

    const refused = fixture(
      source({
        review: { outcome: 'not-verified', reviewedAt: null, evidence: 'No permission.' },
      }),
    );
    await expect(
      refused.service.execute('approved-source', new AbortController().signal),
    ).resolves.toEqual({
      status: 'refused',
      sourceId: 'approved-source',
      reason: 'review-not-verified',
    });
    expect(refused.repository.enableAtomically).not.toHaveBeenCalled();
  });

  it('handles a concurrent winner as idempotent success', async () => {
    const context = fixture(source());
    vi.mocked(context.repository.enableAtomically).mockResolvedValue(null);
    vi.mocked(context.repository.findById)
      .mockResolvedValueOnce(source())
      .mockResolvedValueOnce(context.enabled);
    await expect(
      context.service.execute('approved-source', new AbortController().signal),
    ).resolves.toEqual({ status: 'already-enabled', source: context.enabled });
  });

  it('rejects unsafe IDs before repository access and preserves cancellation', async () => {
    const context = fixture(source());
    await expect(
      context.service.execute('--override', new AbortController().signal),
    ).rejects.toThrow(TypeError);
    expect(context.repository.findById).not.toHaveBeenCalled();

    const controller = new AbortController();
    const reason = new Error('operator cancelled');
    controller.abort(reason);
    await expect(context.service.execute('approved-source', controller.signal)).rejects.toBe(
      reason,
    );
  });
});
