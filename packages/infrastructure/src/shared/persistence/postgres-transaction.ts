import { Transaction, type TransactionRunner } from '@rei/application';

import type { DatabaseClient, DatabaseConnection } from './database-connection.js';
import { redactConnectionError } from './redact.js';

class PostgresTransaction extends Transaction {
  #active = true;

  public constructor(
    private readonly owner: object,
    private readonly client: DatabaseClient,
  ) {
    super();
  }

  public assertClient(owner: object): DatabaseClient {
    if (!this.#active || owner !== this.owner) {
      throw new Error('The PostgreSQL transaction scope is inactive or belongs to another pool.');
    }
    return this.client;
  }

  public deactivate(): void {
    this.#active = false;
  }
}

export function postgresClientFor(
  transaction: Transaction,
  connection: DatabaseConnection,
): DatabaseClient {
  if (!(transaction instanceof PostgresTransaction)) {
    throw new Error('A PostgreSQL adapter requires its own PostgreSQL transaction scope.');
  }

  return transaction.assertClient(connection.transactionIdentity());
}

export class PostgresTransactionRunner implements TransactionRunner {
  public constructor(private readonly connection: DatabaseConnection) {}

  public async runInTransaction<TResult>(
    work: (transaction: Transaction) => Promise<TResult>,
    signal?: AbortSignal,
  ): Promise<TResult> {
    signal?.throwIfAborted();
    const lease = this.connection.leaseClient();
    let removeCheckoutAbort = (): void => {};
    const checkoutAborted = new Promise<never>((_resolve, reject) => {
      if (!signal) return;
      const onAbort = (): void => reject(signal.reason);
      signal.addEventListener('abort', onAbort, { once: true });
      removeCheckoutAbort = () => signal.removeEventListener('abort', onAbort);
    });

    let client: DatabaseClient;
    try {
      client = signal ? await Promise.race([lease, checkoutAborted]) : await lease;
    } catch (error) {
      if (signal?.aborted) {
        void lease.then(
          (lateClient) => lateClient.release(true),
          () => undefined,
        );
        throw signal.reason;
      }
      throw redactConnectionError(error);
    } finally {
      removeCheckoutAbort();
    }

    const transaction = new PostgresTransaction(this.connection.transactionIdentity(), client);
    let begun = false;
    let commitAcknowledged = false;
    let destroyed = false;
    let removeAbort = (): void => {};
    const aborted = new Promise<never>((_resolve, reject) => {
      if (!signal) return;
      const onAbort = (): void => {
        if (!destroyed) {
          destroyed = true;
          client.release(true);
        }
        reject(signal.reason);
      };
      signal.addEventListener('abort', onAbort, { once: true });
      removeAbort = () => signal.removeEventListener('abort', onAbort);
      if (signal.aborted) onAbort();
    });
    const abortable = async <T>(operation: Promise<T>): Promise<T> =>
      signal ? Promise.race([operation, aborted]) : operation;

    try {
      signal?.throwIfAborted();
      await abortable(client.query('BEGIN'));
      begun = true;
      const result = await abortable(work(transaction));
      signal?.throwIfAborted();
      await abortable(client.query('COMMIT'));
      commitAcknowledged = true;
      transaction.deactivate();
      if (signal?.aborted) {
        // PostgreSQL already acknowledged COMMIT, so cancellation cannot prove a rollback.
        return result;
      }
      return result;
    } catch (error) {
      if (begun && !destroyed && !commitAcknowledged) {
        try {
          await client.query('ROLLBACK');
        } catch {
          // Preserve the original, already redacted operation failure.
        }
      }
      transaction.deactivate();
      if (signal?.aborted) throw signal.reason;
      throw redactConnectionError(error);
    } finally {
      removeAbort();
      if (!destroyed) client.release();
    }
  }
}
