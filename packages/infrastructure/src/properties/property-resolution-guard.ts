import type { Transaction } from '@rei/application';
import type { DatabaseConnection } from '../shared/persistence/database-connection.js';
import { postgresClientFor } from '../shared/persistence/postgres-transaction.js';
/** Writers acquire source identity first; the resolver never requests a source identity lock. */
export async function lockPropertyResolution(
  transaction: Transaction,
  connection: DatabaseConnection,
): Promise<void> {
  await postgresClientFor(transaction, connection).query(
    "SELECT pg_advisory_xact_lock(hashtextextended('properties.entity-resolution', 0))",
  );
}
