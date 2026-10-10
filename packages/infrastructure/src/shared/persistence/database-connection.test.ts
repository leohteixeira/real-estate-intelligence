import { beforeEach, describe, expect, it, vi } from 'vitest';

const poolMock = vi.hoisted(() => ({
  connect: vi.fn(),
  end: vi.fn(),
  handlers: new Map<string, (error: Error) => void>(),
  options: undefined as unknown,
  query: vi.fn(),
}));

vi.mock('pg', () => ({
  Pool: class PoolDouble {
    public constructor(options: unknown) {
      poolMock.options = options;
    }

    public on(event: string, handler: (error: Error) => void): void {
      poolMock.handlers.set(event, handler);
    }

    public query(statement: string, parameters: readonly unknown[]): Promise<unknown> {
      return poolMock.query(statement, parameters);
    }

    public connect(): Promise<unknown> {
      return poolMock.connect();
    }

    public end(): Promise<void> {
      return poolMock.end();
    }
  },
}));

import { DatabaseConnection } from './database-connection.js';

describe('DatabaseConnection', () => {
  beforeEach(() => {
    poolMock.connect.mockReset();
    poolMock.end.mockReset().mockResolvedValue(undefined);
    poolMock.handlers.clear();
    poolMock.options = undefined;
    poolMock.query.mockReset();
  });

  it('configures a bounded pool and reports redacted idle-client failures', () => {
    const onIdleClientError = vi.fn();

    new DatabaseConnection('postgres://app:secret@db:5432/app', onIdleClientError, 2_500);

    expect(poolMock.options).toMatchObject({
      connectionString: 'postgres://app:secret@db:5432/app',
      connectionTimeoutMillis: 2_000,
      idleTimeoutMillis: 30_000,
      query_timeout: 2_500,
      statement_timeout: 2_500,
      max: 10,
    });
    poolMock.handlers.get('error')?.(new Error('failed postgres://app:secret@db:5432/app'));
    expect(onIdleClientError).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'failed postgres://redacted:redacted@db:5432/app' }),
    );
  });

  it('returns query rows and keeps the caller parameters immutable', async () => {
    const parameters = Object.freeze(['active']);
    poolMock.query.mockResolvedValue({ rows: [{ id: 'listing-1' }] });
    const connection = new DatabaseConnection('postgres://db/app');

    await expect(
      connection.query<{ id: string }>('SELECT id FROM listing WHERE state = $1', parameters),
    ).resolves.toEqual([{ id: 'listing-1' }]);
    expect(poolMock.query).toHaveBeenCalledWith('SELECT id FROM listing WHERE state = $1', [
      'active',
    ]);
  });

  it('redacts query and pool-lease failures', async () => {
    const connection = new DatabaseConnection('postgres://db/app');
    poolMock.query.mockRejectedValueOnce(new Error('postgres://app:secret@db/app'));
    poolMock.connect.mockRejectedValueOnce('pool unavailable');

    await expect(connection.query('SELECT 1')).rejects.toThrow(
      'postgres://redacted:redacted@db/app',
    );
    await expect(connection.leaseClient()).rejects.toThrow('pool unavailable');
  });

  it('leases a wrapped client, returns its rows, and releases it', async () => {
    const clientQuery = vi.fn().mockResolvedValue({ rows: [{ value: 1 }] });
    const release = vi.fn();
    poolMock.connect.mockResolvedValue({ query: clientQuery, release });
    const connection = new DatabaseConnection('postgres://db/app');

    const client = await connection.leaseClient();
    await expect(client.query<{ value: number }>('SELECT $1', [1])).resolves.toEqual([
      { value: 1 },
    ]);
    client.release();

    expect(clientQuery).toHaveBeenCalledWith('SELECT $1', [1]);
    expect(release).toHaveBeenCalledOnce();
  });

  it('keeps a stable transaction identity and closes its pool', async () => {
    const connection = new DatabaseConnection('postgres://db/app');

    expect(connection.transactionIdentity()).toBe(connection.transactionIdentity());
    await connection.close();

    expect(poolMock.end).toHaveBeenCalledOnce();
  });
});
