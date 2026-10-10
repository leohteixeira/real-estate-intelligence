import { SyntheticListingSource, SyntheticSaoPauloListingSource } from '@rei/infrastructure';
import { describe, expect, it } from 'vitest';

import { FixtureListingSourceRouter } from './fixture-listing-source-router';

describe('FixtureListingSourceRouter', () => {
  const router = new FixtureListingSourceRouter(
    new SyntheticListingSource(),
    new SyntheticSaoPauloListingSource(),
  );

  it.each([
    ['synthetic-data', 'SYN-SP-0001'],
    ['synthetic-portal-aurora', 'AUR-BV-001'],
    ['synthetic-portal-brisa', 'BRI-BV-001'],
    ['synthetic-portal-cobalto', 'COB-BV-001'],
  ])('fetches and parses the owned %s fixture', async (sourceId, expectedListingId) => {
    const signal = new AbortController().signal;
    const page = await router.fetchPage(sourceId, null, signal);
    const document = page.documents[0];

    expect(document).toBeDefined();
    expect(document).toMatchObject({ sourceId, sourceListingId: expectedListingId });
    await expect(router.parse(document!, signal)).resolves.toMatchObject({
      currency: 'BRL',
      location: { city: 'São Paulo', stateCode: 'SP' },
    });
  });

  it('refuses a source outside the owned fixture register', async () => {
    await expect(
      router.fetchPage('unknown-source', null, new AbortController().signal),
    ).rejects.toMatchObject({ kind: 'forbidden', operation: 'collection.source.route' });
  });
});
