import { describe, expect, it, vi } from 'vitest';
import { parsePublishedAddress, type PlaceDetail } from '@rei/domain';
import type { DatabaseConnection } from '../shared/index.js';
import { Transaction } from '@rei/application';
import { PostgresTransactionRunner } from '../shared/persistence/postgres-transaction.js';
import { PostgresPlaceRepository } from './postgres-place.repository.js';
import { PostgresLocationsFacade } from './postgres-locations.facade.js';
import {
  syntheticPlaces,
  supplementaryPlaces,
  SYNTHETIC_READ_METADATA,
} from './synthetic-locations.adapter.js';

function fixture() {
  const calls = vi.fn();
  const details = [...syntheticPlaces(), ...supplementaryPlaces()];
  const database: Pick<DatabaseConnection, 'query'> = {
    async query<T extends object>(
      statement: string,
      parameters: readonly unknown[] = [],
    ): Promise<T[]> {
      calls(statement, parameters);
      if (statement.includes('reference_metadata'))
        return [{ ...SYNTHETIC_READ_METADATA }] as unknown as T[];
      let selected: readonly PlaceDetail[];
      if (statement.includes('p.normalized_street = $1'))
        selected = details.filter(
          (place) => place.id === 'sao-paulo-bela-vista-avenida-exemplo-fictional-block',
        );
      else if (statement.includes('p.public_id = $1'))
        selected = details.filter((place) => place.id === parameters[0]);
      else if (statement.includes('p.parent_id = (SELECT'))
        selected = details.filter((place) => place.parentId === parameters[0]);
      else selected = details.filter((place) => place.parentId === null);
      return selected.map((detail) => ({ detail })) as unknown as T[];
    },
  };
  return {
    calls,
    database,
    repository: new PostgresPlaceRepository(database as DatabaseConnection),
    facade: new PostgresLocationsFacade(database as DatabaseConnection),
  };
}
describe('SQL-backed Locations reference', () => {
  it('reads registered self and descendants in one owned-schema query, including missing and failed scopes', async () => {
    const query = vi.fn(async () => [{ id: 'brazil' }, { id: 'supplementary-block' }]);
    const facade = new PostgresLocationsFacade({ query } as unknown as DatabaseConnection);
    expect(await facade.registeredScopeIds('brazil')).toEqual(['brazil', 'supplementary-block']);
    expect(query).toHaveBeenCalledTimes(1);
    const [sql, parameters] = query.mock.calls[0]! as unknown as [string, unknown[]];
    expect(sql).toContain('WITH RECURSIVE scope');
    expect(sql).not.toMatch(/(?:properties|collection|platform)\./);
    expect(parameters).toEqual(['brazil']);
    query.mockResolvedValueOnce([]);
    expect(await facade.registeredScopeIds('unknown')).toBeNull();
    query.mockRejectedValueOnce(new Error('Unavailable'));
    await expect(facade.registeredScopeIds('brazil')).rejects.toThrow('Unavailable');
  });
  it('uses the existing lease and rejects foreign, inactive and non-PostgreSQL scopes', async () => {
    const address = {
      city: 'São Paulo',
      stateCode: 'SP',
      neighborhood: 'Bela Vista',
      street: 'Av. Exemplo',
    };
    const detail = supplementaryPlaces()[0]!;
    const query = vi.fn(async (sql: string) =>
      sql.includes('WITH RECURSIVE') ? [{ detail }] : [],
    );
    const poolQuery = vi.fn(async () => {
      throw new Error('A second checkout is forbidden.');
    });
    const identity = {};
    const leaseClient = vi.fn(async () => ({ query, release: vi.fn() }));
    const connection = {
      query: poolQuery,
      transactionIdentity: () => identity,
      leaseClient,
    } as unknown as DatabaseConnection;
    const facade = new PostgresLocationsFacade(connection);
    let scope: Transaction | undefined;
    await new PostgresTransactionRunner(connection).runInTransaction(async (transaction) => {
      scope = transaction;
      expect((await facade.resolveFixtureAddress(address, transaction))!.place.id).toBe(detail.id);
      const foreign = new PostgresLocationsFacade({
        ...connection,
        transactionIdentity: () => ({}),
      } as unknown as DatabaseConnection);
      await expect(foreign.resolveFixtureAddress(address, transaction)).rejects.toThrow(
        'belongs to another pool',
      );
    });
    expect(leaseClient).toHaveBeenCalledTimes(1);
    expect(poolQuery).not.toHaveBeenCalled();
    expect(
      query.mock.calls.map(([sql]) => (sql === 'BEGIN' || sql === 'COMMIT' ? sql : 'read')),
    ).toEqual(['BEGIN', 'read', 'COMMIT']);
    const count = query.mock.calls.length;
    await expect(facade.resolveFixtureAddress(address, scope!)).rejects.toThrow('inactive');
    class ForeignScope extends Transaction {}
    await expect(facade.resolveFixtureAddress(address, new ForeignScope())).rejects.toThrow(
      'own PostgreSQL',
    );
    expect(query).toHaveBeenCalledTimes(count);
    expect(poolQuery).not.toHaveBeenCalled();
  });
  it('redacts leased-query errors without falling back to the pool', async () => {
    const inputUri = new URL('postgres://server/test');
    inputUri.username = 'fixture';
    inputUri.password = 'secret';
    const expectedUri = new URL(inputUri);
    expectedUri.username = 'redacted';
    expectedUri.password = 'redacted';
    const query = vi.fn(async (sql: string) => {
      if (sql.includes('WITH RECURSIVE')) throw new Error(`failure ${inputUri.href}`);
      return [];
    });
    const poolQuery = vi.fn();
    const identity = {};
    const connection = {
      query: poolQuery,
      transactionIdentity: () => identity,
      leaseClient: async () => ({ query, release: vi.fn() }),
    } as unknown as DatabaseConnection;
    const facade = new PostgresLocationsFacade(connection);
    await expect(
      new PostgresTransactionRunner(connection).runInTransaction((transaction) =>
        facade.resolveFixtureAddress(
          { city: 'São Paulo', stateCode: 'SP', neighborhood: 'Bela Vista', street: 'Av. Exemplo' },
          transaction,
        ),
      ),
    ).rejects.toThrow(expectedUri.href);
    expect(poolQuery).not.toHaveBeenCalled();
  });
  it('hydrates roots, children, missing IDs, all six crumbs and registered adjacency', async () => {
    const f = fixture();
    expect((await f.repository.roots())[0]!.detail).toEqual(syntheticPlaces()[0]);
    expect((await f.repository.children('sao-paulo')).map((place) => place.detail.id)).toEqual(
      syntheticPlaces()
        .filter((place) => place.kind === 'zone')
        .map((place) => place.id),
    );
    expect(await f.repository.findById('unknown')).toBeNull();
    expect((await f.repository.findById('sao-paulo-bela-vista'))!.detail.adjacentPlaceIds).toEqual([
      'sao-paulo-vila-mariana',
    ]);
    expect(
      (await f.repository.findById('sao-paulo-bela-vista-fictional-block'))!.detail.breadcrumbs,
    ).toHaveLength(6);
    expect(await f.repository.metadata()).toEqual(SYNTHETIC_READ_METADATA);
    for (const [sql] of f.calls.mock.calls) {
      expect(sql).not.toMatch(/(?:properties|collection|platform)\./);
      if (!sql.includes('reference_metadata'))
        expect(sql).toContain('ORDER BY p.sibling_order,p.public_id');
    }
  });
  it('passes only normalized allowlisted street fields as parameters, never number or private data', async () => {
    const f = fixture();
    const input = {
      city: 'São Paulo',
      stateCode: 'SP',
      neighborhood: 'Bela Vista',
      street: 'Av. Exemplo',
      number: 100,
    };
    expect((await f.repository.addressCandidates(parsePublishedAddress(input)))[0]!.detail.id).toBe(
      'sao-paulo-bela-vista-avenida-exemplo-fictional-block',
    );
    expect(f.calls.mock.calls[0]![1]).toEqual(['avenida exemplo', 'bela vista', 'sao paulo', 'sp']);
    expect(f.calls.mock.calls[0]![0]).not.toContain(input.street);
    expect((await f.facade.resolvePublishedAddress(input))!.breadcrumbs).toHaveLength(6);
    expect(await f.facade.resolvePublishedAddress({ ...input, number: 200 })).toBeNull();
  });
  it('delegates facade picker queries and returns detached data', async () => {
    const f = fixture();
    expect((await f.facade.roots()).items).toHaveLength(1);
    const first = (await f.facade.getPlace('sao-paulo-bela-vista'))!;
    Reflect.set(first.place.name, 'en', 'Changed');
    expect((await f.facade.getPlace('sao-paulo-bela-vista'))!.place.name.en).toBe('Bela Vista');
    expect((await f.facade.children('sao-paulo-bela-vista'))!.items).toHaveLength(2);
    const address = {
      city: 'São Paulo',
      stateCode: 'SP',
      neighborhood: 'Bela Vista',
      street: 'Av. Exemplo',
    };
    expect((await f.facade.resolveFixtureAddress(address))!.place.id).toContain('avenida-exemplo');
  });
  it('fails closed on database errors and missing metadata', async () => {
    const broken: Pick<DatabaseConnection, 'query'> = {
      query: async () => {
        throw new Error('Connection unavailable.');
      },
    };
    const facade = new PostgresLocationsFacade(broken as DatabaseConnection);
    await expect(facade.roots()).rejects.toThrow('Connection unavailable.');
    await expect(facade.getPlace('sao-paulo')).rejects.toThrow('Connection unavailable.');
    await expect(facade.children('sao-paulo')).rejects.toThrow('Connection unavailable.');
    await expect(
      facade.resolveFixtureAddress({
        city: 'São Paulo',
        stateCode: 'SP',
        neighborhood: 'Bela Vista',
        street: 'Av. Exemplo',
      }),
    ).rejects.toThrow('Connection unavailable.');
    await expect(
      new PostgresPlaceRepository({
        query: async () => [],
      } as unknown as DatabaseConnection).metadata(),
    ).rejects.toThrow('metadata is unavailable');
  });
});
