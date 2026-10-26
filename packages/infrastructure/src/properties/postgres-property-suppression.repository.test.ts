import { expect, it, vi } from 'vitest';
import { CollectionListingSuppressed, PropertiesListingSuppressed } from '@rei/domain';
import { DatabaseConnection } from '../shared/persistence/database-connection.js';
import { PostgresTransactionRunner } from '../shared/persistence/postgres-transaction.js';
import { PostgresPropertySuppressionRepository } from './postgres-property-suppression.repository.js';
import { fixtureId, initialProperty } from './property.test-fixture.js';

it.each(['pending', 'replay', 'unassigned', 'anchor', 'member', 'final', 'inactive'] as const)(
  'erases %s ownership and describes only identity/revision transitions',
  async (kind) => {
    const removed = await initialProperty();
    const survivingPropertyId = fixtureId(101);
    const oldGroup = kind === 'member' ? survivingPropertyId : removed.propertyId;
    const hasSurvivors = ['anchor', 'member', 'inactive'].includes(kind);
    const fact = removed.creationEvent(fixtureId(102)).payload.listing;
    const survivor = {
      ...fact,
      listingId: fixtureId(103),
      propertyId: oldGroup,
      sourceListingId: 'survivor',
      provenance: { ...fact.provenance, sourceListingId: 'survivor' },
      status: kind === 'inactive' ? 'removed' : 'active',
    };
    const query = vi.fn(
      async (sql: string, args: readonly unknown[] = []): Promise<readonly object[]> => {
        if (sql.startsWith('SELECT 1 FROM properties.listing_suppression_receipt'))
          return kind === 'replay' ? [{}] : [];
        if (sql.startsWith('SELECT listing.listing_id'))
          return kind === 'pending'
            ? []
            : [
                {
                  listing_id: removed.listingId,
                  property_id: removed.propertyId,
                  revision: 4,
                  assigned_property_id: kind === 'unassigned' ? null : oldGroup,
                  assignment_revision: kind === 'unassigned' ? null : 2,
                },
              ];
        if (sql.startsWith('SELECT assigned.listing_id'))
          return hasSurvivors && args[0] === oldGroup
            ? [
                {
                  listing_id: survivor.listingId,
                  original_property_id: survivingPropertyId,
                  property_id: oldGroup,
                  assignment_revision: 3,
                  processed_revision: 4,
                  market_fact: survivor,
                  state: null,
                  initial_event: { ...removed.initial },
                },
              ]
            : [];
        if (sql.startsWith('SELECT revision')) return [{ revision: args[0] === oldGroup ? 8 : 3 }];
        return [];
      },
    );
    const connection = new DatabaseConnection('postgres://fixture.invalid/suppression');
    vi.spyOn(connection, 'leaseClient').mockResolvedValue({
      query: async <TRow extends object>(sql: string, args?: readonly unknown[]) =>
        (await query(sql, args)) as readonly TRow[],
      release: vi.fn(),
    });
    const publications = { erasePropertiesListingCopies: vi.fn(async () => undefined) };
    const event = new CollectionListingSuppressed({
      eventId: fixtureId(110),
      aggregateId: fixtureId(111),
      occurredAt: '2026-10-25T12:00:00.000Z',
      payload: {
        sourceId: removed.provenance.sourceId,
        sourceListingId: removed.provenance.sourceListingId,
      },
    });
    const result = await new PostgresTransactionRunner(connection).runInTransaction((tx) =>
      new PostgresPropertySuppressionRepository(connection, publications).erase(
        tx,
        event,
        new AbortController().signal,
      ),
    );
    if (kind === 'replay') {
      expect(result).toBeNull();
      expect(publications.erasePropertiesListingCopies).not.toHaveBeenCalled();
    } else {
      const publication = new PropertiesListingSuppressed({
        eventId: fixtureId(112),
        aggregateId: result!.listingId ?? event.aggregateId,
        occurredAt: event.occurredAt,
        payload: result!,
      });
      expect(publication.payload.changes).toHaveLength(kind === 'pending' ? 0 : 1);
      if (hasSurvivors)
        expect(publication.payload.changes[0]).toMatchObject({
          previousPropertyId: oldGroup,
          propertyId: survivingPropertyId,
          previousRevision: 8,
          revision: 9,
        });
      else if (kind !== 'pending')
        expect(publication.payload.changes[0]).toMatchObject({
          propertyId: null,
        });
      for (const change of publication.payload.changes)
        expect(Object.keys(change).sort()).toEqual([
          'previousPropertyId',
          'previousRevision',
          'propertyId',
          'revision',
        ]);
      const statements = query.mock.calls.map(([sql]) => sql);
      expect(statements.at(-2)).toContain('INSERT INTO properties.listing_suppression_receipt');
      expect(statements.join('\n')).not.toMatch(/(?:DELETE|UPDATE) (?:collection|audit|market)\./);
      expect(statements.join('\n')).not.toContain('DELETE FROM properties.source_work');
      if (kind === 'anchor')
        expect(
          statements.findIndex((sql) =>
            sql.startsWith('UPDATE properties.listing_assignment SET property_id'),
          ),
        ).toBeLessThan(statements.indexOf('DELETE FROM properties.property WHERE property_id=$1'));
    }
    await connection.close();
  },
);
