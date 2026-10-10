import { Pool } from 'pg';

import { redactConnectionError } from './redact.js';

/** Infrastructure-only SQL surface that keeps the pg client type out of declarations. */
export interface DatabaseClient {
  query<TRow extends object>(
    statement: string,
    parameters?: readonly unknown[],
  ): Promise<readonly TRow[]>;
  release(): void;
}

/**
 * Owns the PostgreSQL connection pool.
 *
 * The `pg` types stay inside this class on purpose: if the applications
 * imported `Pool` directly, a vendor type would cross into the layer that is
 * supposed to depend on ports only.
 */
export class DatabaseConnection {
  readonly #pool: Pool;
  readonly #identity = Object.freeze({ connection: Symbol('postgres-connection') });

  /**
   * @param onIdleClientError receives errors raised on idle connections, which
   * happen outside any query and therefore cannot be surfaced to a caller.
   */
  public constructor(
    connectionString: string,
    onIdleClientError: (error: Error) => void = () => {},
    queryTimeoutMs = 5_000,
  ) {
    this.#pool = new Pool({
      connectionString,
      // A readiness probe must fail fast rather than queue behind a dead server.
      connectionTimeoutMillis: 2_000,
      idleTimeoutMillis: 30_000,
      query_timeout: queryTimeoutMs,
      statement_timeout: queryTimeoutMs,
      max: 10,
    });

    // `pg` emits 'error' on idle clients whenever the server drops the
    // connection — a restart, a failover, or an administrator terminating the
    // backend. Without this listener Node turns it into an unhandled 'error'
    // event and the whole process dies, which would make every database
    // restart an outage.
    this.#pool.on('error', (error) => {
      onIdleClientError(redactConnectionError(error));
    });
  }

  /** Runs a statement and returns the rows it produced. */
  public async query<TRow extends object>(
    statement: string,
    parameters: readonly unknown[] = [],
  ): Promise<TRow[]> {
    try {
      const result = await this.#pool.query<TRow>(statement, [...parameters]);
      return result.rows;
    } catch (error) {
      throw redactConnectionError(error);
    }
  }

  /** Leases a client for infrastructure transaction adapters. Never expose it outside this package. */
  public async leaseClient(): Promise<DatabaseClient> {
    try {
      const client = await this.#pool.connect();
      return {
        query: async <TRow extends object>(
          statement: string,
          parameters: readonly unknown[] = [],
        ): Promise<readonly TRow[]> => {
          const result = await client.query<TRow>(statement, [...parameters]);
          return result.rows;
        },
        release: () => client.release(),
      };
    } catch (error) {
      throw redactConnectionError(error);
    }
  }

  /** Opaque identity used to reject scopes created by another connection. */
  public transactionIdentity(): object {
    return this.#identity;
  }

  /** Releases every connection. */
  public async close(): Promise<void> {
    await this.#pool.end();
  }
}
