import { ResilientListingSource } from '../../apps/worker/dist/collection/resilient-listing-source.js';
import { ListingSourceAccessRefusal } from '../../packages/application/dist/index.js';
import {
  DatabaseConnection,
  PostgresCollectionRunRepository,
  PostgresSourceRegisterRepository,
} from '../../packages/infrastructure/dist/index.js';
import { preserveCleanup } from '../support/cleanup.ts';

const databaseUrl = process.env.RESILIENCE_FIXTURE_DATABASE_URL;
const operationKey = process.env.RESILIENCE_FIXTURE_OPERATION_KEY;
if (!databaseUrl || !operationKey)
  throw new Error('The restart probe requires its owned fixture configuration.');
const connection = new DatabaseConnection(databaseUrl);
await preserveCleanup(
  async () => {
    let requests = 0;
    const adapter = {
      fetchPage: async () => {
        requests++;
        throw new Error('Held adapter must not be reached.');
      },
      parse: async () => {
        throw new Error('Held parser must not be reached.');
      },
    };
    const sources = new PostgresSourceRegisterRepository(connection);
    let refused = false;
    try {
      await new ResilientListingSource(adapter, sources).fetchPage(
        'synthetic-portal-aurora',
        null,
        AbortSignal.timeout(15_000),
      );
    } catch (error) {
      if (!(error instanceof ListingSourceAccessRefusal)) throw error;
      refused = true;
    }
    const runs = new PostgresCollectionRunRepository(connection);
    const run = await runs.loadRunByOperationKey(operationKey, AbortSignal.timeout(15_000));
    console.log(
      JSON.stringify({ refused, requests, status: run!.status, ordinal: run!.checkpoint.ordinal }),
    );
  },
  async () => {
    await connection.close();
  },
);
