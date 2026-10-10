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
  ): Promise<TResult> {
    const client = await this.connection.leaseClient();
    const transaction = new PostgresTransaction(this.connection.transactionIdentity(), client);
    let begun = false;

    try {
      await client.query('BEGIN');
      begun = true;
      const result = await work(transaction);
      await client.query('COMMIT');
      transaction.deactivate();
      return result;
    } catch (error) {
      if (begun) {
        try {
          await client.query('ROLLBACK');
        } catch {
          // Preserve the original, already redacted operation failure.
        }
      }
      transaction.deactivate();
      throw redactConnectionError(error);
    } finally {
      client.release();
    }
  }
}
