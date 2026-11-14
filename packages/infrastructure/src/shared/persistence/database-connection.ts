import { Pool, type PoolClient } from 'pg';

import { redactConnectionError } from './redact.js';

/** Infrastructure-only SQL surface that keeps the pg client type out of declarations. */
export interface DatabaseClient {
  query<TRow extends object>(
    statement: string,
    parameters?: readonly unknown[],
  ): Promise<readonly TRow[]>;
  release(destroy?: boolean): void;
}

/**
 * `pg` reports its pool-checkout and client-read bounds as plain, code-less `Error`s. A stable
 * name lets a failure log tell an exhausted pool from a slow statement without logging messages.
 */
function nameDriverTimeout<TError>(error: TError): TError {
  if (error instanceof Error) {
    if (error.message === 'timeout exceeded when trying to connect')
      error.name = 'DatabasePoolTimeoutError';
    else if (error.message === 'Query read timeout') error.name = 'DatabaseQueryTimeoutError';
  }
  return error;
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
      // This bound also covers waiting for a free lease. A request queued behind ten leases that
      // may each legitimately run for the statement timeout must not fail sooner than they can
      // finish; the readiness probe keeps failing fast through its own abort signal.
      connectionTimeoutMillis: Math.max(2_000, queryTimeoutMs),
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
      throw redactConnectionError(nameDriverTimeout(error));
    }
  }

  /**
   * Runs maintenance SQL on a disposable lease. Aborting destroys that lease so PostgreSQL
   * cancels active work; a lease delivered after an already-aborted checkout is destroyed too.
   */
  public async queryAbortable<TRow extends object>(
    statement: string,
    parameters: readonly unknown[],
    signal: AbortSignal,
  ): Promise<TRow[]> {
    const reason = (): Error =>
      signal.reason instanceof Error ? signal.reason : new Error('Database query was aborted.');
    signal.throwIfAborted();

    const checkout = this.#pool.connect();
    let removeCheckoutAbort = (): void => {};
    const checkoutAborted = new Promise<never>((_resolve, reject) => {
      const onAbort = (): void => reject(reason());
      signal.addEventListener('abort', onAbort, { once: true });
      removeCheckoutAbort = () => signal.removeEventListener('abort', onAbort);
    });

    let client: PoolClient;
    try {
      client = await Promise.race([checkout, checkoutAborted]);
    } catch (error) {
      if (signal.aborted) {
        void checkout.then(
          (lateClient) => lateClient.release(true),
          () => undefined,
        );
        throw reason();
      }
      throw redactConnectionError(nameDriverTimeout(error));
    } finally {
      removeCheckoutAbort();
    }

    let destroyed = false;
    const onAbort = (): void => {
      if (!destroyed) {
        destroyed = true;
        client.release(true);
      }
    };
    signal.addEventListener('abort', onAbort, { once: true });
    if (signal.aborted) onAbort();

    try {
      if (signal.aborted) throw reason();
      const result = await client.query<TRow>(statement, [...parameters]);
      if (signal.aborted) throw reason();
      return result.rows;
    } catch (error) {
      if (signal.aborted) throw reason();
      throw redactConnectionError(nameDriverTimeout(error));
    } finally {
      signal.removeEventListener('abort', onAbort);
      if (!destroyed) client.release();
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
          try {
            const result = await client.query<TRow>(statement, [...parameters]);
            return result.rows;
          } catch (error) {
            throw nameDriverTimeout(error);
          }
        },
        release: (destroy = false) => client.release(destroy),
      };
    } catch (error) {
      throw redactConnectionError(nameDriverTimeout(error));
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
