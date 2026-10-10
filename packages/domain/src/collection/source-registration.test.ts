import { describe, expect, it } from 'vitest';

import {
  createSourceRegistration,
  decideSourceEnablement,
  OWNED_SYNTHETIC_SOURCE_IDS,
  toEnabledSourceView,
  type SourceRegistrationInput,
} from './source-registration.js';

function remote(overrides: Partial<SourceRegistrationInput> = {}) {
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
      evidence: 'Written and reviewed permission.',
    },
    access: { method: 'remote-http', detail: 'Reviewed public endpoint.' },
    rate: { status: 'configured', limit: 10, windowSeconds: 60 },
    licence: {
      status: 'licensed',
      label: 'Example licence',
      url: 'https://example.invalid/licence',
    },
    ...overrides,
  });
}

describe('source registration', () => {
  it('allows only the exact four repository-owned fixtures to use the synthetic exception', () => {
    expect(OWNED_SYNTHETIC_SOURCE_IDS).toEqual([
      'synthetic-data',
      'synthetic-portal-aurora',
      'synthetic-portal-brisa',
      'synthetic-portal-cobalto',
    ]);
    const source = createSourceRegistration({
      sourceId: 'synthetic-data',
      displayLabel: 'Labelled synthetic fixture',
      category: 'synthetic-listing',
      enabled: true,
      enabledAt: '2026-10-10T00:00:00Z',
      permissions: {
        collectionAllowed: true,
        imageFetchingAllowed: true,
        listingTextDisplayAllowed: true,
      },
      review: { outcome: 'not-required', reviewedAt: null, evidence: 'Repository fixture.' },
      access: { method: 'repository-fixture', detail: 'Checked-in deterministic data.' },
      rate: { status: 'not-applicable', limit: null, windowSeconds: null },
      licence: { status: 'not-applicable', label: 'Synthetic data', url: null },
    });

    expect(decideSourceEnablement(source)).toEqual({ eligible: true });
    expect(() =>
      createSourceRegistration({
        ...source,
        sourceId: 'synthetic-copy',
        enabled: false,
        enabledAt: null,
      }),
    ).toThrow('repository-owned synthetic fixture');
  });

  it.each([
    [
      'collection denied',
      {
        permissions: {
          collectionAllowed: false,
          imageFetchingAllowed: true,
          listingTextDisplayAllowed: true,
        },
      },
      'collection-not-allowed',
    ],
    [
      'forbidden review',
      {
        review: {
          outcome: 'forbidden' as const,
          reviewedAt: '2026-10-09T00:00:00Z',
          evidence: 'Terms forbid collection.',
        },
      },
      'review-forbidden',
    ],
    [
      'unverified review',
      {
        review: {
          outcome: 'not-verified' as const,
          reviewedAt: null,
          evidence: 'No permission found.',
        },
      },
      'review-not-verified',
    ],
    [
      'unverified licence',
      { licence: { status: 'not-verified' as const, label: null, url: null } },
      'licence-not-verified',
    ],
    [
      'manual access',
      { access: { method: 'manual-download' as const, detail: 'Human download only.' } },
      'remote-access-required',
    ],
    [
      'unknown rate',
      { rate: { status: 'unconfigured' as const, limit: null, windowSeconds: null } },
      'rate-unconfigured',
    ],
    [
      'not-applicable remote rate',
      { rate: { status: 'not-applicable' as const, limit: null, windowSeconds: null } },
      'rate-not-applicable',
    ],
  ])('refuses %s independently', (_name, overrides, code) => {
    expect(decideSourceEnablement(remote(overrides))).toEqual({ eligible: false, code });
  });

  it('accepts a fully reviewed remote source and keeps permissions independent', () => {
    const source = remote();
    expect(decideSourceEnablement(source)).toEqual({ eligible: true });
    expect(source.permissions).toEqual({
      collectionAllowed: true,
      imageFetchingAllowed: false,
      listingTextDisplayAllowed: false,
    });
  });

  it('retains an optional timestamp for an unsuccessful review attempt', () => {
    const source = remote({
      review: {
        outcome: 'not-verified',
        reviewedAt: '2026-10-09T00:00:00Z',
        evidence: 'A review was attempted, but permission could not be verified.',
      },
    });

    expect(source.review.reviewedAt).toBe('2026-10-09T00:00:00Z');
    expect(decideSourceEnablement(source)).toEqual({
      eligible: false,
      code: 'review-not-verified',
    });
  });

  it.each([
    'https://example.invalid/licence',
    'https://creativecommons.org/licenses/by-sa/4.0/',
    'http://localhost:0/path?scope=read#terms',
    'HTTPS://valid-host.example:65535/licence',
  ])('accepts a licence URL in the shared grammar: %s', (url) => {
    expect(
      remote({ licence: { status: 'licensed', label: 'Supported licence', url } }).licence,
    ).toEqual({ status: 'licensed', label: 'Supported licence', url });
  });

  it.each([
    'ftp://example.invalid/licence',
    'https://user:secret@example.invalid/licence',
    'https://%',
    'https://[',
    'https://example.invalid:99999/licence',
    'https://bad-.example/licence',
    'https://-bad.example/licence',
    'https://bad..example/licence',
    'https://127.0.0.1/licence',
    'https://127.1/licence',
    'https://2130706433/licence',
    'https://example.invalid/white space',
    'https://example.invalid/line\nbreak',
  ])('rejects a licence URL outside the shared grammar: %s', (url) => {
    expect(() =>
      remote({ licence: { status: 'licensed', label: 'Unsupported licence', url } }),
    ).toThrow('supported credential-free HTTP(S) DNS URL grammar');
  });

  it.each([
    [
      'partial configured rate',
      { rate: { status: 'configured' as const, limit: 1, windowSeconds: 0 } },
    ],
    [
      'malformed date on an unverified review',
      {
        review: {
          outcome: 'not-verified' as const,
          reviewedAt: '2026-10-09',
          evidence: 'Unknown.',
        },
      },
    ],
    [
      'undated allowed review',
      { review: { outcome: 'allowed' as const, reviewedAt: null, evidence: 'Missing date.' } },
    ],
    [
      'contradictory licence',
      { licence: { status: 'not-verified' as const, label: 'Unknown', url: null } },
    ],
    ['enabled without timestamp', { enabled: true, enabledAt: null }],
    [
      'non-boolean permission',
      {
        permissions: {
          collectionAllowed: 'yes' as unknown as boolean,
          imageFetchingAllowed: false,
          listingTextDisplayAllowed: false,
        },
      },
    ],
    ['synthetic ID with a remote identity', { sourceId: 'synthetic-data' }],
    [
      'repository access for a real source',
      { access: { method: 'repository-fixture' as const, detail: 'Not repository-owned.' } },
    ],
  ])('rejects %s', (_name, overrides) => {
    expect(() => remote(overrides)).toThrow(TypeError);
  });

  it('projects only public-safe enabled fields', () => {
    const source = remote({ enabled: true, enabledAt: '2026-10-10T00:00:00Z' });
    expect(toEnabledSourceView(source)).toEqual({
      sourceId: 'approved-source',
      displayLabel: 'Approved source',
      enabled: true,
      permissions: {
        collectionAllowed: true,
        imageFetchingAllowed: false,
        listingTextDisplayAllowed: false,
      },
      licence: {
        status: 'licensed',
        label: 'Example licence',
        url: 'https://example.invalid/licence',
      },
    });
    expect(JSON.stringify(toEnabledSourceView(source))).not.toMatch(/review|rate|access|evidence/i);
  });
});
