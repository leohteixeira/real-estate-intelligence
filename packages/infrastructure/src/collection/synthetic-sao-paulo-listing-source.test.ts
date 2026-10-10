import { describe, expect, it } from 'vitest';

import { SyntheticSaoPauloListingSource } from './synthetic-sao-paulo-listing-source.js';

describe('SyntheticSaoPauloListingSource', () => {
  it('pages the latest Aurora cycle in stable identity order and terminates on its third page', async () => {
    const source = new SyntheticSaoPauloListingSource();
    const signal = new AbortController().signal;
    const identities: string[] = [];
    let cursor: string | null = null;
    for (;;) {
      const page = await source.fetchPage('synthetic-portal-aurora', cursor, signal);
      identities.push(...page.documents.map(({ sourceListingId }) => sourceListingId));
      cursor = page.nextCursor;
      if (page.exhausted) break;
    }

    expect(identities).toEqual(['AUR-BV-001', 'AUR-PN-001', 'AUR-SN-001']);
    expect(cursor).toBe('fixture:2026-10:3');
  });

  it('returns immutable page structures with independently owned exact bytes', async () => {
    const source = new SyntheticSaoPauloListingSource();
    const signal = new AbortController().signal;
    const first = await source.fetchPage('synthetic-portal-brisa', null, signal);
    const again = await source.fetchPage('synthetic-portal-brisa', null, signal);

    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.documents)).toBe(true);
    expect(Object.isFrozen(first.documents[0])).toBe(true);
    expect(first.documents[0]?.bytes).toEqual(again.documents[0]?.bytes);
    expect(first.documents[0]?.bytes).not.toBe(again.documents[0]?.bytes);
    await expect(source.parse(first.documents[0]!, signal)).resolves.toMatchObject({
      currency: 'BRL',
    });
  });

  it('supports an explicit empty terminal fetch at the end cursor', async () => {
    const page = await new SyntheticSaoPauloListingSource().fetchPage(
      'synthetic-portal-cobalto',
      'fixture:2026-10:3',
      new AbortController().signal,
    );
    expect(page).toEqual({
      documents: [],
      nextCursor: 'fixture:2026-10:3',
      exhausted: true,
    });
  });

  it.each([
    ['synthetic-data', null],
    ['unowned-synthetic', null],
    ['synthetic-portal-aurora', 'offset:1'],
    ['synthetic-portal-aurora', 'fixture:2026-10:99'],
  ])('rejects invalid source/cursor input %s %s', async (sourceId, cursor) => {
    await expect(
      new SyntheticSaoPauloListingSource().fetchPage(
        sourceId,
        cursor,
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({ operation: 'collection.source.fetch-page' });
  });

  it('bounds the fixture delay and maps cancellation to the closed adapter failure', async () => {
    expect(() => new SyntheticSaoPauloListingSource(-1)).toThrow(RangeError);
    expect(() => new SyntheticSaoPauloListingSource(30_001)).toThrow(RangeError);
    const controller = new AbortController();
    const pending = new SyntheticSaoPauloListingSource(1_000).fetchPage(
      'synthetic-portal-aurora',
      null,
      controller.signal,
    );
    controller.abort();
    await expect(pending).rejects.toMatchObject({
      kind: 'cancelled',
      operation: 'collection.source.fetch-page',
    });
  });
});
