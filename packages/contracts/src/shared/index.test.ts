import { describe, expect, it } from 'vitest';

import { API_PREFIX, API_VERSION } from '../index.js';
import type {
  ErrorResponse,
  MoneyResponse,
  PaginatedResponse,
  ProvenanceResponse,
} from '../index.js';
import type { AuditTraceAcceptedResponse } from '../audit/index.js';

describe('shared contract root exports', () => {
  it('keeps the version constants available from the package root', () => {
    expect(API_VERSION).toBe('v1');
    expect(API_PREFIX).toBe('api/v1');
  });

  it('serializes the stable error envelope', () => {
    const response: ErrorResponse = {
      error: {
        code: 'not_found',
        message: 'The requested resource was not found.',
        requestId: '4b81e8a4-f6bf-48c9-9297-4d6b70097943',
      },
    };

    expect(JSON.parse(JSON.stringify(response))).toEqual(response);
  });

  it('represents BRL in safe-integer centavos', () => {
    const response: MoneyResponse = { minorUnits: 78_500_000, currency: 'BRL' };

    expect(Number.isSafeInteger(response.minorUnits)).toBe(true);
    expect(JSON.parse(JSON.stringify(response))).toEqual({
      minorUnits: 78_500_000,
      currency: 'BRL',
    });
  });

  it.each([
    { items: [], nextCursor: null, totalItems: 0 },
    {
      items: [{ id: 'listing-1' }],
      nextCursor: 'opaque:next-page',
      totalItems: 3,
    },
    {
      items: [{ id: 'listing-3' }],
      nextCursor: null,
      totalItems: 3,
    },
  ] satisfies readonly PaginatedResponse<{ readonly id: string }>[])(
    'serializes cursor page %# without offset assumptions',
    (response) => {
      expect(response.totalItems).toBeGreaterThanOrEqual(0);
      expect(JSON.parse(JSON.stringify(response))).toEqual(response);
    },
  );

  it('serializes complete provenance for a JSON-safe value', () => {
    const auditResponse: AuditTraceAcceptedResponse = {
      eventId: '0199c8f2-2394-7ba0-8f9e-286378779219',
    };
    const response: ProvenanceResponse<AuditTraceAcceptedResponse> = {
      value: auditResponse,
      source: 'synthetic-listings',
      sourceUrl: 'https://example.test/listings/42',
      collectedAt: '2026-10-10T12:30:00.000Z',
    };

    expect(JSON.parse(JSON.stringify(response))).toEqual(response);
  });
});
