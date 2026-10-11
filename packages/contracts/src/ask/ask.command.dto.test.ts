import { describe, expect, it } from 'vitest';
import {
  parseAskAccepted,
  parseAskCancelRequest,
  parseAskCommandHeaders,
  parseAskCreateRequest,
  parseAskConfirmRequest,
  parseAskQuotaRejection,
} from './ask.command.dto.js';

describe('future Ask command contracts', () => {
  const create = {
    threadId: null,
    placeId: null,
    query: 'What is the asking price per square meter?',
    locale: 'en',
  };
  it('round-trips bounded create shapes without dispatch', () => {
    expect(parseAskCreateRequest(create)).toEqual(create);
    for (const query of ['', '   ', 'a'.repeat(16001)])
      expect(() => parseAskCreateRequest({ ...create, query })).toThrow('Invalid contract value.');
  });
  it('rejects nested edited input units and unsafe amounts', () => {
    const input = {
      intent: 'price_per_square_meter',
      inputs: { priceMinorUnits: 10000, currency: 'BRL', areaSquareMeters: 100 },
    };
    expect(parseAskConfirmRequest(input)).toEqual(input);
    expect(() =>
      parseAskConfirmRequest({ ...input, inputs: { ...input.inputs, currency: 'USD' } }),
    ).toThrow(TypeError);
  });
  it('includes quota scope and a real UTC reopening instant', () => {
    const quota = {
      code: 'quota_exceeded',
      scope: 'visitor',
      reopensAt: '2026-10-12T00:00:00.000Z',
    };
    expect(parseAskQuotaRejection(quota)).toEqual(quota);
    expect(() => parseAskQuotaRejection({ ...quota, reopensAt: 'tomorrow' })).toThrow(TypeError);
    expect(parseAskQuotaRejection({ ...quota, scope: 'global' }).scope).toBe('global');
  });
  it('closes accepted and cancel shapes and rejects extra or missing create fields', () => {
    const id = '0199c8f2-2394-7000-8000-000000000001';
    const accepted = {
      runId: id,
      threadId: id,
      capability: 'ask-fixture-v1-queued',
      state: 'queued',
    };
    expect(parseAskAccepted(accepted)).toEqual(accepted);
    expect(parseAskCommandHeaders({ idempotencyKey: id })).toEqual({ idempotencyKey: id });
    expect(() => parseAskCommandHeaders({ idempotencyKey: 'short' })).toThrow(TypeError);
    expect(parseAskCancelRequest({ reason: 'visitor_cancelled' })).toEqual({
      reason: 'visitor_cancelled',
    });
    expect(() => parseAskCancelRequest({ reason: 'private reason' })).toThrow(TypeError);
    expect(() => parseAskAccepted({ ...accepted, state: 'running' })).toThrow(TypeError);
    expect(() => parseAskCreateRequest({ ...create, private: true })).toThrow(TypeError);
    expect(() => parseAskCreateRequest({ query: create.query, locale: create.locale })).toThrow(
      TypeError,
    );
    expect(
      parseAskCreateRequest({
        ...create,
        query: 'a'.repeat(16000),
        threadId: id,
        placeId: 'sao-paulo',
        locale: 'pt-BR',
      }).query,
    ).toHaveLength(16000);
  });
});
