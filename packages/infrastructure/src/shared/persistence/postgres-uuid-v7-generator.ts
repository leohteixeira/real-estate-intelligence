import type { Transaction, UuidV7Generator } from '@rei/application';
import { parseUuidV7, type UuidV7 } from '@rei/domain';

import type { DatabaseConnection } from './database-connection.js';
import { postgresClientFor } from './postgres-transaction.js';
import { redactConnectionError } from './redact.js';

export class PostgresUuidV7Generator implements UuidV7Generator {
  public constructor(private readonly connection: DatabaseConnection) {}

  public async generate(transaction: Transaction): Promise<UuidV7> {
    const client = postgresClientFor(transaction, this.connection);
    try {
      const rows = await client.query<{ id: string }>('SELECT uuidv7()::text AS id');
      if (rows.length !== 1 || typeof rows[0]?.id !== 'string') {
        throw new Error('PostgreSQL returned an invalid UUID result.');
      }
      return parseUuidV7(rows[0].id);
    } catch (error) {
      throw redactConnectionError(error);
    }
  }
}
