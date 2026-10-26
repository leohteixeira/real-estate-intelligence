import { expect, it } from 'vitest';
import {
  PropertiesListingSuppressed,
  parsePropertiesListingSuppressed,
  type PropertiesListingSuppressedPayload,
} from './listing-suppression.events.js';
const id = (n: number) => `0199c8f2-2394-7000-8000-${String(n).padStart(12, '0')}`;
const payload: PropertiesListingSuppressedPayload = {
  causeEventId: id(1),
  suppressionId: id(2),
  sourceId: 'synthetic-data',
  sourceListingId: 'erased',
  listingId: id(3),
  originalPropertyId: id(4),
  listingRevision: 2,
  assignmentRevision: 1,
  changes: [{ previousPropertyId: id(4), propertyId: id(6), previousRevision: 3, revision: 4 }],
};
const event = () =>
  new PropertiesListingSuppressed({
    eventId: id(9),
    aggregateId: id(3),
    occurredAt: '2026-10-25T12:00:00.000Z',
    payload,
  });
it('roundtrips identity-only rekey, final member and pending changes without survivor snapshots', () => {
  expect(parsePropertiesListingSuppressed(JSON.parse(JSON.stringify(event())))).toEqual(event());
  expect(Object.isFrozen(event().payload.changes)).toBe(true);
  expect(Object.isFrozen(event().payload.changes[0])).toBe(true);
  expect(Object.keys(event().payload.changes[0]!).sort()).toEqual([
    'previousPropertyId',
    'previousRevision',
    'propertyId',
    'revision',
  ]);
  expect(
    new PropertiesListingSuppressed({
      ...event(),
      payload: { ...payload, changes: [{ ...payload.changes[0]!, propertyId: null }] },
    }).payload.changes[0]!.propertyId,
  ).toBeNull();
  expect(
    new PropertiesListingSuppressed({
      ...event(),
      aggregateId: payload.suppressionId,
      payload: {
        ...payload,
        listingId: null,
        originalPropertyId: null,
        listingRevision: null,
        assignmentRevision: null,
        changes: [],
      },
    }).payload.changes,
  ).toEqual([]);
});
it('rejects snapshots, extra fields, malformed identities and nonadvancing or duplicate transitions', () => {
  const wire = event();
  const change = payload.changes[0]!;
  const bad = [
    { ...wire, extra: true },
    { ...wire, type: 'properties.listing.removed' },
    { ...wire, version: 2 },
    { ...wire, traceContext: { traceparent: 'bad', extra: true } },
    { ...wire, payload: { ...payload, sourceUrl: 'https://forbidden.invalid' } },
    { ...wire, payload: { ...payload, causeEventId: 'bad' } },
    { ...wire, payload: { ...payload, sourceListingId: '' } },
    { ...wire, payload: { ...payload, sourceId: 'bad/source' } },
    { ...wire, payload: { ...payload, originalPropertyId: null } },
    { ...wire, payload: { ...payload, listingRevision: 0 } },
    { ...wire, payload: { ...payload, assignmentRevision: -1 } },
    { ...wire, payload: { ...payload, changes: [{ ...change, revision: 3 }] } },
    { ...wire, payload: { ...payload, changes: [{ ...change, revision: 3.5 }] } },
    {
      ...wire,
      payload: { ...payload, changes: [{ ...change, propertyId: payload.originalPropertyId }] },
    },
    {
      ...wire,
      payload: { ...payload, changes: [change, { ...change, previousPropertyId: id(10) }] },
    },
    { ...wire, payload: { ...payload, changes: [change, { ...change, propertyId: id(10) }] } },
    { ...wire, payload: { ...payload, changes: [{ ...change, listingStates: [] }] } },
    { ...wire, payload: { ...payload, changes: [{ ...change, minimum: null }] } },
    { ...wire, aggregateId: id(33) },
    { ...wire, payload: { ...payload, listingId: null, originalPropertyId: null } },
    {
      ...wire,
      aggregateId: payload.suppressionId,
      payload: {
        ...payload,
        listingId: null,
        originalPropertyId: null,
        listingRevision: null,
        assignmentRevision: null,
      },
    },
  ];
  for (const value of bad) expect(() => parsePropertiesListingSuppressed(value)).toThrow();
});
