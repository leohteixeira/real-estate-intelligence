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
      connectionTimeoutMillis: 2_500,
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

  it('lets a queued request wait for a lease at least as long as one statement may run', () => {
    // With the former fixed 2 s checkout bound, a read queued behind ten leases running
    // statements of up to 5 s failed with a 500 although every lease would have been returned.
    new DatabaseConnection('postgres://db/app');
    expect(poolMock.options).toMatchObject({
      connectionTimeoutMillis: 5_000,
      statement_timeout: 5_000,
      max: 10,
    });
    new DatabaseConnection('postgres://db/app', () => {}, 500);
    expect(poolMock.options).toMatchObject({ connectionTimeoutMillis: 2_000 });
  });

  it('names the code-less driver timeouts so a failure log can tell them apart', async () => {
    const connection = new DatabaseConnection('postgres://db/app');
    poolMock.query.mockRejectedValueOnce(new Error('timeout exceeded when trying to connect'));
    await expect(connection.query('SELECT 1')).rejects.toMatchObject({
      name: 'DatabasePoolTimeoutError',
    });
    poolMock.query.mockRejectedValueOnce(new Error('Query read timeout'));
    await expect(connection.query('SELECT 1')).rejects.toMatchObject({
      name: 'DatabaseQueryTimeoutError',
    });
    poolMock.connect.mockRejectedValueOnce(new Error('timeout exceeded when trying to connect'));
    await expect(connection.leaseClient()).rejects.toMatchObject({
      name: 'DatabasePoolTimeoutError',
    });
    poolMock.connect.mockResolvedValueOnce({
      query: vi.fn().mockRejectedValue(new Error('Query read timeout')),
      release: vi.fn(),
    });
    await expect((await connection.leaseClient()).query('SELECT 1')).rejects.toMatchObject({
      name: 'DatabaseQueryTimeoutError',
    });
    poolMock.query.mockRejectedValueOnce(new Error('relation "listing" does not exist'));
    await expect(connection.query('SELECT 1')).rejects.toMatchObject({ name: 'Error' });
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

  it('destroys a late checkout without executing SQL when cancellation wins first', async () => {
    const query = vi.fn();
    const release = vi.fn();
    let resolveClient:
      | ((client: { query: typeof query; release: typeof release }) => void)
      | undefined;
    poolMock.connect.mockImplementation(
      () => new Promise((resolve) => (resolveClient = resolve as typeof resolveClient)),
    );
    const connection = new DatabaseConnection('postgres://db/app');
    const controller = new AbortController();

    const pending = connection.queryAbortable('SELECT pg_sleep(30)', [], controller.signal);
    controller.abort(new Error('shutdown'));
    await expect(pending).rejects.toThrow('shutdown');

    resolveClient!({ query, release });
    await vi.waitFor(() => expect(release).toHaveBeenCalledWith(true));
    expect(query).not.toHaveBeenCalled();
    expect(release).toHaveBeenCalledOnce();
  });

  it('destroys an active maintenance lease and preserves the abort reason', async () => {
    let rejectQuery: ((error: Error) => void) | undefined;
    const query = vi.fn(
      () => new Promise((_resolve, reject) => (rejectQuery = reject as (error: Error) => void)),
    );
    const release = vi.fn((destroy?: boolean) => {
      if (destroy) rejectQuery?.(new Error('socket closed'));
    });
    poolMock.connect.mockResolvedValue({ query, release });
    const connection = new DatabaseConnection('postgres://db/app');
    const controller = new AbortController();

    const active = connection.queryAbortable('SELECT pg_sleep(30)', [], controller.signal);
    await vi.waitFor(() => expect(query).toHaveBeenCalledOnce());
    controller.abort(new Error('shutdown'));

    await expect(active).rejects.toThrow('shutdown');
    expect(release).toHaveBeenCalledWith(true);
    expect(release).toHaveBeenCalledOnce();
  });

  it('returns abortable query rows and normally releases exactly once', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{ value: 1 }] });
    const release = vi.fn();
    poolMock.connect.mockResolvedValue({ query, release });
    const connection = new DatabaseConnection('postgres://db/app');

    await expect(
      connection.queryAbortable<{ value: number }>('SELECT $1', [1], new AbortController().signal),
    ).resolves.toEqual([{ value: 1 }]);
    expect(release).toHaveBeenCalledWith();
    expect(release).toHaveBeenCalledOnce();
  });

  it('keeps a stable transaction identity and closes its pool', async () => {
    const connection = new DatabaseConnection('postgres://db/app');

    expect(connection.transactionIdentity()).toBe(connection.transactionIdentity());
    await connection.close();

    expect(poolMock.end).toHaveBeenCalledOnce();
  });
});
